import Lead from "../models/LeadSchema.js";
import Quote from "../models/QuoteSchema.js";
import Meeting from "../models/MeetingSchema.js";
import User from "../models/UserSchema.js";
import mongoose from "mongoose";
import { getSubordinateIds } from "../utills/hierarchyHelper.js";

// helper
const cid = (req) => req.user.company ? new mongoose.Types.ObjectId(req.user.company) : null;

export const getSalesReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const companyId = cid(req);
        
        let matchQuery = {};
        
        const user = await User.findById(req.user.userId).populate("role");
        const roleName = user?.role?.name || req.user.role; // Fallback to jwt

        if (roleName !== "super_admin") {
            matchQuery.companyId = companyId;
        }

        if (startDate && endDate) {
            matchQuery.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        let leadMatchQuery = { ...matchQuery };
        let quoteMatchQuery = { ...matchQuery };
        let meetingMatchQuery = { ...matchQuery };

        if (roleName === "admin") {
            // Hierarchy filter
            const allowedIds = await getSubordinateIds(req.user.userId);
            leadMatchQuery.assignedTo = { $in: allowedIds };
            quoteMatchQuery.createdBy = { $in: allowedIds };
            meetingMatchQuery.assignedTo = { $in: allowedIds };
        } else if (roleName !== "super_admin") {
            leadMatchQuery.assignedTo = req.user.userId;
            quoteMatchQuery.createdBy = req.user.userId;
            meetingMatchQuery.assignedTo = req.user.userId;
        }

        // 1. Total Leads
        const totalLeads = await Lead.countDocuments(leadMatchQuery);

        // 2. Converted Leads ("Project Done")
        const totalConversions = await Lead.countDocuments({ 
            ...leadMatchQuery, 
            status: "Project Done"
        });

        // 3. Meetings Done
        const totalMeetings = await Meeting.countDocuments({
            ...meetingMatchQuery,
            status: "Completed"
        });

        // 4. Revenue (Accepted Quotes)
        const acceptedQuotes = await Quote.find({
            ...quoteMatchQuery,
            status: "accepted"
        });
        const totalRevenue = acceptedQuotes.reduce((sum, q) => sum + (q.grandTotal || 0), 0);

        // BDE Performance Aggregation
        const leadAgg = await Lead.aggregate([
            { $match: leadMatchQuery },
            { 
                $group: { 
                    _id: "$assignedTo", 
                    leadsCreated: { $sum: 1 },
                    leadsConverted: { $sum: { $cond: [{ $eq: ["$status", "Project Done"] }, 1, 0] } }
                } 
            }
        ]);

        const quoteAgg = await Quote.aggregate([
            { $match: { ...quoteMatchQuery, status: "accepted" } },
            {
                $lookup: {
                    from: "leads",
                    localField: "leadId",
                    foreignField: "_id",
                    as: "lead"
                }
            },
            { $unwind: "$lead" },
            {
                $group: {
                    _id: "$lead.assignedTo",
                    revenue: { $sum: "$grandTotal" }
                }
            }
        ]);

        const meetingAgg = await Meeting.aggregate([
            { $match: { ...meetingMatchQuery, status: "Completed" } },
            {
                $group: {
                    _id: "$assignedTo",
                    meetingsDone: { $sum: 1 }
                }
            }
        ]);

        // Merge performance data
        const performanceMap = {};
        
        const ensureBDE = (id) => {
            if (!id) return;
            const key = id.toString();
            if (!performanceMap[key]) {
                performanceMap[key] = { userId: key, leadsCreated: 0, leadsConverted: 0, revenue: 0, meetingsDone: 0 };
            }
        };

        leadAgg.forEach(item => {
            if (item._id) {
                ensureBDE(item._id);
                performanceMap[item._id.toString()].leadsCreated = item.leadsCreated;
                performanceMap[item._id.toString()].leadsConverted = item.leadsConverted;
            }
        });

        quoteAgg.forEach(item => {
            if (item._id) {
                ensureBDE(item._id);
                performanceMap[item._id.toString()].revenue = item.revenue;
            }
        });

        meetingAgg.forEach(item => {
            if (item._id) {
                ensureBDE(item._id);
                performanceMap[item._id.toString()].meetingsDone = item.meetingsDone;
            }
        });

        const userIds = Object.keys(performanceMap);
        const users = await User.find({ _id: { $in: userIds } }).select("firstName lastName profilePic");
        
        const bdePerformance = users.map(u => ({
            userId: u._id,
            name: `${u.firstName} ${u.lastName}`,
            profilePic: u.profilePic?.url || null,
            ...performanceMap[u._id.toString()]
        })).sort((a, b) => b.revenue - a.revenue);

        res.json({
            success: true,
            summary: {
                totalLeads,
                totalConversions,
                totalMeetings,
                totalRevenue
            },
            bdePerformance
        });

    } catch (error) {
        console.error("SalesReport Error:", error);
        res.status(500).json({ success: false, message: error.message, stack: error.stack });
    }
};
