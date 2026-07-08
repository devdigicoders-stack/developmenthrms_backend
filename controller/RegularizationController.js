import Regularization from "../models/RegularizationSchema.js";
import Attendance from "../models/AttendanceSchema.js";
import User from "../models/UserSchema.js";
import { createNotification } from "../utills/notificationHelper.js";

// POST /api/regularization
export const requestRegularization = async (req, res) => {
    try {
        const { date, type, requestedCheckIn, requestedCheckOut, reason } = req.body;
        const userId = req.user.userId;
        if (!date || !reason) return res.status(400).json({ message: "Date and reason are required", success: false });

        // #4 — Block future date regularization
        const today = new Date().toISOString().split("T")[0];
        if (date > today)
            return res.status(400).json({ message: "Cannot request regularization for a future date", success: false });

        // #13 — Monthly limit: max 3 regularization requests per month
        const MONTHLY_LIMIT = 3;
        const yearMonth = date.slice(0, 7); // "YYYY-MM"
        const monthCount = await Regularization.countDocuments({
            userId,
            date: { $regex: `^${yearMonth}` },
            status: { $in: ["pending", "approved"] },
        });
        if (monthCount >= MONTHLY_LIMIT)
            return res.status(400).json({ message: `Regularization limit reached. Maximum ${MONTHLY_LIMIT} requests allowed per month.`, success: false });

        const u = await User.findById(userId).select("companyId");
        const attendance = await Attendance.findOne({ userId, date });

        // Prevent duplicate pending request for same date
        const existing = await Regularization.findOne({ userId, date, status: "pending" });
        if (existing) return res.status(400).json({ message: "A pending regularization request already exists for this date", success: false });

        // If previously rejected, allow re-submission by creating new request
        const reg = await Regularization.create({
            userId, companyId: u.companyId,
            attendanceId: attendance?._id || null,
            date, type: type || "wrong-time",
            requestedCheckIn, requestedCheckOut, reason,
            createdBy: userId,
        });

        const fullUser = await User.findById(userId).select("reportingTo firstName lastName");
        if (fullUser?.reportingTo) {
            await createNotification({ userId: fullUser.reportingTo, title: "Regularization Request", message: `${fullUser.firstName} ${fullUser.lastName} requested attendance regularization for ${date}.`, type: "attendance", link: "/attendance", createdBy: userId });
        }

        res.status(201).json({ regularization: reg, message: "Regularization request submitted", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// GET /api/regularization/my
export const getMyRegularizations = async (req, res) => {
    try {
        const regs = await Regularization.find({ userId: req.user.userId })
            .populate("approvedBy", "firstName lastName")
            .sort({ date: -1 });
        res.status(200).json({ regularizations: regs, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// GET /api/regularization/company?status=pending  (admin)
export const getCompanyRegularizations = async (req, res) => {
    try {
        const { status } = req.query;
        const reqUser = await User.findById(req.user.userId).select("companyId role").populate("role", "name");
        if (!reqUser) return res.status(404).json({ message: "User not found", success: false });

        // #17 — Always scope to company; super_admin must pass companyId explicitly
        const filter = {};
        if (reqUser.role?.name === "super_admin") {
            if (req.query.companyId) filter.companyId = req.query.companyId;
            // else returns all (super_admin intentional)
        } else {
            filter.companyId = reqUser.companyId; // hard-scoped, cannot be overridden
        }
        if (status) filter.status = status;

        const regs = await Regularization.find(filter)
            .populate("userId", "firstName lastName employeeCode profilePic")
            .populate("approvedBy", "firstName lastName")
            .sort({ createdAt: -1 });
        res.status(200).json({ regularizations: regs, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// GET /api/regularization/team  — manager sees their direct reports' requests
export const getTeamRegularizations = async (req, res) => {
    try {
        const { status } = req.query;
        const directReports = await User.find({ reportingTo: req.user.userId, isDeleted: false }).select("_id");
        if (!directReports.length) return res.status(200).json({ regularizations: [], success: true });
        const filter = { userId: { $in: directReports.map(u => u._id) } };
        if (status) filter.status = status;
        const regs = await Regularization.find(filter)
            .populate("userId", "firstName lastName employeeCode profilePic")
            .populate("approvedBy", "firstName lastName")
            .sort({ createdAt: -1 });
        res.status(200).json({ regularizations: regs, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// Helper: compute attendance status after regularization
// Always marks as "regularized"; only exception is half-day based on hours
const resolveStatusFromHours = (workHours) => {
    if (workHours > 0 && workHours < 4) return "half-day";
    return "regularized";
};

// PATCH /api/regularization/:id/approve
export const approveRegularization = async (req, res) => {
    try {
        const reg = await Regularization.findById(req.params.id);
        if (!reg) return res.status(404).json({ message: "Request not found", success: false });
        if (reg.status !== "pending") return res.status(400).json({ message: "Request is not pending", success: false });

        const checkInDate  = reg.requestedCheckIn  ? new Date(`${reg.date}T${reg.requestedCheckIn}:00`)  : null;
        const checkOutDate = reg.requestedCheckOut ? new Date(`${reg.date}T${reg.requestedCheckOut}:00`) : null;
        const workHours = (checkInDate && checkOutDate)
            ? parseFloat(((checkOutDate - checkInDate) / 3600000).toFixed(2))
            : 0;
        const resolvedStatus = resolveStatusFromHours(workHours);

        // Apply the correction to attendance
        let attendance = reg.attendanceId
            ? await Attendance.findById(reg.attendanceId)
            : await Attendance.findOne({ userId: reg.userId, date: reg.date });

        if (!attendance) {
            attendance = await Attendance.create({
                userId: reg.userId, companyId: reg.companyId, date: reg.date,
                checkIn: checkInDate,
                checkOut: checkOutDate,
                punches: (checkInDate ? [{ checkIn: checkInDate, checkOut: checkOutDate || undefined, workHours }] : []),
                workHours,
                status: resolvedStatus,
                isRegularized: true,
                createdBy: req.user.userId,
                updatedBy: req.user.userId,
            });
        } else {
            if (checkInDate)  attendance.checkIn  = checkInDate;
            if (checkOutDate) attendance.checkOut = checkOutDate;

            if (attendance.punches.length > 0) {
                if (checkInDate)  attendance.punches[0].checkIn  = checkInDate;
                if (checkOutDate) attendance.punches[0].checkOut = checkOutDate;
            } else if (checkInDate) {
                attendance.punches = [{ checkIn: checkInDate, checkOut: checkOutDate || undefined, workHours }];
            }

            const totalHours = parseFloat(attendance.punches.reduce((sum, p) => {
                if (p.checkIn && p.checkOut) return sum + (new Date(p.checkOut) - new Date(p.checkIn)) / 3600000;
                return sum;
            }, 0).toFixed(2));

            if (attendance.punches.length > 0 && attendance.punches[0].checkIn && attendance.punches[0].checkOut) {
                attendance.punches[0].workHours = parseFloat(
                    ((new Date(attendance.punches[0].checkOut) - new Date(attendance.punches[0].checkIn)) / 3600000).toFixed(2)
                );
            }

            attendance.workHours = totalHours || workHours;
            attendance.status = resolveStatusFromHours(attendance.workHours);
            attendance.isRegularized = true;
            attendance.updatedBy = req.user.userId;
            await attendance.save();
        }

        reg.status = "approved";
        reg.approvedBy = req.user.userId;
        reg.approvedAt = new Date();
        reg.attendanceId = attendance._id;
        reg.updatedBy = req.user.userId;
        await reg.save();

        await createNotification({ userId: reg.userId, title: "Regularization Approved ✅", message: `Your attendance regularization for ${reg.date} has been approved.`, type: "attendance", link: "/attendance", createdBy: req.user.userId });
        res.status(200).json({ message: "Regularization approved and attendance updated", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// PATCH /api/regularization/:id/reject
export const rejectRegularization = async (req, res) => {
    try {
        const { rejectionReason } = req.body;
        const reg = await Regularization.findById(req.params.id);
        if (!reg) return res.status(404).json({ message: "Request not found", success: false });
        reg.status = "rejected";
        reg.rejectionReason = rejectionReason;
        reg.approvedBy = req.user.userId;
        reg.approvedAt = new Date();
        reg.updatedBy = req.user.userId;
        await reg.save();

        await createNotification({ userId: reg.userId, title: "Regularization Rejected ❌", message: `Your attendance regularization for ${reg.date} was rejected.`, type: "attendance", link: "/attendance", createdBy: req.user.userId });
        res.status(200).json({ message: "Regularization rejected", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};
