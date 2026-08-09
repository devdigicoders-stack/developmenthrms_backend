import cron from "node-cron";
import Task from "../models/TaskSchema.js";
import Attendance from "../models/AttendanceSchema.js";
import User from "../models/UserSchema.js";
import mongoose from "mongoose";

const startPerformanceCron = () => {
// Run on the 1st of every month at 00:00
cron.schedule("0 0 1 * *", async () => {
    try {
        console.log("Running Star of the Month calculation...");

        const now = new Date();
        // Calculate for the previous month
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
        const monthName = start.toLocaleString('en-US', { month: 'short' });
        const year = start.getFullYear();

        const taskMatchQuery = { isDeleted: false, createdAt: { $gte: start, $lte: end } };
        
        // Find all active developers (users with tasks assigned this month)
        const allTasks = await Task.find(taskMatchQuery).select("assignedTo");
        let activeUsers = new Set();
        allTasks.forEach(t => {
            if(t.assignedTo) {
                t.assignedTo.forEach(id => activeUsers.add(id.toString()));
            }
        });

        const userIds = Array.from(activeUsers).map(id => new mongoose.Types.ObjectId(id));
        if (userIds.length === 0) return console.log("No developers found for badges.");

        // Aggregate Tasks
        const taskAgg = await Task.aggregate([
            { $match: taskMatchQuery },
            { $unwind: "$assignedTo" },
            { $match: { assignedTo: { $in: userIds } } },
            {
                $addFields: {
                    isLate: {
                        $cond: [
                            { $and: [ 
                                { $ne: [{ $type: "$dueDate" }, "missing"] },
                                { $ne: ["$dueDate", null] }, 
                                { $gt: ["$updatedAt", "$dueDate"] } 
                            ] }, 1, 0
                        ]
                    },
                    weight: {
                        $switch: {
                            branches: [
                                { case: { $eq: ["$priority", "low"] }, then: 1 },
                                { case: { $eq: ["$priority", "medium"] }, then: 2 },
                                { case: { $eq: ["$priority", "high"] }, then: 3 },
                                { case: { $eq: ["$priority", "urgent"] }, then: 4 }
                            ],
                            default: 2
                        }
                    }
                }
            },
            { 
                $group: { 
                    _id: "$assignedTo", 
                    tasksAssigned: { $sum: 1 },
                    tasksCompleted: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
                    totalPoints: { $sum: "$weight" },
                    earnedPoints: { $sum: { $cond: [{ $eq: ["$status", "done"] }, "$weight", 0] } },
                    lateTasks: { $sum: { $cond: [ { $and: [{ $eq: ["$status", "done"] }, { $eq: ["$isLate", 1] }] }, 1, 0 ] } }
                } 
            }
        ]);

        const attendanceMatch = { 
            date: { $gte: start.toISOString().split("T")[0], $lte: end.toISOString().split("T")[0] },
            userId: { $in: userIds }
        };

        const attendanceAgg = await Attendance.aggregate([
            { $match: attendanceMatch },
            { 
                $group: {
                    _id: "$userId",
                    daysPresent: { $sum: { $cond: [{ $in: ["$status", ["present", "late", "half-day", "early-leave", "regularized"]] }, 1, 0] } },
                    daysLate: { $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] } },
                    totalWorkingDays: { $sum: 1 }
                }
            }
        ]);

        const performanceMap = {};
        userIds.forEach(id => {
            performanceMap[id.toString()] = {
                userId: id,
                tasksAssigned: 0,
                taskCompletionRate: 0,
                attendanceRate: 0,
                daysLate: 0,
                lateTasks: 0,
                performanceScore: 0
            };
        });

        taskAgg.forEach(item => {
            const key = item._id.toString();
            if (performanceMap[key]) {
                performanceMap[key].tasksAssigned = item.tasksAssigned;
                performanceMap[key].lateTasks = item.lateTasks;
                performanceMap[key].taskCompletionRate = item.totalPoints > 0 
                    ? Math.round((item.earnedPoints / item.totalPoints) * 100) : 0;
            }
        });

        attendanceAgg.forEach(item => {
            const key = item._id.toString();
            if (performanceMap[key]) {
                performanceMap[key].daysLate = item.daysLate;
                performanceMap[key].attendanceRate = item.totalWorkingDays > 0 
                    ? Math.round((item.daysPresent / item.totalWorkingDays) * 100) : 0;
            }
        });

        // Calculate score
        Object.values(performanceMap).forEach(dev => {
            let score = (dev.taskCompletionRate * 0.6) + (dev.attendanceRate * 0.4);
            let penalty = (dev.daysLate * 2) + (dev.lateTasks * 5);
            dev.performanceScore = Math.max(0, Math.round(score - penalty));
        });

        // Get Top 3
        const sorted = Object.values(performanceMap)
            .filter(d => d.tasksAssigned > 0)
            .sort((a, b) => b.performanceScore - a.performanceScore)
            .slice(0, 3);
        
        if (sorted.length === 0) return console.log("No valid scores for badges.");

        // Award Badges
        const topUserIds = sorted.map(d => d.userId);
        
        await User.updateMany(
            { _id: { $in: topUserIds } },
            { 
                $push: { 
                    badges: { type: "Star Performer", month: monthName, year: year }
                } 
            }
        );

        console.log(`Awarded Star Performer badges to ${topUserIds.length} users for ${monthName} ${year}`);
        
    } catch (error) {
        console.error("Star of the Month Cron Error:", error);
    }
});
};

export default startPerformanceCron;
