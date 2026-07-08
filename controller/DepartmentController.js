import Department from "../models/departmentSchema.js";
import User from "../models/UserSchema.js";
import { createNotification } from "../utills/notificationHelper.js";

export const createDepartment = async (req, res) => {
    try {
        const { name, description, companyId } = req.body;

        if (!name) {
            return res.status(400).json({ message: "Department name is required", success: false });
        }

        if (!companyId) {
            return res.status(400).json({ message: "Company ID is required", success: false });
        }
        let department = await Department.findOne({ name, companyId });

        if (department) {
            if (department.isDeleted) {
                department.isDeleted = false;
                department.description = description;
                department.companyId = companyId;
                department.createdBy = req.user.userId;
                await department.save();

                return res.status(200).json({
                    message: "Department restored successfully",
                    department,
                    success: true,
                });
            }

            return res.status(400).json({
                message: "Department with this name already exists",
                success: false,
            });
        }

        const newDepartment = new Department({
            name,
            description,
            companyId,
            createdBy: req.user.userId,
        });

        await newDepartment.save();

        // Notify company users
        const companyUsers = await User.find({ companyId }).select("_id");
        if (companyUsers.length) {
            await createNotification({
                userId: companyUsers.map(u => u._id),
                title: "New Department Created",
                message: `Department "${name}" has been added to your organization.`,
                type: "department",
                link: "/departments",
                createdBy: req.user.userId,
            });
        }

        res.status(201).json({
            message: "Department created successfully",
            department: newDepartment,
            success: true,
        });

    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false });
    }
};


export const getDepartments = async (req, res) => {
    try {
        let { page = 1, limit = 10 } = req.query;

        page = parseInt(page);
        limit = parseInt(limit);

        const skip = (page - 1) * limit;

        const departments = await Department.find({ isDeleted: false })
            .populate("companyId", "name")
            .populate("createdBy", "firstName lastName email")
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const totalCount = await Department.countDocuments({ isDeleted: false });

        res.status(200).json({
            message: "Departments fetched successfully",
            departments,
            totalCount,
            currentPage: page,
            totalPages: Math.ceil(totalCount / limit),
            limit,
            success: true,
        });

    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false });
    }
};


export const getAllDepartments = async (req, res) => {
    try {
        const departments = await Department.find()
            .populate("companyId", "name")
            .populate("createdBy", "firstName lastName email");

        const totalCount = await Department.countDocuments();

        res.status(200).json({
            departments,
            totalCount,
            success: true,
        });

    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false });
    }
};


export const getDepartmentById = async (req, res) => {
    try {
        const department = await Department.findById(req.params.id)
            .populate("companyId", "name")
            .populate("createdBy", "firstName lastName email");

        if (!department) {
            return res.status(404).json({ message: "Department not found", success: false });
        }

        res.status(200).json({ department, success: true });

    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false });
    }
};


export const updateDepartment = async (req, res) => {
    try {
        const { name, description, status, companyId } = req.body;

        const department = await Department.findById(req.params.id);

        if (!department) {
            return res.status(404).json({ message: "Department not found", success: false });
        }

        department.name = name || department.name;
        department.description = description || department.description;
        department.status = status ?? department.status;
        department.companyId = companyId || department.companyId;
        department.updatedBy = req.user.userId;

        await department.save();

        res.status(200).json({
            message: "Department updated successfully",
            department,
            success: true,
        });

    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false });
    }
};


export const deleteDepartment = async (req, res) => {
    try {
        const department = await Department.findById(req.params.id);

        if (!department) {
            return res.status(404).json({ message: "Department not found", success: false });
        }

        department.isDeleted = true;
        department.updatedBy = req.user.userId;
        await department.save();

        res.status(200).json({
            message: "Department deleted successfully",
            success: true,
        });

    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false });
    }
};


export const restoreDepartment = async (req, res) => {
    try {
        const department = await Department.findById(req.params.id);

        if (!department) {
            return res.status(404).json({ message: "Department not found", success: false });
        }

        department.isDeleted = false;
        await department.save();

        res.status(200).json({
            message: "Department restored successfully",
            success: true,
        });

    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false });
    }
};


export const toggleDepartmentStatus = async (req, res) => {
    try {
        const department = await Department.findById(req.params.id);

        if (!department) {
            return res.status(404).json({ message: "Department not found", success: false });
        }

        department.status = !department.status;
        department.updatedBy = req.user.userId;
        await department.save();

        res.status(200).json({
            message: `Department ${department.status ? "activated" : "deactivated"} successfully`,
            success: true,
        });

    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false });
    }
};


// export const getCompanyDepartments = async (req, res) => {
//     try {
//         const user = req.user;
//         if (!user) {
//             return res.status(404).json({ message: "User not found", success: false });
//         }
//         if (user.role === "super_admin") {
//             const departments = await Department.find({ isDeleted: false })
//                 .populate("companyId", "name")
//                 .populate("createdBy", "firstName lastName email");
//             const totalCount = await Department.countDocuments({ isDeleted: false });

//             return res.status(200).json({
//                 message: "Departments fetched successfully",
//                 departments,
//                 totalCount,
//                 success: true,
//             });
//         }


//         const departments = await Department.find({
//             companyId: user.company,
//             isDeleted: false,
//         });

//         const totalCount = await Department.countDocuments({
//             companyId: user.companyId,
//             isDeleted: false,
//         });

//         res.status(200).json({
//             message: "Departments fetched successfully",
//             departments,
//             totalCount,
//             success: true,
//         });

//     } catch (error) {
//         res.status(500).json({ message: "Internal server error", success: false });
//     }
// };

export const getCompanyDepartments = async (req, res) => {
    try {
        const user = req.user;
        let departments;
        if(user.role === "super_admin"){
               departments = await Department.find().populate("companyId", "name").populate("createdBy", "firstName lastName").populate("updatedBy", "firstName lastName");
        }
        else{
            departments = await Department.find({companyId:user.company}).populate("companyId", "name").populate("createdBy", "firstName lastName").populate("updatedBy", "firstName lastName");
        }
            return res.status(200).json({message: "Departments fetched successfully v1",departments,success: true,});
       } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false });
    }
};

export const getDepartmentsByCompany = async (req, res) => {
    try {
        const { companyId } = req.params;
        const departments = await Department.find({ companyId, isDeleted: false, status: true })
            .select("name description")
            .sort({ name: 1 });
        return res.status(200).json({ departments, success: true });
    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false });
    }
};
