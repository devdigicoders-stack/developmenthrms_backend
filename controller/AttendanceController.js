import Attendance from "../models/AttendanceSchema.js";
import User from "../models/UserSchema.js";
import WorkShift from "../models/workShiftSchema.js";
import { createNotification } from "../utills/notificationHelper.js";

// #5 — Always return today's date in IST (UTC+5:30)
const todayDate = () => {
    const now = new Date();
    const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    return ist.toISOString().split("T")[0];
};

// #5 — Convert "HH:MM" shift time to Date object in IST timezone
const shiftTimeToDate = (timeStr) => {
    const [h, m] = timeStr.split(":").map(Number);
    const d = new Date();
    // Use IST offset: UTC+5:30 = 330 minutes
    const offset = d.getTimezoneOffset(); // minutes from UTC (negative for IST)
    const istOffset = -330; // IST is UTC+5:30
    const diff = istOffset - offset; // adjustment needed
    d.setHours(h, m, 0, 0);
    d.setMinutes(d.getMinutes() + diff); // adjust to IST
    return d;
};

// Determine status based on shift rules
const resolveCheckInStatus = (now, shift) => {
    if (!shift) {
        // fallback: late after 09:30
        const fallback = new Date(); fallback.setHours(9, 30, 0, 0);
        return now > fallback ? "late" : "present";
    }
    const shiftStart = shiftTimeToDate(shift.startTime);
    const allowedUntil = new Date(shiftStart.getTime() + (shift.gracePeriod + shift.lateThreshold) * 60000);
    return now > allowedUntil ? "late" : "present";
};

const resolveCheckOutStatus = (now, shift, currentStatus) => {
    if (!shift) return currentStatus;
    const shiftEnd = shiftTimeToDate(shift.endTime);
    const earlyBefore = new Date(shiftEnd.getTime() - shift.earlyLeaveThreshold * 60000);
    if (now < earlyBefore) return "early-leave";
    return currentStatus;
};

// POST /api/attendance/checkin
export const checkIn = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { latitude, longitude, address } = req.body;

        const user = await User.findById(userId).select("companyId workShift");
        if (!user) return res.status(404).json({ message: "User not found", success: false });

        const date = todayDate();
        const existing = await Attendance.findOne({ userId, date });
        const shift = user.workShift ? await WorkShift.findById(user.workShift) : null;
        const now = new Date();

        if (existing) {
            // Allow re-check-in only if last punch has a checkout
            const lastPunch = existing.punches[existing.punches.length - 1];
            const hasOpenPunch = lastPunch && !lastPunch.checkOut;
            if (hasOpenPunch) return res.status(400).json({ message: "Already checked in. Please check out first.", success: false });

            // Add new punch
            existing.punches.push({ checkIn: now, checkInLocation: { latitude, longitude, address } });
            existing.checkIn = existing.punches[0].checkIn; // keep first check-in as primary
            existing.checkOut = null; // open again
            await existing.save();

            const populated = await Attendance.findById(existing._id)
                .populate("workShiftId", "name startTime endTime")
                .populate("createdBy", "firstName lastName");

            const checkInTime = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
            await createNotification({ userId, title: "Check-In Recorded", message: `Re-checked in at ${checkInTime}.`, type: "attendance", link: "/attendance", createdBy: userId });
            return res.status(200).json({ message: "Re-checked in successfully", attendance: populated, success: true });
        }

        const status = resolveCheckInStatus(now, shift);
        const attendance = await Attendance.create({
            userId,
            companyId: user.companyId,
            workShiftId: shift?._id || null,
            date,
            checkIn: now,
            checkInLocation: { latitude, longitude, address },
            punches: [{ checkIn: now, checkInLocation: { latitude, longitude, address } }],
            status,
            createdBy: userId,
        });

        const populated = await Attendance.findById(attendance._id)
            .populate("workShiftId", "name startTime endTime")
            .populate("createdBy", "firstName lastName");

        const checkInTime = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
        await createNotification({ userId, title: "Check-In Recorded", message: `You checked in at ${checkInTime}. Status: ${status}.`, type: "attendance", link: "/attendance", createdBy: userId });

        res.status(201).json({ message: "Checked in successfully", attendance: populated, success: true });
    } catch (error) {
        console.error("CHECK-IN ERROR:", error);
        res.status(500).json({ message: "Error checking in", success: false });
    }
};

