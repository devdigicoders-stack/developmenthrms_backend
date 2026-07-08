import Role from "../models/roleSchema.js";
import User from "../models/UserSchema.js";
import { createNotification } from "../utills/notificationHelper.js";
import { stripSuperAdminOnlyPermissions } from "../config/superAdminOnly.js";
export const createRole = async (req, res) => {
    try {
        const { name, permissions } = req.body;
        const { userId } = req.user;
        const companyId = req.body.companyId || req.user.company; // Allow companyId from body or fallback to user's company
        if (!name) {
            return res.status(400).json({ message: "Name is required", success: false });
        }
        const roleExists = await Role.findOne({ name, companyId });
        if (roleExists) {
            if (roleExists.isdeleted) {
                roleExists.isdeleted = false;
                roleExists.status = true;
                roleExists.permissions = stripSuperAdminOnlyPermissions(
                    permissions || roleExists.permissions
                );
                roleExists.companyId = companyId || roleExists.companyId;
                roleExists.createdBy = userId;
                await roleExists.save();
                return res.status(200).json({ message: "Role restored successfully", success: true, data: roleExists });
            }
            return res.status(400).json({ message: "Role with the same name already exists", success: false });
        }
        const newRole = new Role({
            name,
            permissions: stripSuperAdminOnlyPermissions(permissions),
            companyId,
            createdBy: userId,
        });
        await newRole.save();
        // Notify all users in the company about new role
        const companyUsers = await User.find({ companyId }).select("_id");
        if (companyUsers.length) {
            await createNotification({
                userId: companyUsers.map(u => u._id),
                title: "New Role Created",
                message: `A new role "${name}" has been created in your organization.`,
                type: "role",
                link: "/settings/roles",
                createdBy: userId,
            });
        }
        res.status(201).json({ message: "Role created successfully", success: true, data: newRole });
    } catch (error) {
        res.status(400).json({ message: error.message, success: false });
    }
};

export const getAllRolesByCompany= async(req, res)=>{
    try {
        const { companyId } = req.params;
        const roles = await Role.find({ companyId, isdeleted: false }).populate("createdBy", "firstName lastName").populate("updatedBy", "firstName lastName");
        res.status(200).json({ message: "Roles retrieved successfully", success: true, data: roles });
    } catch (error) {
        res.status(400).json({ message: error.message, success: false });
    }
}

export const getRoles = async (req, res) => {
    try {
        const roles = await Role.find({ isdeleted: false }).populate("createdBy", "firstName lastName").populate("updatedBy", "firstName lastName");
        res.status(200).json({ message: "Roles retrieved successfully", success: true, data: roles });
    } catch (error) {
        res.status(400).json({ message: error.message, success: false });
    }
};

export const getAllRoles = async (req, res) => {
    try {
        const roles = await Role.find({ isdeleted: false }).populate("companyId").populate("createdBy", "firstName lastName").populate("updatedBy", "firstName lastName");
        res.status(200).json({ message: "Roles retrieved successfully", success: true, data: roles });
    } catch (error) {
        res.status(400).json({ message: error.message, success: false });
    }
};

export const getAllCompanyRoles = async (req, res) => {
    try {
        const userId = req.user.userId; // Correctly extract userId
        const userData = await User.findById(userId);

        if (!userData) {
            return res.status(404).json({ 
                message: "User not found", 
                success: false 
            });
        }

        const companyId = userData.companyId;
        const roles = await Role.find({ companyId, isdeleted: false }).populate("companyId").populate("createdBy", "firstName lastName").populate("updatedBy", "firstName lastName");

        res.status(200).json({
            message: "Roles retrieved successfully",
            success: true,
            data: roles
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: error.message,
            success: false
        });
    }
};

export const updateRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, permissions, status, companyId } = req.body;
        const role = await Role.findById(id);
        if (!role) {
            return res.status(404).json({ message: "Role not found", success: false });
        }
        if (name) {
            role.name = name;
        }
        if (permissions) {
            role.permissions = stripSuperAdminOnlyPermissions(permissions);
        }
        if (status !== undefined) {
            role.status = status;
        }
        if (companyId) role.companyId = companyId;
        role.updatedBy = req.user.userId;
        await role.save();
        res.status(200).json({ message: "Role updated successfully", success: true, data: role });
    } catch (error) {
        res.status(400).json({ message: error.message, success: false });
    }
};

export const deleteRole = async (req, res) => {
    try {
        const { id } = req.params;
        const role = await Role.findById(id);
        if (!role) {
            return res.status(404).json({ message: "Role not found", success: false });
        }
        role.isdeleted = true;
        role.updatedBy = req.user.userId;
        await role.save();
        res.status(200).json({ message: "Role deleted successfully", success: true, data: role });
    } catch (error) {
        res.status(400).json({ message: error.message, success: false });
    }
};

export const restoreRole = async (req, res) => {
    try {
        const { id } = req.params;
        const role = await Role.findById(id);
        if (!role) {
            return res.status(404).json({ message: "Role not found", success: false });
        }
        role.isdeleted = false;
        await role.save();
        res.status(200).json({ message: "Role restored successfully", success: true, data: role });
    } catch (error) {
        res.status(400).json({ message: error.message, success: false });
    }
};

export const toggleRoleStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const role = await Role.findById(id);
        if (!role) {
            return res.status(404).json({ message: "Role not found", success: false });
        }
        role.status = !role.status;
        role.updatedBy = req.user.userId;
        await role.save();
        res.status(200).json({ message: "Role status toggled successfully", success: true, data: role });
    }
    catch (error) {
        res.status(400).json({ message: error.message, success: false });
    }
};