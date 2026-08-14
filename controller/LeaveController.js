import LeaveApplication from "../models/LeaveApplicationSchema.js";
import LeaveBalance from "../models/LeaveBalanceSchema.js";
import LeaveType from "../models/leaveTypeSchema.js";
import Holiday from "../models/HolidaySchema.js";
import User from "../models/UserSchema.js";
import { createNotification } from "../utills/notificationHelper.js";
import { getSubordinateIds } from "../utills/hierarchyHelper.js";

// ── helpers ───────────────────────────────────────────────────────────────────
const getUser = (userId) => User.findById(userId).select("companyId role").populate("role", "name");

const countWorkingDays = async (fromDate, toDate, companyId, weekOff = [0, 6]) => {
    const holidays = await Holiday.find({ companyId, date: { $gte: fromDate, $lte: toDate } }).select("date");
    const holidaySet = new Set(holidays.map(h => h.date));
    let count = 0;
    const cur = new Date(fromDate);
    const end = new Date(toDate);
    while (cur <= end) {
        const day = cur.getDay();
        const ds = cur.toISOString().split("T")[0];
        if (!weekOff.includes(day) && !holidaySet.has(ds)) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count;
};

// ── Leave Balance ─────────────────────────────────────────────────────────────

// GET /api/leaves/balance?year=2025
export const getMyBalance = async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const balances = await LeaveBalance.find({ userId: req.user.userId, year })
            .populate("leaveTypeId", "name code isPaid defaultDays");
        res.status(200).json({ balances, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// GET /api/leaves/balance/user/:userId?year=2025  (admin)
export const getUserBalance = async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const balances = await LeaveBalance.find({ userId: req.params.userId, year })
            .populate("leaveTypeId", "name code isPaid defaultDays")
            .populate("userId", "firstName lastName employeeCode");
        res.status(200).json({ balances, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// POST /api/leaves/balance/assign  — assign leave to one employee
export const assignLeaveBalance = async (req, res) => {
    try {
        const { userId, leaveTypeId, allocated, year: reqYear } = req.body;
        const year = reqYear || new Date().getFullYear();
        const u = await User.findById(userId).select("companyId");
        if (!u) return res.status(404).json({ message: "User not found", success: false });

        const balance = await LeaveBalance.findOneAndUpdate(
            { userId, leaveTypeId, year },
            { $set: { allocated, companyId: u.companyId, updatedBy: req.user.userId }, $setOnInsert: { used: 0, pending: 0, carried: 0, createdBy: req.user.userId } },
            { upsert: true, new: true }
        );
        await createNotification({ userId, title: "Leave Balance Updated", message: `Your leave balance has been updated for ${year}.`, type: "user", link: "/leave-management", createdBy: req.user.userId });
        res.status(200).json({ balance, message: "Leave balance assigned", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// POST /api/leaves/balance/bulk-assign  — assign leave to all company employees
export const bulkAssignLeaveBalance = async (req, res) => {
    try {
        const { leaveTypeId, allocated, year: reqYear, companyId: bodyCompany } = req.body;
        const year = reqYear || new Date().getFullYear();
        const reqUser = await getUser(req.user.userId);
        const companyId = reqUser.role?.name === "super_admin" && bodyCompany ? bodyCompany : reqUser.companyId;

        const users = await User.find({ companyId, isActive: true, isDeleted: false }).select("_id");
        const lt = await LeaveType.findById(leaveTypeId);
        if (!lt) return res.status(404).json({ message: "Leave type not found", success: false });

        const ops = users.map(u => ({
            updateOne: {
                filter: { userId: u._id, leaveTypeId, year },
                update: { $set: { allocated, companyId, updatedBy: req.user.userId }, $setOnInsert: { used: 0, pending: 0, carried: 0, createdBy: req.user.userId } },
                upsert: true,
            }
        }));
        await LeaveBalance.bulkWrite(ops);

        await createNotification({
            userId: users.map(u => u._id),
            title: "Leave Balance Assigned",
            message: `${allocated} days of ${lt.name} leave have been allocated for ${year}.`,
            type: "user", link: "/leave-management", createdBy: req.user.userId,
        });

        res.status(200).json({ updated: users.length, message: `Leave balance assigned to ${users.length} employees`, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// ── Leave Application ─────────────────────────────────────────────────────────

// POST /api/leaves/apply
export const applyLeave = async (req, res) => {
    try {
        const { leaveTypeId, fromDate, toDate, reason, isHalfDay, halfDayType } = req.body;
        const userId = req.user.userId;

        // Validate dates
        if (!fromDate || !toDate || !leaveTypeId || !reason?.trim())
            return res.status(400).json({ message: "leaveTypeId, fromDate, toDate and reason are required", success: false });
        if (fromDate > toDate)
            return res.status(400).json({ message: "fromDate cannot be after toDate", success: false });

        const u = await User.findById(userId).select("companyId workShift");
        const year = new Date(fromDate).getFullYear();

        // Get employee's week-off days from their assigned shift
        let weekOff = [0, 6];
        if (u.workShift) {
            const WorkShift = (await import("../models/workShiftSchema.js")).default;
            const shift = await WorkShift.findById(u.workShift).select("weekOff");
            if (shift?.weekOff?.length) weekOff = shift.weekOff;
        }

        // #3 — count only working days (excludes weekoffs + holidays)
        const days = isHalfDay ? 0.5 : await countWorkingDays(fromDate, toDate, u.companyId, weekOff);
        if (days <= 0)
            return res.status(400).json({ message: "No working days in selected range (all days are holidays or week-offs)", success: false });

        // Check for overlapping leave applications
        const overlap = await LeaveApplication.findOne({
            userId,
            status: { $in: ["pending", "approved"] },
            fromDate: { $lte: toDate },
            toDate: { $gte: fromDate },
        });
        if (overlap)
            return res.status(400).json({ message: `You already have a ${overlap.status} leave overlapping these dates`, success: false });

        // #1 — Check and reserve balance
        const leaveType = await LeaveType.findById(leaveTypeId);
        if (!leaveType) return res.status(404).json({ message: "Leave type not found", success: false });

        const balance = await LeaveBalance.findOne({ userId, leaveTypeId, year });
        const available = balance ? (balance.allocated + balance.carried - balance.used - balance.pending) : 0;
        
        // Unpaid leaves don't require balance
        if (leaveType.isPaid && available < days)
            return res.status(400).json({ message: `Insufficient leave balance. Available: ${available} day(s), Requested: ${days} day(s)`, success: false });

        const app = await LeaveApplication.create({
            userId, leaveTypeId, companyId: u.companyId,
            fromDate, toDate, days, reason, isHalfDay, halfDayType,
            createdBy: userId,
        });

        // #1 — Reserve days as pending immediately on application
        await LeaveBalance.findOneAndUpdate(
            { userId, leaveTypeId, year },
            { $inc: { pending: days } }
        );

        // Notify manager
        const fullUser = await User.findById(userId).select("reportingTo firstName lastName");
        if (fullUser?.reportingTo) {
            await createNotification({
                userId: fullUser.reportingTo,
                title: "Leave Request",
                message: `${fullUser.firstName} ${fullUser.lastName} applied for ${days} day(s) of ${leaveType.name} leave (${fromDate} to ${toDate}).`,
                type: "user", link: "/leave-management", createdBy: userId,
            });
        }

        res.status(201).json({ application: app, message: "Leave applied successfully", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// GET /api/leaves/my?year=2025
export const getMyLeaves = async (req, res) => {
    try {
        const { year, status } = req.query;
        const filter = { userId: req.user.userId };
        if (year) { filter.fromDate = { $regex: `^${year}` }; }
        if (status) filter.status = status;
        const leaves = await LeaveApplication.find(filter)
            .populate("leaveTypeId", "name code isPaid")
            .populate("approvedBy", "firstName lastName")
            .sort({ createdAt: -1 });
        res.status(200).json({ leaves, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// GET /api/leaves/company?year=2025&status=pending  (admin/manager)
export const getCompanyLeaves = async (req, res) => {
    try {
        const { year, status, userId } = req.query;
        const reqUser = await getUser(req.user.userId);
        const roleName = reqUser.role?.name;
        const filter = {};

        if (roleName === "super_admin") {
            // Super Admin — no restriction, may optionally filter by company
            if (req.query.companyId) filter.companyId = req.query.companyId;
        } else {
            // Hierarchy filter:
            // Admin B1 sees only H, E, Z leaves — NOT Admin B2's team leaves
            // HR H sees only Employee E's leaves — NOT Employee Z (Z reports to B1)
            const allowedIds = await getSubordinateIds(req.user.userId);
            filter.userId = { $in: allowedIds };
        }

        if (year) filter.fromDate = { $regex: `^${year}` };
        if (status) filter.status = status;
        if (userId) filter.userId = userId; // admin can drill down to specific user

        const leaves = await LeaveApplication.find(filter)
            .populate("userId", "firstName lastName employeeCode profilePic companyId")
            .populate("leaveTypeId", "name code isPaid")
            .populate("approvedBy", "firstName lastName")
            .sort({ createdAt: -1 });
        res.status(200).json({ leaves, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// PATCH /api/leaves/:id/approve
export const approveLeave = async (req, res) => {
    try {
        const app = await LeaveApplication.findById(req.params.id).populate("userId", "reportingTo firstName lastName");
        if (!app) return res.status(404).json({ message: "Leave application not found", success: false });
        if (app.status !== "pending") return res.status(400).json({ message: "Application is not pending", success: false });

        const reqUser = await getUser(req.user.userId);
        const roleName = reqUser?.role?.name;

        // #18 — Verify approver belongs to same company as the leave
        if (roleName !== "super_admin" && reqUser.companyId?.toString() !== app.companyId?.toString())
            return res.status(403).json({ message: "You cannot approve leaves from a different company", success: false });

        if (roleName !== "super_admin" && roleName !== "admin") {
            const isManager = app.userId?.reportingTo?.toString() === req.user.userId;
            if (!isManager) return res.status(403).json({ message: "You can only approve leaves for your direct reports", success: false });
        }

        // Atomically update status to prevent race conditions (double clicks)
        const updatedApp = await LeaveApplication.findOneAndUpdate(
            { _id: req.params.id, status: "pending" },
            { status: "approved", approvedBy: req.user.userId, approvedAt: new Date(), updatedBy: req.user.userId },
            { new: true }
        );
        if (!updatedApp) return res.status(400).json({ message: "Application was already processed", success: false });

        const employeeId = app.userId._id || app.userId;

        // #1 — Move days from pending → used
        const year = new Date(app.fromDate).getFullYear();
        const updated = await LeaveBalance.findOneAndUpdate(
            { userId: employeeId, leaveTypeId: app.leaveTypeId, year },
            { $inc: { used: app.days, pending: -app.days } },
            { new: true }
        );
        // Safety: if balance record was missing, create it with used days
        if (!updated) {
            const u = await User.findById(employeeId).select("companyId");
            await LeaveBalance.create({
                userId: employeeId, leaveTypeId: app.leaveTypeId,
                companyId: u.companyId, year,
                allocated: 0, used: app.days, pending: 0, carried: 0,
                createdBy: req.user.userId,
            });
        }

        await createNotification({ userId: employeeId, title: "Leave Approved \u2705", message: `Your leave from ${app.fromDate} to ${app.toDate} has been approved.`, type: "user", link: "/leave-management", createdBy: req.user.userId });
        res.status(200).json({ message: "Leave approved", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// PATCH /api/leaves/:id/reject
export const rejectLeave = async (req, res) => {
    try {
        const { rejectionReason } = req.body;
        const app = await LeaveApplication.findById(req.params.id).populate("userId", "reportingTo firstName lastName");
        if (!app) return res.status(404).json({ message: "Leave application not found", success: false });
        if (app.status !== "pending") return res.status(400).json({ message: "Application is not pending", success: false });

        const reqUser = await getUser(req.user.userId);
        const roleName = reqUser?.role?.name;

        // #18 — Verify rejecter belongs to same company
        if (roleName !== "super_admin" && reqUser.companyId?.toString() !== app.companyId?.toString())
            return res.status(403).json({ message: "You cannot reject leaves from a different company", success: false });

        if (roleName !== "super_admin" && roleName !== "admin") {
            const isManager = app.userId?.reportingTo?.toString() === req.user.userId;
            if (!isManager) return res.status(403).json({ message: "You can only reject leaves for your direct reports", success: false });
        }

        // Atomically update status to prevent race conditions
        const updatedApp = await LeaveApplication.findOneAndUpdate(
            { _id: req.params.id, status: "pending" },
            { status: "rejected", rejectionReason, approvedBy: req.user.userId, approvedAt: new Date(), updatedBy: req.user.userId },
            { new: true }
        );
        if (!updatedApp) return res.status(400).json({ message: "Application was already processed", success: false });

        const employeeId = app.userId._id || app.userId;

        // #1 — Release pending days back to available
        const year = new Date(app.fromDate).getFullYear();
        await LeaveBalance.findOneAndUpdate(
            { userId: employeeId, leaveTypeId: app.leaveTypeId, year },
            { $inc: { pending: -app.days } }
        );

        await createNotification({ userId: employeeId, title: "Leave Rejected \u274c", message: `Your leave from ${app.fromDate} to ${app.toDate} was rejected. Reason: ${rejectionReason || "Not specified"}`, type: "user", link: "/leave-management", createdBy: req.user.userId });
        res.status(200).json({ message: "Leave rejected", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// PATCH /api/leaves/:id/cancel
export const cancelLeave = async (req, res) => {
    try {
        const app = await LeaveApplication.findById(req.params.id);
        if (!app) return res.status(404).json({ message: "Leave application not found", success: false });
        if (app.status !== "pending")
            return res.status(400).json({ message: "Only pending leaves can be cancelled", success: false });

        // Only the owner or admin can cancel
        const reqUser = await getUser(req.user.userId);
        const roleName = reqUser?.role?.name;
        const isOwner = app.userId.toString() === req.user.userId;
        if (!isOwner && roleName !== "admin" && roleName !== "super_admin")
            return res.status(403).json({ message: "You can only cancel your own leave", success: false });

        const wasPending  = app.status === "pending";
        
        // Atomically update status to prevent race conditions
        const updatedApp = await LeaveApplication.findOneAndUpdate(
            { _id: req.params.id, status: "pending" },
            { status: "cancelled", updatedBy: req.user.userId },
            { new: true }
        );
        if (!updatedApp) return res.status(400).json({ message: "Application was already processed", success: false });

        // #1 — Restore balance correctly
        const year = new Date(app.fromDate).getFullYear();
        if (wasPending)  await LeaveBalance.findOneAndUpdate({ userId: app.userId, leaveTypeId: app.leaveTypeId, year }, { $inc: { pending: -app.days } });

        res.status(200).json({ message: "Leave cancelled", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};