// PATCH /api/attendance/checkout
export const checkOut = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { latitude, longitude, address } = req.body;

        const date = todayDate();
        const attendance = await Attendance.findOne({ userId, date });
        if (!attendance) return res.status(404).json({ message: "No check-in found for today", success: false });

        // Find the open punch (last punch without checkout)
        const lastPunch = attendance.punches[attendance.punches.length - 1];
        if (!lastPunch || lastPunch.checkOut) return res.status(400).json({ message: "No open check-in found. Please check in first.", success: false });

        const shift = attendance.workShiftId ? await WorkShift.findById(attendance.workShiftId) : null;
        const now = new Date();

        // Close the open punch
        const punchHours = parseFloat(((now - new Date(lastPunch.checkIn)) / 3600000).toFixed(2));
        lastPunch.checkOut = now;
        lastPunch.checkOutLocation = { latitude, longitude, address };
        lastPunch.workHours = punchHours;

        // Recalculate total work hours across all punches
        const totalWorkHours = parseFloat(attendance.punches.reduce((sum, p) => {
            if (p.checkIn && p.checkOut) return sum + (new Date(p.checkOut) - new Date(p.checkIn)) / 3600000;
            return sum;
        }, 0).toFixed(2));

        let status = attendance.status;
        const checkOutStatus = resolveCheckOutStatus(now, shift, status);
        if (totalWorkHours < 4) status = "half-day";
        else if (checkOutStatus === "early-leave") status = "early-leave";

        attendance.checkOut = now;
        attendance.checkOutLocation = { latitude, longitude, address };
        attendance.workHours = totalWorkHours;
        attendance.status = status;
        await attendance.save();

        const populated = await Attendance.findById(attendance._id)
            .populate("workShiftId", "name startTime endTime")
            .populate("createdBy", "firstName lastName");

        const checkOutTime = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
        await createNotification({ userId, title: "Check-Out Recorded", message: `You checked out at ${checkOutTime}. Total hours: ${totalWorkHours}h. Status: ${status}.`, type: "attendance", link: "/attendance", createdBy: userId });

        res.status(200).json({ message: "Checked out successfully", attendance: populated, success: true });
    } catch (error) {
        console.error("CHECK-OUT ERROR:", error);
        res.status(500).json({ message: "Error checking out", success: false });
    }
};

// GET /api/attendance/today
export const getTodayAttendance = async (req, res) => {
    try {
        const userId = req.user.userId;
        const record = await Attendance.findOne({ userId, date: todayDate() })
            .populate("workShiftId", "name startTime endTime")
            .populate("createdBy", "firstName lastName");
        res.status(200).json({ record: record || null, success: true });
    } catch (error) {
        res.status(500).json({ message: "Error fetching today attendance", success: false });
    }
};

// GET /api/attendance/my?month=2025-01
export const getMyAttendance = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { month } = req.query;
        const filter = { userId };
        if (month) filter.date = { $regex: `^${month}` };

        const records = await Attendance.find(filter)
            .populate("workShiftId", "name startTime endTime")
            .populate("createdBy", "firstName lastName")
            .sort({ date: -1 });

        res.status(200).json({ records, success: true });
    } catch (error) {
        res.status(500).json({ message: "Error fetching attendance", success: false });
    }
};

// GET /api/attendance/summary?month=2025-01
export const getAttendanceSummary = async (req, res) => {
    try {
        const userId = req.user.userId;
        const month = req.query.month || new Date().toISOString().slice(0, 7);
        const records = await Attendance.find({ userId, date: { $regex: `^${month}` } });

        const summary = {
            present:     records.filter(r => r.status === "present").length,
            regularized: records.filter(r => r.status === "regularized").length,
            late:        records.filter(r => r.status === "late").length,
            halfDay:     records.filter(r => r.status === "half-day").length,
            earlyLeave:  records.filter(r => r.status === "early-leave").length,
            absent:      records.filter(r => r.status === "absent").length,
            totalDays:   records.length,
            totalHours:  parseFloat(records.reduce((sum, r) => sum + (r.workHours || 0), 0).toFixed(2)),
        };

        res.status(200).json({ summary, success: true });
    } catch (error) {
        res.status(500).json({ message: "Error fetching summary", success: false });
    }
};

