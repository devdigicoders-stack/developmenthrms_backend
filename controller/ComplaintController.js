import Complaint from "../models/ComplaintSchema.js";
import User from "../models/UserSchema.js";
import { getSubordinateIds } from "../utills/hierarchyHelper.js";

export const createComplaint = async (req, res) => {
    try {
        const { title, description } = req.body;
        const userId = req.user.userId;
        let companyId = req.user.company;

        if (!companyId) {
            const user = await User.findById(userId).select("companyId");
            companyId = user?.companyId;
        }

        if (!title || !description) {
            return res.status(400).json({ message: "Title and description are required", success: false });
        }

        if (!companyId) {
            return res.status(400).json({ message: "Company ID missing for this user", success: false });
        }

        const complaint = new Complaint({
            userId,
            companyId,
            title,
            description,
        });

        await complaint.save();
        res.status(201).json({ message: "Complaint raised successfully", success: true, complaint });
    } catch (error) {
        console.error("Error creating complaint:", error);
        res.status(500).json({ message: "Failed to create complaint", success: false });
    }
};

export const getMyComplaints = async (req, res) => {
    try {
        const userId = req.user.userId;
        const complaints = await Complaint.find({ userId }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, complaints });
    } catch (error) {
        console.error("Error fetching my complaints:", error);
        res.status(500).json({ message: "Failed to fetch complaints", success: false });
    }
};

export const getAllComplaints = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).populate("role");
        const isSuperAdmin = req.user.role === 'super_admin' || user?.role?.name === 'super_admin';

        let filter = {};
        if (isSuperAdmin) {
            // Super Admin sees all complaints
        } else {
            // Hierarchy filter: only see complaints from subordinates
            const allowedIds = await getSubordinateIds(req.user.userId);
            filter.userId = { $in: allowedIds };
        }

        const complaints = await Complaint.find(filter)
            .populate("userId", "firstName lastName email profilePic")
            .populate("repliedBy", "firstName lastName")
            .sort({ createdAt: -1 });
            
        res.status(200).json({ success: true, complaints });
    } catch (error) {
        console.error("Error fetching all complaints:", error);
        res.status(500).json({ message: "Failed to fetch all complaints", success: false });
    }
};

export const updateComplaintStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, reply } = req.body;
        const repliedBy = req.user.userId;
        
        const user = await User.findById(req.user.userId).populate("role");
        const isSuperAdmin = req.user.role === 'super_admin' || user?.role?.name === 'super_admin';

        let companyId = req.user.company || user?.companyId;

        if (!["pending", "accepted", "rejected", "resolved"].includes(status)) {
            return res.status(400).json({ message: "Invalid status", success: false });
        }

        let query = { _id: id };
        if (!isSuperAdmin) {
            if (!companyId) return res.status(404).json({ message: "Complaint not found", success: false });
            query.companyId = companyId;
        }

        const complaint = await Complaint.findOne(query);
        
        if (!complaint) {
            return res.status(404).json({ message: "Complaint not found", success: false });
        }

        complaint.status = status;
        
        if (reply !== undefined) {
            complaint.reply = reply;
            complaint.repliedBy = repliedBy;
            complaint.repliedAt = new Date();
        }

        await complaint.save();
        res.status(200).json({ message: `Complaint ${status} successfully`, success: true, complaint });
    } catch (error) {
        console.error("Error updating complaint status:", error);
        res.status(500).json({ message: "Failed to update complaint status", success: false });
    }
};
