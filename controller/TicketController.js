import Ticket from "../models/TicketSchema.js";
import { createNotification } from "../utills/notificationHelper.js";
import User from "../models/UserSchema.js";
import { getSubordinateIds } from "../utills/hierarchyHelper.js";

export const createTicket = async (req, res) => {
    try {
        const { projectId, subject, description, priority } = req.body;
        const ticket = await Ticket.create({
            userId: req.user.userId,
            companyId: req.user.company,
            projectId,
            subject,
            description,
            priority: priority || "Medium",
            status: "Open"
        });

        // Notify admins with MANAGE_TICKET
        const admins = await User.find({ "role.permissions": "MANAGE_TICKET", companyId: req.user.company });
        const adminIds = admins.map(a => a._id.toString());
        
        if (adminIds.length > 0) {
            await createNotification({
                userId: adminIds,
                title: "New Ticket Raised",
                message: `${req.user.firstName} ${req.user.lastName} raised a ticket: ${subject}`,
                type: "system",
                createdBy: req.user.userId
            });
        }

        res.status(201).json({ success: true, data: ticket });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getTickets = async (req, res) => {
    try {
        const isSuperAdmin = req.user.role === "super_admin";
        const canManage = isSuperAdmin || (req.user.permissions || []).includes("MANAGE_TICKET");
        const query = {};

        if (isSuperAdmin) {
            // Super Admin sees all tickets
        } else if (canManage) {
            // Admin/Manager with permission: see tickets from subordinates only
            const allowedIds = await getSubordinateIds(req.user.userId);
            query.userId = { $in: allowedIds };
        } else {
            // Regular employee: only their own tickets
            query.userId = req.user.userId;
        }

        const tickets = await Ticket.find(query)
            .populate("userId", "firstName lastName profilePic")
            .populate("projectId", "name")
            .sort({ createdAt: -1 });

        res.json({ success: true, data: tickets });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getTicketById = async (req, res) => {
    try {
        const query = { _id: req.params.id };
        if (req.user.role !== "super_admin") {
            query.companyId = req.user.company;
        }

        const ticket = await Ticket.findOne(query)
            .populate("userId", "firstName lastName profilePic")
            .populate("projectId", "name")
            .populate("responses.userId", "firstName lastName profilePic role");

        if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });

        const canManage = req.user.role === "super_admin" || (req.user.permissions || []).includes("MANAGE_TICKET");
        if (!canManage && ticket.userId._id.toString() !== req.user.userId) {
            return res.status(403).json({ success: false, message: "Permission denied" });
        }

        res.json({ success: true, data: ticket });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const updateTicketStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const query = { _id: req.params.id };
        if (req.user.role !== "super_admin") {
            query.companyId = req.user.company;
        }

        const ticket = await Ticket.findOneAndUpdate(
            query,
            { status },
            { new: true }
        );

        if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });

        await createNotification({
            userId: [ticket.userId],
            title: "Ticket Status Updated",
            message: `Your ticket "${ticket.subject}" is now ${status}`,
            type: "system",
            createdBy: req.user.userId
        });

        res.json({ success: true, data: ticket });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const replyToTicket = async (req, res) => {
    try {
        const { message } = req.body;
        const query = { _id: req.params.id };
        if (req.user.role !== "super_admin") {
            query.companyId = req.user.company;
        }

        const ticket = await Ticket.findOne(query);
        if (!ticket) return res.status(404).json({ success: false, message: "Ticket not found" });

        const canManage = req.user.role === "super_admin" || (req.user.permissions || []).includes("MANAGE_TICKET");
        if (!canManage && ticket.userId.toString() !== req.user.userId) {
            return res.status(403).json({ success: false, message: "Permission denied" });
        }

        ticket.responses.push({
            userId: req.user.userId,
            message
        });

        await ticket.save();

        // Notification logic
        const notifyIds = [];
        if (canManage && ticket.userId.toString() !== req.user.userId) {
            notifyIds.push(ticket.userId);
        } else {
            const admins = await User.find({ "role.permissions": "MANAGE_TICKET", companyId: req.user.company });
            admins.forEach(a => notifyIds.push(a._id.toString()));
        }

        if (notifyIds.length > 0) {
            await createNotification({
                userId: notifyIds,
                title: "New Reply on Ticket",
                message: `New reply on ticket: ${ticket.subject}`,
                type: "system",
                createdBy: req.user.userId
            });
        }

        const updatedTicket = await Ticket.findById(ticket._id)
            .populate("userId", "firstName lastName profilePic")
            .populate("projectId", "name")
            .populate("responses.userId", "firstName lastName profilePic role");

        res.json({ success: true, data: updatedTicket });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
