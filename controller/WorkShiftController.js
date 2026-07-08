import WorkShift from "../models/workShiftSchema.js";
import User from "../models/UserSchema.js";
import { createNotification } from "../utills/notificationHelper.js";

// POST /api/workshift
export const createWorkShift = async (req, res) => {
    try {
        const { name, startTime, endTime, gracePeriod, lateThreshold, earlyLeaveThreshold, weekOff, companyId } = req.body;
        const userId = req.user.userId;

        if (!name || !startTime || !endTime || !companyId) {
            return res.status(400).json({ message: "Name, startTime, endTime and companyId are required", success: false });
        }

        const exists = await WorkShift.findOne({ name, companyId, isDeleted: false });
        if (exists) return res.status(400).json({ message: "Shift with this name already exists for this company", success: false });

        const shift = await WorkShift.create({
            name, startTime, endTime,
            gracePeriod: gracePeriod ?? 0,
            lateThreshold: lateThreshold ?? 30,
            earlyLeaveThreshold: earlyLeaveThreshold ?? 30,
            weekOff: Array.isArray(weekOff) ? weekOff : [0, 6],
            companyId,
            createdBy: userId,
        });

        const populated = await WorkShift.findById(shift._id)
            .populate("companyId", "name")
            .populate("createdBy", "firstName lastName");

        // Notify all users in the company
        const companyUsers = await User.find({ companyId, isDeleted: false }).select("_id");
        if (companyUsers.length) {
            await createNotification({
                userId: companyUsers.map(u => u._id),
                title: "New Work Shift Created",
                message: `Shift "${name}" (${startTime} – ${endTime}) has been added to your organization.`,
                type: "shift",
                link: "/work-shifts",
                createdBy: userId,
            });
        }

        res.status(201).json({ message: "Work shift created successfully", success: true, data: populated });
    } catch (error) {
        res.status(500).json({ message: error.message, success: false });
    }
};

// GET /api/workshift/company  — scoped to logged-in user's company (or all for super_admin)
export const getCompanyWorkShifts = async (req, res) => {
    try {
        const reqUser = await User.findById(req.user.userId).select("companyId role").populate("role", "name");
        if (!reqUser) return res.status(404).json({ message: "User not found", success: false });

        const filter = { isDeleted: false };
        if (reqUser.role?.name !== "super_admin") filter.companyId = reqUser.companyId;

        const shifts = await WorkShift.find(filter)
            .populate("companyId", "name")
            .populate("createdBy", "firstName lastName")
            .populate("updatedBy", "firstName lastName")
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: shifts });
    } catch (error) {
        res.status(500).json({ message: error.message, success: false });
    }
};

// GET /api/workshift/by-company/:companyId  — shifts for a specific company
export const getShiftsByCompany = async (req, res) => {
    try {
        const { companyId } = req.params;
        const shifts = await WorkShift.find({ companyId, isDeleted: false, status: true })
            .populate("createdBy", "firstName lastName")
            .sort({ name: 1 });
        res.status(200).json({ success: true, data: shifts });
    } catch (error) {
        res.status(500).json({ message: error.message, success: false });
    }
};

// PUT /api/workshift/:id
export const updateWorkShift = async (req, res) => {
    try {
        const { name, startTime, endTime, gracePeriod, lateThreshold, earlyLeaveThreshold, weekOff, status, companyId } = req.body;
        const userId = req.user.userId;

        const shift = await WorkShift.findById(req.params.id);
        if (!shift || shift.isDeleted) return res.status(404).json({ message: "Work shift not found", success: false });

        if (name) shift.name = name;
        if (startTime) shift.startTime = startTime;
        if (endTime) shift.endTime = endTime;
        if (gracePeriod !== undefined) shift.gracePeriod = gracePeriod;
        if (lateThreshold !== undefined) shift.lateThreshold = lateThreshold;
        if (earlyLeaveThreshold !== undefined) shift.earlyLeaveThreshold = earlyLeaveThreshold;
        if (Array.isArray(weekOff)) shift.weekOff = weekOff;
        if (status !== undefined) shift.status = status;
        if (companyId) shift.companyId = companyId;
        shift.updatedBy = userId;

        await shift.save();

        const populated = await WorkShift.findById(shift._id)
            .populate("companyId", "name")
            .populate("createdBy", "firstName lastName")
            .populate("updatedBy", "firstName lastName");

        // Notify users assigned to this shift
        const assignedUsers = await User.find({ workShift: shift._id }).select("_id");
        if (assignedUsers.length) {
            await createNotification({
                userId: assignedUsers.map(u => u._id),
                title: "Your Work Shift Updated",
                message: `Shift "${shift.name}" has been updated. New timing: ${shift.startTime} – ${shift.endTime}.`,
                type: "shift",
                link: "/work-shifts",
                createdBy: userId,
            });
        }

        res.status(200).json({ message: "Work shift updated successfully", success: true, data: populated });
    } catch (error) {
        res.status(500).json({ message: error.message, success: false });
    }
};

// DELETE /api/workshift/:id  (soft delete)
export const deleteWorkShift = async (req, res) => {
    try {
        const shift = await WorkShift.findById(req.params.id);
        if (!shift) return res.status(404).json({ message: "Work shift not found", success: false });
        shift.isDeleted = true;
        shift.updatedBy = req.user.userId;
        await shift.save();
        res.status(200).json({ message: "Work shift deleted successfully", success: true });
    } catch (error) {
        res.status(500).json({ message: error.message, success: false });
    }
};

// PATCH /api/workshift/:id/toggle
export const toggleWorkShiftStatus = async (req, res) => {
    try {
        const shift = await WorkShift.findById(req.params.id);
        if (!shift) return res.status(404).json({ message: "Work shift not found", success: false });
        shift.status = !shift.status;
        shift.updatedBy = req.user.userId;
        await shift.save();
        res.status(200).json({ message: `Shift ${shift.status ? "activated" : "deactivated"}`, success: true, data: shift });
    } catch (error) {
        res.status(500).json({ message: error.message, success: false });
    }
};
