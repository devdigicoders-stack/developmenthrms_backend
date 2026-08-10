import Task from "../models/TaskSchema.js";
import Attendance from "../models/AttendanceSchema.js";
import User from "../models/UserSchema.js";
import mongoose from "mongoose";
import { getSubordinateIds } from "../utills/hierarchyHelper.js";

const cid = (req) => req.user.company ? new mongoose.Types.ObjectId(req.user.company) : null;

export const getPerformanceReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const companyId = cid(req);
        const reqUser = req.user;

        let matchQuery = { isDeleted: false };
        let attendanceMatch = {};
        
        const isAdmin = reqUser.role === "super_admin" || reqUser.role === "admin";
        
        // If not super_admin, filter by companyId
        if (reqUser.role !== "super_admin") {
            matchQuery.companyId = companyId;
            attendanceMatch.companyId = companyId;
        }

        // Apply date filters if provided, otherwise default to this month
        let start, end;
        if (startDate && endDate) {
            start = new Date(startDate);
            end = new Date(endDate);
        } else {
            const now = new Date();
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        }

        attendanceMatch.date = { 
            $gte: start.toISOString().split("T")[0], 
            $lte: end.toISOString().split("T")[0] 
        };

        // Time filtering for tasks
        const taskMatchQuery = { ...matchQuery, createdAt: { $gte: start, $lte: end } };

        const viewAll = isAdmin || (reqUser.permissions && reqUser.permissions.includes("VIEW_ALL_PERFORMANCE"));
        
        let usersToFetch = [];
        if (reqUser.role === "super_admin") {
            // Super Admin sees everyone
            const users = await User.find({ isDeleted: false, isActive: true }).select("_id firstName lastName profilePic");
            usersToFetch = users;
        } else if (viewAll) {
            // Admin/Manager with permission: hierarchy filter — only their subordinates
            const allowedIds = await getSubordinateIds(reqUser.userId);
            const users = await User.find({ _id: { $in: allowedIds }, isDeleted: false, isActive: true }).select("_id firstName lastName profilePic");
            usersToFetch = users;
        } else {
            // Regular employee: only self
            const user = await User.findById(reqUser.userId).select("_id firstName lastName profilePic");
            if (user) usersToFetch = [user];
        }

        const userIds = usersToFetch.map(u => u._id);

        // Fetch Tasks Aggregation (Assigned vs Completed vs Late)
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
                            ] },
                            1,
                            0
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

        // Fetch Attendance Aggregation
        const attendanceAgg = await Attendance.aggregate([
            { $match: { ...attendanceMatch, userId: { $in: userIds } } },
            { 
                $group: {
                    _id: "$userId",
                    daysPresent: { $sum: { $cond: [{ $in: ["$status", ["present", "late", "half-day", "early-leave", "regularized"]] }, 1, 0] } },
                    daysLate: { $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] } },
                    totalWorkingDays: { $sum: 1 }
                }
            }
        ]);

        // Merge Data
        const performanceMap = {};
        
        usersToFetch.forEach(u => {
            performanceMap[u._id.toString()] = {
                userId: u._id,
                name: `${u.firstName} ${u.lastName}`,
                profilePic: u.profilePic?.url || null,
                tasksAssigned: 0,
                tasksCompleted: 0,
                lateTasks: 0,
                taskCompletionRate: 0,
                daysPresent: 0,
                daysLate: 0,
                totalWorkingDays: 0,
                attendanceRate: 0,
                performanceScore: 0
            };
        });

        taskAgg.forEach(item => {
            const key = item._id.toString();
            if (performanceMap[key]) {
                performanceMap[key].tasksAssigned = item.tasksAssigned;
                performanceMap[key].tasksCompleted = item.tasksCompleted;
                performanceMap[key].lateTasks = item.lateTasks || 0;
                performanceMap[key].taskCompletionRate = item.totalPoints > 0 
                    ? Math.round((item.earnedPoints / item.totalPoints) * 100) 
                    : 0;
            }
        });

        attendanceAgg.forEach(item => {
            const key = item._id.toString();
            if (performanceMap[key]) {
                performanceMap[key].daysPresent = item.daysPresent;
                performanceMap[key].daysLate = item.daysLate;
                performanceMap[key].totalWorkingDays = item.totalWorkingDays;
                performanceMap[key].attendanceRate = item.totalWorkingDays > 0 
                    ? Math.round((item.daysPresent / item.totalWorkingDays) * 100) 
                    : 0;
            }
        });

        // Calculate Performance Score
        Object.values(performanceMap).forEach(dev => {
            let score = (dev.taskCompletionRate * 0.6) + (dev.attendanceRate * 0.4);
            let attendancePenalty = dev.daysLate * 2;
            let taskPenalty = dev.lateTasks * 5; // -5 points for every overdue task
            let penalty = attendancePenalty + taskPenalty;
            score = Math.max(0, score - penalty);
            dev.performanceScore = Math.round(score);
        });

        const sortedPerformance = Object.values(performanceMap)
            .filter(dev => dev.tasksAssigned > 0 || !viewAll) // Show if they have tasks, or if they are just viewing their own empty report
            .sort((a, b) => b.performanceScore - a.performanceScore);

        res.json({
            success: true,
            data: sortedPerformance
        });

    } catch (error) {
        console.error("PerformanceReport Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const getPerformanceHistory = async (req, res) => {
    try {
        const userId = req.user.userId;
        const history = [];

        for (let i = 5; i >= 0; i--) {
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
            const monthName = start.toLocaleString('en-US', { month: 'short' });

            const taskMatchQuery = { isDeleted: false, createdAt: { $gte: start, $lte: end } };
            const attendanceMatch = { 
                userId: new mongoose.Types.ObjectId(userId),
                date: { $gte: start.toISOString().split("T")[0], $lte: end.toISOString().split("T")[0] } 
            };

            const taskAgg = await Task.aggregate([
                { $match: taskMatchQuery },
                { $unwind: "$assignedTo" },
                { $match: { assignedTo: new mongoose.Types.ObjectId(userId) } },
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
                        _id: null,
                        totalPoints: { $sum: "$weight" },
                        earnedPoints: { $sum: { $cond: [{ $eq: ["$status", "done"] }, "$weight", 0] } },
                        lateTasks: { $sum: { $cond: [ { $and: [{ $eq: ["$status", "done"] }, { $eq: ["$isLate", 1] }] }, 1, 0 ] } }
                    } 
                }
            ]);

            const attendanceAgg = await Attendance.aggregate([
                { $match: attendanceMatch },
                { 
                    $group: {
                        _id: null,
                        daysPresent: { $sum: { $cond: [{ $in: ["$status", ["present", "late", "half-day", "early-leave", "regularized"]] }, 1, 0] } },
                        daysLate: { $sum: { $cond: [{ $eq: ["$status", "late"] }, 1, 0] } },
                        totalWorkingDays: { $sum: 1 }
                    }
                }
            ]);

            let taskCompletionRate = 0;
            let lateTasks = 0;
            if (taskAgg.length > 0 && taskAgg[0].totalPoints > 0) {
                taskCompletionRate = Math.round((taskAgg[0].earnedPoints / taskAgg[0].totalPoints) * 100);
                lateTasks = taskAgg[0].lateTasks;
            }

            let attendanceRate = 0;
            let daysLate = 0;
            if (attendanceAgg.length > 0 && attendanceAgg[0].totalWorkingDays > 0) {
                attendanceRate = Math.round((attendanceAgg[0].daysPresent / attendanceAgg[0].totalWorkingDays) * 100);
                daysLate = attendanceAgg[0].daysLate;
            }

            let score = (taskCompletionRate * 0.6) + (attendanceRate * 0.4);
            let penalty = (daysLate * 2) + (lateTasks * 5);
            score = Math.max(0, Math.round(score - penalty));

            history.push({ month: monthName, score });
        }

        res.json({ success: true, data: history });

    } catch (error) {
        console.error("PerformanceHistory Error:", error);
        res.status(500).json({ success: false, message: error.message });
    }
};
