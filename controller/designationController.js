import Designation from "../models/designationSchema.js";
import Department from "../models/departmentSchema.js";

export const createDesignation = async (req, res) => {
    try {
        const { name, department , companyId} = req.body;
        if (!name || !department || !companyId) {
            return res.status(400).json({ message: "Name, department, and company ID are required", success: false });
        }
        const departmentExists = await Department.findById(department);
        if (!departmentExists) {
            return res.status(404).json({ message: "Department not found", success: false });
        }
        if (companyId !== departmentExists.companyId) {
            return res.status(400).json({ message: "Company ID does not match the department's company", success: false });
        }
        const designationExists = await Designation.findOne({ name, department });
        if (designationExists) {
            if (designationExists.isdeleted) {
                designationExists.isdeleted = false;
                designationExists.status = true;
                designationExists.companyId = companyId;
                await designationExists.save();
                return res.status(200).json({ message: "Designation restored successfully", success: true, data: designationExists });
            }
            return res.status(400).json({ message: "Designation with the same name already exists in this department", success: false });
        }
        const newDesignation = new Designation({ name, department, companyId });
        await newDesignation.save();
        res.status(201).json({ message: "Designation created successfully", success: true, data: newDesignation });
    } catch (error) {
        res.status(400).json({ message: error.message, success: false });
    }
};

export const getDesignations = async (req, res) => {
    try {
        const designations = await Designation.find({ isdeleted: false }).populate("department", "name");
        res.status(200).json({ message: "Designations retrieved successfully", success: true, data: designations });
    } catch (error) {
        res.status(400).json({ message: error.message, success: false });
    }
};

export const getAllDesignations = async (req, res) => {
    try {
        const designations = await Designation.find().populate("department", "name");
        res.status(200).json({ message: "Designations retrieved successfully", success: true, data: designations });
    } catch (error) {
        res.status(400).json({ message: error.message, success: false });
    }
};

export const getDesignationsByDepartment = async (req, res) => {
    try {
        const { departmentId } = req.params;
        const designations = await Designation.find({ department: departmentId, isdeleted: false }).populate("department", "name");
        res.status(200).json({ message: "Designations retrieved successfully", success: true, data: designations });
    } catch (error) {
        res.status(400).json({ message: error.message, success: false });
    }
};


export const updateDesignation = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, department, status, companyId } = req.body;
        if (!name && !department && status === undefined) {
            return res.status(400).json({ message: "At least one field (name, department, or status) is required to update", success: false });
        }
        const designation = await Designation.findById(id);
        if (!designation) {
            return res.status(404).json({ message: "Designation not found", success: false });
        }
        
        if (department) {
            const departmentExists = await Department.findById(department);
            if (!departmentExists) {
                return res.status(404).json({ message: "Department not found", success: false });
            }
        }
        const duplicateDesignation = await Designation.findOne({ name, department, _id: { $ne: id } });
        if (duplicateDesignation) {
            return res.status(400).json({ message: "Another designation with the same name already exists in this department", success: false });
        }
        designation.name = name || designation.name;
        designation.department = department || designation.department;
        designation.companyId = companyId || designation.companyId;
        if (status !== undefined) {
            designation.status = status;
        }
        await designation.save();
        res.status(200).json({ message: "Designation updated successfully", success: true, data: designation });
    } catch (error) {
        res.status(400).json({ message: error.message, success: false });
    }
};

export const deleteDesignation = async (req, res) => {
    try {
        const { id } = req.params;
        const designation = await Designation.findById(id);
        if (!designation) {
            return res.status(404).json({ message: "Designation not found", success: false });
        }
        designation.isdeleted = true;
        await designation.save();
        res.status(200).json({ message: "Designation deleted successfully", success: true, data: designation });
    } catch (error) {
        res.status(400).json({ message: error.message, success: false });
    }
};

export const restoreDesignation = async (req, res) => {
    try {
        const { id } = req.params;
        const designation = await Designation.findById(id);
        if (!designation) {
            return res.status(404).json({ message: "Designation not found", success: false });
        }
        designation.isdeleted = false;
        await designation.save();
        res.status(200).json({ message: "Designation restored successfully", success: true, data: designation });
    } catch (error) {
        res.status(400).json({ message: error.message, success: false });
    }
};

export const toggleDesignationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const designation = await Designation.findById(id);
        if (!designation) {
            return res.status(404).json({ message: "Designation not found", success: false });
        }
        designation.status = !designation.status;
        await designation.save();
        res.status(200).json({ message: "Designation status toggled successfully", success: true, data: designation });
    } catch (error) {
        res.status(400).json({ message: error.message, success: false });
    }
};