import PayrollRun from "../models/PayrollRunSchema.js";
import SalaryStructure from "../models/SalaryStructureSchema.js";
import Attendance from "../models/AttendanceSchema.js";
import LeaveApplication from "../models/LeaveApplicationSchema.js";
import LeaveType from "../models/leaveTypeSchema.js";
import User from "../models/UserSchema.js";
import Holiday from "../models/HolidaySchema.js";
import { createNotification } from "../utills/notificationHelper.js";

// Count total working days in a month (excluding weekends + holidays)
const getWorkingDays = async (month, companyId, weekOff = [0, 6]) => {
    const [year, mon] = month.split("-").map(Number);
    const daysInMonth = new Date(year, mon, 0).getDate();
    const holidays = await Holiday.find({
        companyId,
        date: { $regex: `^${month}` },
    }).select("date").lean();
    const holidaySet = new Set(holidays.map(h => h.date));

    let count = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${month}-${String(d).padStart(2, "0")}`;
        const dow = new Date(dateStr).getDay();
        if (!weekOff.includes(dow) && !holidaySet.has(dateStr)) count++;
    }
    return count;
};

// POST /api/payroll/run  — generate payroll for a month (all or one employee)
export const generatePayroll = async (req, res) => {
    try {
        const { month, userId: targetUserId } = req.body;
        if (!month) return res.status(400).json({ message: "month is required (YYYY-MM)", success: false });

        const reqUser = await User.findById(req.user.userId).select("companyId role").populate("role", "name");
        
        // Fetch employees to process
        const userFilter = { isActive: true };
        if (reqUser.role?.name !== "super_admin") {
            userFilter.companyId = reqUser.companyId;
        }
        if (targetUserId) userFilter._id = targetUserId;
        const employees = await User.find(userFilter).select("_id workShift companyId").lean();

        if (employees.length === 0) {
            return res.status(200).json({ generated: 0, skipped: 0, errors: [], message: "No active employees found for this company", success: true });
        }

        const results = { generated: 0, skipped: 0, errors: [] };

        for (const emp of employees) {
            try {
                // Skip if already generated
                const existing = await PayrollRun.findOne({ userId: emp._id, month });
                if (existing) { results.skipped++; continue; }

                // Get active salary structure
                const structure = await SalaryStructure.findOne({ userId: emp._id, isActive: true });
                if (!structure) { results.skipped++; results.skippedReasons = results.skippedReasons || []; results.skippedReasons.push({ userId: emp._id, reason: "No active salary structure" }); continue; }

                // Get week-off from work shift
                const WorkShift = (await import("../models/workShiftSchema.js")).default;
                const shift = emp.workShift ? await WorkShift.findById(emp.workShift).select("weekOff").lean() : null;
                const weekOff = shift?.weekOff || [0, 6];

                const totalWorkingDays = await getWorkingDays(month, emp.companyId, weekOff);
                if (!totalWorkingDays || totalWorkingDays === 0) { results.skipped++; continue; }

                // Get attendance for the month
                const attendanceRecords = await Attendance.find({
                    userId: emp._id,
                    date: { $regex: `^${month}` },
                }).lean();

                const presentStatuses = ["present", "late", "early-leave", "regularized"];
                let presentDays = 0, absentDays = 0, halfDays = 0;

                attendanceRecords.forEach(r => {
                    if (r.status === "half-day") halfDays++;
                    else if (presentStatuses.includes(r.status)) presentDays++;
                    else if (r.status === "absent") absentDays++;
                });

                // Get paid leave days for the month
                const paidLeaveTypes = await LeaveType.find({ companyId: emp.companyId, isPaid: true }).select("_id").lean();
                const paidLeaveTypeIds = paidLeaveTypes.map(l => l._id.toString());

                const approvedLeaves = await LeaveApplication.find({
                    userId: emp._id,
                    status: "approved",
                    fromDate: { $lte: `${month}-31` },
                    toDate:   { $gte: `${month}-01` },
                }).populate("leaveTypeId", "isPaid").lean();

                let paidLeaveDays = 0;
                approvedLeaves.forEach(l => {
                    if (l.leaveTypeId?.isPaid) paidLeaveDays += l.days;
                });

                // Auto-calculate absent days from working days if no attendance records
                const attendedDays = presentDays + halfDays * 0.5;
                const calculatedAbsent = absentDays === 0 && presentDays === 0
                    ? Math.max(0, totalWorkingDays - paidLeaveDays)
                    : absentDays;

                // LOP = absent days not covered by paid leave
                const effectivePaidLeave = Math.min(paidLeaveDays, calculatedAbsent);
                let lopDays = parseFloat((Math.max(0, calculatedAbsent - effectivePaidLeave) + (halfDays * 0.5)).toFixed(2));

                // Cap LOP days to total working days to prevent negative salaries from over-attendance
                if (lopDays > totalWorkingDays) {
                    lopDays = totalWorkingDays;
                }

                // Compute salary components
                const grossForCalc = structure.grossEarnings > 0 ? structure.grossEarnings : structure.basic;
                const perDaySalary = grossForCalc / totalWorkingDays;
                
                let lopDeduction = parseFloat((lopDays * perDaySalary).toFixed(2));

                // Build component list with resolved amounts
                const components = [
                    { name: "Basic", type: "earning", amount: structure.basic },
                    ...structure.components.map(c => ({
                        name: c.name,
                        type: c.type,
                        amount: c.calcType === "percentage"
                            ? parseFloat(((c.value / 100) * structure.basic).toFixed(2))
                            : c.value,
                    })),
                ];

                if (lopDeduction > 0) {
                    components.push({ name: "Loss of Pay (LOP)", type: "deduction", amount: lopDeduction });
                }

                const grossEarnings = components.filter(c => c.type === "earning").reduce((s, c) => s + c.amount, 0);
                const totalDeductions = components.filter(c => c.type === "deduction").reduce((s, c) => s + c.amount, 0);
                const netSalary = parseFloat((grossEarnings - totalDeductions).toFixed(2));

                await PayrollRun.create({
                    userId: emp._id,
                    companyId: emp.companyId,
                    salaryStructureId: structure._id,
                    month,
                    totalWorkingDays,
                    presentDays,
                    absentDays: calculatedAbsent,
                    halfDays,
                    paidLeaveDays: effectivePaidLeave,
                    lopDays,
                    components,
                    grossEarnings: parseFloat(grossEarnings.toFixed(2)),
                    totalDeductions: parseFloat(totalDeductions.toFixed(2)),
                    lopDeduction,
                    netSalary,
                    status: "draft",
                    createdBy: req.user.userId,
                });

                results.generated++;
            } catch (e) {
                results.errors.push({ userId: emp._id, error: e.message });
            }
        }

        const msg = results.generated === 0 && results.skipped > 0
            ? `Payroll skipped for all ${results.skipped} employee(s). Ensure salary structures are defined.`
            : `Payroll generated: ${results.generated} record(s)${results.skipped > 0 ? `, ${results.skipped} skipped` : ""}`;

        res.status(200).json({ ...results, message: msg, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// GET /api/payroll/run?month=2025-06
export const getPayrollRuns = async (req, res) => {
    try {
        const { month, status } = req.query;
        const reqUser = await User.findById(req.user.userId).select("companyId role").populate("role", "name");
        const filter = {};
        if (reqUser.role?.name !== "super_admin") filter.companyId = reqUser.companyId;
        if (month) filter.month = month;
        if (status) filter.status = status;

        const runs = await PayrollRun.find(filter)
            .populate({
                path: "userId",
                select: "firstName lastName employeeCode profilePic joiningDate department designation address",
                populate: [
                    { path: "department", select: "name" },
                    { path: "designation", select: "name" },
                ],
            })
            .populate("approvedBy", "firstName lastName")
            .sort({ month: -1, createdAt: -1 });

        res.status(200).json({ runs, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// GET /api/payroll/my?month=2025-06  — employee sees own payslips
export const getMyPayslips = async (req, res) => {
    try {
        const { month } = req.query;
        const filter = { userId: req.user.userId };
        if (month) filter.month = month;

        const runs = await PayrollRun.find(filter)
            .populate({
                path: "userId",
                select: "firstName lastName employeeCode profilePic joiningDate department designation address",
                populate: [
                    { path: "department", select: "name" },
                    { path: "designation", select: "name" },
                ],
            })
            .populate("salaryStructureId", "ctc basic")
            .populate("approvedBy", "firstName lastName")
            .sort({ month: -1 });

        res.status(200).json({ runs, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// PATCH /api/payroll/run/:id/approve
export const approvePayroll = async (req, res) => {
    try {
        const run = await PayrollRun.findById(req.params.id);
        if (!run) return res.status(404).json({ message: "Payroll record not found", success: false });
        if (run.status !== "draft") return res.status(400).json({ message: "Only draft payroll can be approved", success: false });

        run.status = "approved";
        run.approvedBy = req.user.userId;
        run.approvedAt = new Date();
        run.updatedBy = req.user.userId;
        await run.save();

        await createNotification({
            userId: run.userId,
            title: "Payslip Approved ✅",
            message: `Your payslip for ${run.month} has been approved. Net salary: ₹${run.netSalary.toLocaleString("en-IN")}.`,
            type: "user", link: "/payroll", createdBy: req.user.userId,
        });

        res.status(200).json({ message: "Payroll approved", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// PATCH /api/payroll/run/bulk-approve  — approve all drafts for a month
export const bulkApprovePayroll = async (req, res) => {
    try {
        const { month } = req.body;
        if (!month) return res.status(400).json({ message: "month is required", success: false });

        const reqUser = await User.findById(req.user.userId).select("companyId");
        const result = await PayrollRun.updateMany(
            { companyId: reqUser.companyId, month, status: "draft" },
            { $set: { status: "approved", approvedBy: req.user.userId, approvedAt: new Date(), updatedBy: req.user.userId } }
        );

        res.status(200).json({ updated: result.modifiedCount, message: `${result.modifiedCount} payroll records approved`, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// PATCH /api/payroll/run/:id/mark-paid
export const markPayrollPaid = async (req, res) => {
    try {
        const run = await PayrollRun.findById(req.params.id);
        if (!run) return res.status(404).json({ message: "Payroll record not found", success: false });
        if (run.status !== "approved") return res.status(400).json({ message: "Only approved payroll can be marked as paid", success: false });

        run.status = "paid";
        run.paidAt = new Date();
        run.updatedBy = req.user.userId;
        await run.save();

        await createNotification({
            userId: run.userId,
            title: "Salary Credited 💰",
            message: `Your salary of ₹${run.netSalary.toLocaleString("en-IN")} for ${run.month} has been processed.`,
            type: "user", link: "/payroll", createdBy: req.user.userId,
        });

        res.status(200).json({ message: "Payroll marked as paid", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// PATCH /api/payroll/run/bulk-mark-paid
export const bulkMarkPaid = async (req, res) => {
    try {
        const { month } = req.body;
        if (!month) return res.status(400).json({ message: "month is required", success: false });

        const reqUser = await User.findById(req.user.userId).select("companyId");
        const result = await PayrollRun.updateMany(
            { companyId: reqUser.companyId, month, status: "approved" },
            { $set: { status: "paid", paidAt: new Date(), updatedBy: req.user.userId } }
        );

        res.status(200).json({ updated: result.modifiedCount, message: `${result.modifiedCount} payroll records marked as paid`, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// DELETE /api/payroll/run/:id  — delete draft only
export const deletePayrollRun = async (req, res) => {
    try {
        const run = await PayrollRun.findById(req.params.id);
        if (!run) return res.status(404).json({ message: "Payroll record not found", success: false });
        if (run.status !== "draft") return res.status(400).json({ message: "Only draft payroll can be deleted", success: false });
        await run.deleteOne();
        res.status(200).json({ message: "Payroll record deleted", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// GET /api/payroll/summary?month=2025-06  — aggregate stats
export const getPayrollSummary = async (req, res) => {
    try {
        const { month } = req.query;
        if (!month) return res.status(400).json({ message: "month is required", success: false });

        const reqUser = await User.findById(req.user.userId).select("companyId");
        const runs = await PayrollRun.find({ companyId: reqUser.companyId, month }).lean();

        const summary = {
            total: runs.length,
            draft: runs.filter(r => r.status === "draft").length,
            approved: runs.filter(r => r.status === "approved").length,
            paid: runs.filter(r => r.status === "paid").length,
            totalGross: parseFloat(runs.reduce((s, r) => s + r.grossEarnings, 0).toFixed(2)),
            totalDeductions: parseFloat(runs.reduce((s, r) => s + r.totalDeductions, 0).toFixed(2)),
            totalNet: parseFloat(runs.reduce((s, r) => s + r.netSalary, 0).toFixed(2)),
        };

        res.status(200).json({ summary, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// PATCH /api/payroll/run/:id/adjustment  — manual adjustment
export const addManualAdjustment = async (req, res) => {
    try {
        const { name, type, amount } = req.body;
        if (!name || !type || !amount) {
            return res.status(400).json({ message: "Name, type, and amount are required", success: false });
        }
        
        const numAmount = parseFloat(Number(amount).toFixed(2));
        if (numAmount <= 0) {
            return res.status(400).json({ message: "Amount must be greater than zero", success: false });
        }

        const run = await PayrollRun.findById(req.params.id);
        if (!run) return res.status(404).json({ message: "Payroll record not found", success: false });
        if (run.status !== "draft") return res.status(400).json({ message: "Only draft payroll can be manually adjusted", success: false });

        run.components.push({
            name,
            type, // "earning" or "deduction"
            amount: numAmount
        });

        // Recalculate totals
        const grossEarnings = run.components.filter(c => c.type === "earning").reduce((s, c) => s + c.amount, 0);
        const totalDeductions = run.components.filter(c => c.type === "deduction").reduce((s, c) => s + c.amount, 0);
        
        run.grossEarnings = parseFloat(grossEarnings.toFixed(2));
        run.totalDeductions = parseFloat(totalDeductions.toFixed(2));
        run.netSalary = parseFloat((grossEarnings - totalDeductions).toFixed(2));
        run.updatedBy = req.user.userId;

        await run.save();
        res.status(200).json({ message: "Adjustment added successfully", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};
