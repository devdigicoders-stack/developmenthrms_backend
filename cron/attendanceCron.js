import cron from "node-cron";
import User from "../models/UserSchema.js";
import Attendance from "../models/AttendanceSchema.js";
import Role from "../models/roleSchema.js";

// Helper to get today's date in IST
const todayDate = () => {
    const now = new Date();
    const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    return ist.toISOString().split("T")[0];
};

export const runAbsentMarking = async () => {
    try {
        console.log("Running automated Absent Marking cron job...");
        
        // Get today's date
        const date = todayDate();
        
        // Exclude super admins and clients from absent marking
        const excludedRoles = await Role.find({ name: { $in: ["super_admin", "client"] } });
        const excludedRoleIds = excludedRoles.map(r => r._id);
        
        // Get all active users
        const filter = { isActive: true };
        if (excludedRoleIds.length > 0) {
            filter.role = { $nin: excludedRoleIds };
        }
        
        const activeUsers = await User.find(filter);
        
        let markedCount = 0;
        
        for (const user of activeUsers) {
            // Check if an attendance record exists for this user today
            const existingRecord = await Attendance.findOne({ userId: user._id, date });
            
            if (!existingRecord) {
                // No record found, they never punched in. Mark as absent.
                await Attendance.create({
                    userId: user._id,
                    companyId: user.companyId,
                    workShiftId: user.workShift,
                    date,
                    status: "absent",
                    punches: [],
                    createdBy: user._id // System generated technically, but required
                });
                markedCount++;
            }
        }
        
        console.log(`Cron Job Success: Marked ${markedCount} users as absent for ${date}.`);
        return markedCount;
    } catch (error) {
        console.error("Error in Attendance Cron Job:", error);
    }
};

const startAttendanceCron = () => {
    // Run every day at 8:00 PM (20:00) server time
    cron.schedule("0 20 * * *", runAbsentMarking);
};

export default startAttendanceCron;
