import Lead from "../models/LeadSchema.js";
import Quote from "../models/QuoteSchema.js";
import Meeting from "../models/MeetingSchema.js";
import User from "../models/UserSchema.js";
import mongoose from "mongoose";

// helper
const cid = (req) => req.user.company ? new mongoose.Types.ObjectId(req.user.company) : null;

export const getSalesReport = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const companyId = cid(req);
        
        let matchQuery = {};
        
        // If not super_admin, filter by companyId
        if (req.user.role !== "super_admin") {
            matchQuery.companyId = companyId;
        }

        if (startDate && endDate) {
            matchQuery.createdAt = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        // 1. Total Leads
        const totalLeads = await Lead.countDocuments(matchQuery);

        // 2. Converted Leads ("Project Done")
        const totalConversions = await Lead.countDocuments({ 
            ...matchQuery, 
            status: "Project Done"
        });

        // 3. Meetings Done
        const totalMeetings = await Meeting.countDocuments({
            ...matchQuery,
            status: "Completed"
        });

        // 4. Revenue (Accepted Quotes)
        const acceptedQuotes = await Quote.find({
            ...matchQuery,
            status: "accepted"
        });
        const totalRevenue = acceptedQuotes.reduce((sum, q) => sum + (q.grandTotal || 0), 0);

        // BDE Performance Aggregation
        const leadAgg = await Lead.aggregate([
            { $match: matchQuery },
            { 
                $group: { 
                    _id: "$assignedTo", 
                    leadsCreated: { $sum: 1 },
                    leadsConverted: { $sum: { $cond: [{ $eq: ["$status", "Project Done"] }, 1, 0] } }
                } 
            }
        ]);

        const quoteAgg = await Quote.aggregate([
            { $match: { ...matchQuery, status: "accepted" } },
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
            { $match: { ...matchQuery, status: "Completed" } },
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
