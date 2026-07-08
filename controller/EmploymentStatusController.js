import EmploymentStatus from "../models/employmentStatusSchema.js";
import User from "../models/UserSchema.js";
import { createNotification } from "../utills/notificationHelper.js";

// POST /api/employment-status
export const createEmployeeStatus = async (req, res) => {
    try {
        const { name, description, companyId } = req.body;
        const userId = req.user.userId;
        const resolvedCompany = companyId || req.user.company;

        if (!name || !resolvedCompany) {
            return res.status(400).json({ message: "Name and companyId are required", success: false });
        }
        const exists = await EmploymentStatus.findOne({ name, companyId: resolvedCompany, isdeleted: false });
        if (exists) return res.status(400).json({ message: "Status with this name already exists", success: false });

        const status = await EmploymentStatus.create({ name, description, companyId: resolvedCompany, createdBy: userId });
        const populated = await EmploymentStatus.findById(status._id).populate("createdBy", "firstName lastName");

        res.status(201).json({ employmentStatus: populated, message: "Employment status created", success: true });
    } catch (error) {
        res.status(500).json({ message: error.message, success: false });
    }
};

// GET /api/employment-status/company — scoped to logged-in user's company
export const getCompanyEmploymentStatuses = async (req, res) => {
    try {
        const reqUser = await User.findById(req.user.userId).select("companyId role").populate("role", "name");
        if (!reqUser) return res.status(404).json({ message: "User not found", success: false });

        const filter = { isdeleted: false };
        if (reqUser.role?.name !== "super_admin") filter.companyId = reqUser.companyId;

        const statuses = await EmploymentStatus.find(filter)
            .populate("companyId", "name")
            .populate("createdBy", "firstName lastName")
            .populate("updatedBy", "firstName lastName")
            .sort({ name: 1 });

        res.status(200).json({ employmentStatuses: statuses, success: true });
    } catch (error) {
        res.status(500).json({ message: error.message, success: false });
    }
};

// GET /api/employment-status/by-company/:companyId
export const getStatusesByCompany = async (req, res) => {
    try {
        const statuses = await EmploymentStatus.find({ companyId: req.params.companyId, isdeleted: false, status: true })
            .sort({ name: 1 });
        res.status(200).json({ employmentStatuses: statuses, success: true });
    } catch (error) {
        res.status(500).json({ message: error.message, success: false });
    }
};

// PUT /api/employment-status/:id
export const updateEmployeeStatus = async (req, res) => {
    try {
        const { name, description, status } = req.body;
        const es = await EmploymentStatus.findById(req.params.id);
        if (!es) return res.status(404).json({ message: "Employment status not found", success: false });

        if (name) es.name = name;
        if (description !== undefined) es.description = description;
        if (status !== undefined) es.status = status;
        es.updatedBy = req.user.userId;
        await es.save();

        const populated = await EmploymentStatus.findById(es._id)
            .populate("createdBy", "firstName lastName")
            .populate("updatedBy", "firstName lastName");

        res.status(200).json({ employmentStatus: populated, message: "Updated successfully", success: true });
    } catch (error) {
        res.status(500).json({ message: error.message, success: false });
    }
};

// DELETE /api/employment-status/:id
export const deleteEmployeeStatus = async (req, res) => {
    try {
        const es = await EmploymentStatus.findById(req.params.id);
        if (!es) return res.status(404).json({ message: "Employment status not found", success: false });
        es.isdeleted = true;
        es.updatedBy = req.user.userId;
        await es.save();
        res.status(200).json({ message: "Deleted successfully", success: true });
    } catch (error) {
        res.status(500).json({ message: error.message, success: false });
    }
};

// PATCH /api/employment-status/:id/toggle
export const toggleEmployeeStatus = async (req, res) => {
    try {
        const es = await EmploymentStatus.findById(req.params.id);
        if (!es) return res.status(404).json({ message: "Employment status not found", success: false });
        es.status = !es.status;
        es.updatedBy = req.user.userId;
        await es.save();
        res.status(200).json({ message: `Status ${es.status ? "activated" : "deactivated"}`, success: true });
    } catch (error) {
        res.status(500).json({ message: error.message, success: false });
    }
};
