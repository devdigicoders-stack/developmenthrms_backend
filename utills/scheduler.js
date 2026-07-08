import cron from "node-cron";
import Attendance from "../models/AttendanceSchema.js";
import User from "../models/UserSchema.js";
import WorkShift from "../models/workShiftSchema.js";
import Holiday from "../models/HolidaySchema.js";
import LeaveApplication from "../models/LeaveApplicationSchema.js";
import LeaveBalance from "../models/LeaveBalanceSchema.js";
import LeaveType from "../models/leaveTypeSchema.js";

// Returns "YYYY-MM-DD" for yesterday in IST (UTC+5:30)
const yesterdayDate = () => {
    const now = new Date();
    const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    ist.setDate(ist.getDate() - 1);
    return ist.toISOString().split("T")[0];
};

// #6 — Mark absent for all active employees who had no attendance record yesterday,
//       skipping week-offs, holidays, and approved/pending leaves.
export const markAbsentees = async () => {
    const date = yesterdayDate();
    console.log(`[Scheduler] Running absent auto-mark for ${date}`);

    try {
        // Fetch all active, non-deleted employees with their shift and company
        const users = await User.find({ isActive: true, isDeleted: false })
            .select("_id companyId workShift")
            .lean();

        // Cache shifts and holidays per company to avoid repeated DB hits
        const shiftCache = {};
        const holidayCache = {};

        let marked = 0;

        for (const user of users) {
            const companyId = user.companyId?.toString();
            if (!companyId) continue;

            // Load shift (cached)
            let weekOff = [0, 6];
            if (user.workShift) {
                const shiftId = user.workShift.toString();
                if (!shiftCache[shiftId]) {
                    shiftCache[shiftId] = await WorkShift.findById(shiftId).select("weekOff").lean();
                }
                if (shiftCache[shiftId]?.weekOff?.length) {
                    weekOff = shiftCache[shiftId].weekOff;
                }
            }

            // Skip if yesterday was a week-off for this employee
            const dayOfWeek = new Date(date).getDay();
            if (weekOff.includes(dayOfWeek)) continue;

            // Load holidays for this company (cached)
            if (!holidayCache[companyId]) {
                const holidays = await Holiday.find({ companyId, date }).select("date").lean();
                holidayCache[companyId] = new Set(holidays.map(h => h.date));
            }
            if (holidayCache[companyId].has(date)) continue;

            // Skip if employee has an approved or pending leave covering yesterday
            const onLeave = await LeaveApplication.findOne({
                userId: user._id,
                status: { $in: ["approved", "pending"] },
                fromDate: { $lte: date },
                toDate: { $gte: date },
            }).lean();
            if (onLeave) continue;

            // Skip if attendance record already exists
            const existing = await Attendance.findOne({ userId: user._id, date }).lean();
            if (existing) continue;

            // Create absent record
            await Attendance.create({
                userId: user._id,
                companyId: user.companyId,
                date,
                status: "absent",
                workHours: 0,
                punches: [],
                createdBy: null,
            });
            marked++;
        }

        console.log(`[Scheduler] Absent auto-mark done for ${date}: ${marked} employee(s) marked absent`);
    } catch (err) {
        console.error(`[Scheduler] Absent auto-mark failed for ${date}:`, err.message);
    }
};

// #21 — Year-end carry-forward: copies unused leave balance to next year
export const processCarryForward = async () => {
    const prevYear = new Date().getFullYear() - 1;
    const newYear  = prevYear + 1;
    console.log(`[Scheduler] Processing carry-forward from ${prevYear} to ${newYear}`);

    try {
        // Get all leave types that have carryForward enabled
        const carryTypes = await LeaveType.find({ carryForward: true, isDeleted: false }).lean();
        if (!carryTypes.length) {
            console.log("[Scheduler] No carry-forward leave types found");
            return;
        }

        let processed = 0;
        for (const lt of carryTypes) {
            // Find all balances for this leave type in the previous year
            const balances = await LeaveBalance.find({ leaveTypeId: lt._id, year: prevYear }).lean();

            for (const bal of balances) {
                const unused = bal.allocated + bal.carried - bal.used - bal.pending;
                if (unused <= 0) continue;

                // Cap carry-forward at maxCarryForward
                const carryAmount = lt.maxCarryForward > 0
                    ? Math.min(unused, lt.maxCarryForward)
                    : unused;

                // Upsert next year's balance with carried amount
                await LeaveBalance.findOneAndUpdate(
                    { userId: bal.userId, leaveTypeId: lt._id, year: newYear },
                    {
                        $inc: { carried: carryAmount },
                        $setOnInsert: {
                            companyId: bal.companyId,
                            allocated: 0, used: 0, pending: 0,
                        },
                    },
                    { upsert: true }
                );
                processed++;
            }
        }
        console.log(`[Scheduler] Carry-forward done: ${processed} balance(s) updated for ${newYear}`);
    } catch (err) {
        console.error("[Scheduler] Carry-forward failed:", err.message);
    }
};

// Schedule: runs every day at 00:05 AM (5 minutes after midnight)
export const startScheduler = () => {
    cron.schedule("5 0 * * *", markAbsentees, { timezone: "Asia/Kolkata" });

    // #21 — Year-end carry-forward: runs on Jan 1st at 01:00 AM IST
    cron.schedule("0 1 1 1 *", processCarryForward, { timezone: "Asia/Kolkata" });

    console.log("[Scheduler] Absent auto-mark scheduler started (runs daily at 00:05 IST)");
    console.log("[Scheduler] Carry-forward scheduler started (runs Jan 1st at 01:00 IST)");
};