// PATCH /api/attendance/:id/manual-punch  (admin)
export const manualPunch = async (req, res) => {
    try {
        const { checkIn: ci, checkOut: co, status, note } = req.body;
        const attendance = await Attendance.findById(req.params.id);
        if (!attendance) return res.status(404).json({ message: "Attendance record not found", success: false });

        if (ci) attendance.checkIn = new Date(ci);
        if (co) attendance.checkOut = new Date(co);
        if (status) attendance.status = status;
        if (note) attendance.note = note;
        if (attendance.checkIn && attendance.checkOut) {
            const diff = new Date(attendance.checkOut) - new Date(attendance.checkIn);
            attendance.workHours = parseFloat((diff / 3600000).toFixed(2));
        }
        attendance.isRegularized = true;
        attendance.updatedBy = req.user.userId;
        await attendance.save();

        await createNotification({ userId: attendance.userId, title: "Attendance Updated", message: `Your attendance for ${attendance.date} has been manually updated by admin.`, type: "attendance", link: "/attendance", createdBy: req.user.userId });
        res.status(200).json({ message: "Attendance updated", attendance, success: true });
    } catch (error) {
        res.status(500).json({ message: error.message, success: false });
    }
};

// POST /api/attendance/admin-punch  (admin creates record for employee)
export const adminCreatePunch = async (req, res) => {
    try {
        const { userId, date, checkIn: ci, checkOut: co, status, note } = req.body;
        if (!userId || !date) return res.status(400).json({ message: "userId and date are required", success: false });

        const u = await User.findById(userId).select("companyId workShift");
        if (!u) return res.status(404).json({ message: "User not found", success: false });

        const existing = await Attendance.findOne({ userId, date });
        if (existing) return res.status(400).json({ message: "Attendance record already exists for this date. Use manual punch to update.", success: false });

        const checkInDate = ci ? new Date(`${date}T${ci}:00`) : null;
        const checkOutDate = co ? new Date(`${date}T${co}:00`) : null;
        let workHours = 0;
        if (checkInDate && checkOutDate) {
            workHours = parseFloat(((checkOutDate - checkInDate) / 3600000).toFixed(2));
        }

        const attendance = await Attendance.create({
            userId, companyId: u.companyId, workShiftId: u.workShift || null,
            date, checkIn: checkInDate, checkOut: checkOutDate,
            workHours, status: status || "present", note,
            isRegularized: true, createdBy: req.user.userId, updatedBy: req.user.userId,
        });

        await createNotification({ userId, title: "Attendance Added", message: `Attendance for ${date} has been added by admin.`, type: "attendance", link: "/attendance", createdBy: req.user.userId });
        res.status(201).json({ message: "Attendance record created", attendance, success: true });
    } catch (error) {
        res.status(500).json({ message: error.message, success: false });
    }
};
// GET /api/attendance/team  — manager sees their direct reports' attendance
export const getTeamAttendance = async (req, res) => {
    try {
        const { date, month } = req.query;
        const directReports = await User.find({ reportingTo: req.user.userId, isDeleted: false }).select("_id");
        if (!directReports.length) return res.status(200).json({ records: [], success: true });

        const filter = { userId: { $in: directReports.map(u => u._id) } };
        if (date) filter.date = date;
        else if (month) filter.date = { $regex: `^${month}` };

        const records = await Attendance.find(filter)
            .populate("userId", "firstName lastName email employeeCode profilePic")
            .populate("workShiftId", "name startTime endTime")
            .sort({ date: -1, checkIn: -1 });

        res.status(200).json({ records, success: true });
    } catch (error) {
        res.status(500).json({ message: error.message, success: false });
    }
};

export const getCompanyAttendance = async (req, res) => {
    try {
        const { date, month, userId } = req.query;
        const reqUser = await User.findById(req.user.userId).select("companyId role").populate("role", "name");
        if (!reqUser) return res.status(404).json({ message: "User not found", success: false });

        const filter = {};
        if (reqUser.role?.name !== "super_admin") filter.companyId = reqUser.companyId;
        if (date) filter.date = date;
        else if (month) filter.date = { $regex: `^${month}` };
        if (userId) filter.userId = userId;

        const records = await Attendance.find(filter)
            .populate("userId", "firstName lastName email employeeCode profilePic")
            .populate("companyId", "name")
            .populate("workShiftId", "name startTime endTime")
            .populate("createdBy", "firstName lastName")
            .sort({ date: -1, checkIn: -1 });

        res.status(200).json({ records, success: true });
    } catch (error) {
        console.error("COMPANY ATTENDANCE ERROR:", error);
        res.status(500).json({ message: "Error fetching company attendance", success: false });
    }
};
