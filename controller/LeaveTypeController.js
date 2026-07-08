import LeaveType from "../models/leaveTypeSchema.js";
import User from "../models/UserSchema.js";

const resolveCompany = async (userId, bodyCompany) => {
    const u = await User.findById(userId).select("companyId role").populate("role", "name");
    const isSuperAdmin = u?.role?.name === "super_admin";
    return isSuperAdmin && bodyCompany ? bodyCompany : u?.companyId;
};

// GET /api/leave-types
export const getLeaveTypes = async (req, res) => {
    try {
        const u = await User.findById(req.user.userId).select("companyId role").populate("role", "name");
        const filter = { isDeleted: false };
        if (u?.role?.name !== "super_admin") filter.companyId = u.companyId;
        const types = await LeaveType.find(filter)
            .populate("createdBy", "firstName lastName")
            .populate("updatedBy", "firstName lastName")
            .sort({ name: 1 });
        res.status(200).json({ leaveTypes: types, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// GET /api/leave-types/by-company/:companyId
export const getLeaveTypesByCompany = async (req, res) => {
    try {
        const types = await LeaveType.find({ companyId: req.params.companyId, isDeleted: false, status: true }).sort({ name: 1 });
        res.status(200).json({ leaveTypes: types, success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// POST /api/leave-types
export const createLeaveType = async (req, res) => {
    try {
        const { name, code, description, defaultDays, isPaid, carryForward, maxCarryForward, companyId: bodyCompany } = req.body;
        const companyId = await resolveCompany(req.user.userId, bodyCompany);
        if (!name || !code) return res.status(400).json({ message: "Name and code are required", success: false });

        const lt = await LeaveType.create({ name, code: code.toUpperCase(), description, defaultDays, isPaid, carryForward, maxCarryForward, companyId, createdBy: req.user.userId });
        res.status(201).json({ leaveType: lt, message: "Leave type created", success: true });
    } catch (err) {
        if (err.code === 11000) return res.status(400).json({ message: "Leave type code already exists for this company", success: false });
        res.status(500).json({ message: err.message, success: false });
    }
};

// PUT /api/leave-types/:id
export const updateLeaveType = async (req, res) => {
    try {
        const { name, code, description, defaultDays, isPaid, carryForward, maxCarryForward, status } = req.body;
        const lt = await LeaveType.findById(req.params.id);
        if (!lt) return res.status(404).json({ message: "Leave type not found", success: false });
        if (name) lt.name = name;
        if (code) lt.code = code.toUpperCase();
        if (description !== undefined) lt.description = description;
        if (defaultDays !== undefined) lt.defaultDays = defaultDays;
        if (isPaid !== undefined) lt.isPaid = isPaid;
        if (carryForward !== undefined) lt.carryForward = carryForward;
        if (maxCarryForward !== undefined) lt.maxCarryForward = maxCarryForward;
        if (status !== undefined) lt.status = status;
        lt.updatedBy = req.user.userId;
        await lt.save();
        res.status(200).json({ leaveType: lt, message: "Leave type updated", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};

// DELETE /api/leave-types/:id
export const deleteLeaveType = async (req, res) => {
    try {
        const lt = await LeaveType.findById(req.params.id);
        if (!lt) return res.status(404).json({ message: "Leave type not found", success: false });
        lt.isDeleted = true; lt.updatedBy = req.user.userId;
        await lt.save();
        res.status(200).json({ message: "Leave type deleted", success: true });
    } catch (err) {
        res.status(500).json({ message: err.message, success: false });
    }
};
