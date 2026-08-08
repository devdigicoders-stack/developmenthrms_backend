import Resignation from "../models/ResignationSchema.js";
import User from "../models/UserSchema.js";
import { createNotification } from "../utills/notificationHelper.js";

// POST /api/resignations
export const submitResignation = async (req, res) => {
    try {
        const { reason, requestedLastWorkingDay } = req.body;
        const userId = req.user.userId;

        // Check if already has a pending or approved resignation
        const existing = await Resignation.findOne({ 
            employeeId: userId, 
            status: { $in: ["Pending", "Approved"] } 
        });

        if (existing) {
            return res.status(400).json({ message: "You already have an active resignation request.", success: false });
        }

        const user = await User.findById(userId).select("companyId");
        
        const resignation = new Resignation({
            employeeId: userId,
            companyId: user?.companyId || req.user.companyId || null,
            reason,
            requestedLastWorkingDay,
            createdBy: userId
        });

        await resignation.save();

        const submittingUser = await User.findById(userId);
        
        // Notify Admins
        const admins = await User.find({ 
            $or: [ { companyId: submittingUser?.companyId }, { companyId: null } ]
        }).populate("role");
        
        const adminIds = admins.filter(a => 
            a.role?.name === "super_admin" || 
            a.role?.name === "admin" || 
            a.role?.permissions?.includes("MANAGE_RESIGNATIONS")
        ).map(a => a._id);

        if (adminIds.length > 0) {
            await createNotification({
                userId: adminIds,
                title: "New Resignation Request",
                message: `${submittingUser?.firstName} ${submittingUser?.lastName} has submitted a resignation request.`,
                type: "system",
                link: "/manage-resignations"
            });
        }

        res.status(201).json({ message: "Resignation submitted successfully.", resignation, success: true });
    } catch (error) {
        console.error("SUBMIT RESIGNATION ERROR:", error);
        res.status(500).json({ message: "Error submitting resignation.", error: error.message, success: false });
    }
};

// GET /api/resignations/my-resignation
export const getMyResignation = async (req, res) => {
    try {
        const userId = req.user.userId;
        const resignations = await Resignation.find({ employeeId: userId })
            .sort({ createdAt: -1 });

        res.status(200).json({ resignations, success: true });
    } catch (error) {
        console.error("GET MY RESIGNATION ERROR:", error);
        res.status(500).json({ message: "Error fetching resignation details.", error: error.message, success: false });
    }
};

// GET /api/resignations
export const getAllResignations = async (req, res) => {
    try {
        let companyId = req.user.companyId;
        let isSuperAdmin = false;

        if (!companyId) {
            const user = await User.findById(req.user.userId).populate("role");
            companyId = user?.companyId;
            if (user?.role?.name === "super_admin") {
                isSuperAdmin = true;
            }
        }

        const query = isSuperAdmin ? {} : { companyId };

        const resignations = await Resignation.find(query)
            .populate("employeeId", "firstName lastName email profilePic employeeCode designation department")
            .populate({
                path: "employeeId",
                populate: [
                    { path: "department", select: "name" },
                    { path: "designation", select: "name" }
                ]
            })
            .sort({ createdAt: -1 });

        res.status(200).json({ resignations, success: true });
    } catch (error) {
        console.error("GET ALL RESIGNATIONS ERROR:", error);
        res.status(500).json({ message: "Error fetching resignations.", error: error.message, success: false });
    }
};

// PATCH /api/resignations/:id/status
export const updateResignationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, remarks, approvedLastWorkingDay } = req.body;

        const resignation = await Resignation.findById(id);
        if (!resignation) {
            return res.status(404).json({ message: "Resignation not found.", success: false });
        }

        if (status) resignation.status = status;
        if (remarks !== undefined) resignation.remarks = remarks;
        if (approvedLastWorkingDay && status === "Approved") {
            resignation.approvedLastWorkingDay = approvedLastWorkingDay;
        }
        
        resignation.updatedBy = req.user.userId;
        await resignation.save();

        const updated = await Resignation.findById(id)
            .populate("employeeId", "firstName lastName email profilePic");

        // Notify Employee via FCM/In-App
        await createNotification({
            userId: updated.employeeId._id,
            title: `Resignation ${status}`,
            message: `Your resignation request has been ${status.toLowerCase()}.`,
            type: "system",
            link: "/my-resignation"
        });

        res.status(200).json({ message: `Resignation ${status.toLowerCase()} successfully.`, resignation: updated, success: true });
    } catch (error) {
        console.error("UPDATE RESIGNATION STATUS ERROR:", error);
        res.status(500).json({ message: "Error updating resignation.", error: error.message, success: false });
    }
};

// PATCH /api/resignations/:id/clearance
export const processClearance = async (req, res) => {
    try {
        const { id } = req.params;

        const resignation = await Resignation.findById(id);
        if (!resignation) {
            return res.status(404).json({ message: "Resignation not found.", success: false });
        }

        if (resignation.status !== "Approved") {
            return res.status(400).json({ message: "Cannot process clearance for an unapproved resignation.", success: false });
        }

        resignation.clearanceStatus = "Completed";
        resignation.updatedBy = req.user.userId;
        await resignation.save();

        // Deactivate the user
        await User.findByIdAndUpdate(resignation.employeeId, { isActive: false });

        res.status(200).json({ message: "Clearance completed. Employee account deactivated.", success: true });
    } catch (error) {
        console.error("PROCESS CLEARANCE ERROR:", error);
        res.status(500).json({ message: "Error processing clearance.", error: error.message, success: false });
    }
};
