import Company from "../models/CompanySchema.js"
import Role from "../models/roleSchema.js"
import User from "../models/UserSchema.js"
import bcrypt from "bcryptjs"
import { sendMail } from "../utills/SendEmail.js"
import { userCreatedTemplate } from "../utills/emailTemplates/userTemplate.js"
import { createNotification } from "../utills/notificationHelper.js"
import { uploadToCloudinary } from "../middleware/multer.js"

export const createCompany = async (req, res) => {
    try {
        const { name, address, domain } = req.body
        const existingCompany = await Company.findOne({ domain })
        if (existingCompany) {
            if (existingCompany.isDeleted) {
                existingCompany.isDeleted = false
                existingCompany.name = name
                existingCompany.address = address
                existingCompany.createdBy = req.user.userId
                    await existingCompany.save()
                return res.status(200).json({ message: "Company restored successfully", company: existingCompany, success: true })
            }
            return res.status(400).json({ message: "Company with this domain already exists" })
        }

        const newCompany = new Company({
            name,
            address,
            domain,
            createdBy: req.user.userId
        })
        await newCompany.save()
        res.status(201).json({ message: "Company created successfully", company: newCompany, success: true })


    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false })
    }
};

export const createCompanyWithAdmin = async (req, res) => {
    try {
        const {
            companyName,
            companyAddress,
            companyDomain,
            adminFirstName,
            adminLastName,
            adminEmail,
            adminPhone,
            adminPassword,
        } = req.body;

        // Validate required fields
        if (!companyName || !companyDomain || !adminFirstName || !adminLastName || !adminEmail || !adminPhone || !adminPassword) {
            return res.status(400).json({ message: "All fields are required", success: false });
        }

        // Check if company exists
        let company = await Company.findOne({ domain: companyDomain });

        if (company) {
            if (company.isDeleted) {
                // Restore soft-deleted company
                company.isDeleted = false;
                company.name = companyName;
                company.address = companyAddress;
                company.createdBy = req.user.userId;
                await company.save();
            } else {
                return res.status(400).json({ message: "Company with this domain already exists", success: false });
            }
        } else {
            // Create new company
            company = new Company({
                name: companyName,
                address: companyAddress,
                domain: companyDomain,
                createdBy: req.user.userId,
            });
            await company.save();
        }

        // Create Admin Role (if using a Role collection)
        let adminRole = await Role.findOne({ name: "admin", companyId: company._id });
        if (!adminRole) {
            adminRole = new Role({ name: "admin", companyId: company._id, permissions: ["Create_USER", "UPDATE_USER", "DELETE_USER", "VIEW_DEPARTMENT", "VIEW_USER", "VIEW_ALL_USERS", "Create_ROLE", "UPDATE_ROLE", "DELETE_ROLE", "VIEW_ROLE", "VIEW_ALL_ROLES"] }); // Add default permissions as needed});
            await adminRole.save();
        }

        // Check if admin user already exists
        const existingUser = await User.findOne({ email: adminEmail });
        if (existingUser) {
            return res.status(400).json({ message: "Admin user already exists", success: false });
        }

        // Hash admin password
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        // Create admin user
        const adminUser = new User({
            firstName: adminFirstName,
            lastName: adminLastName,
            email: adminEmail,
            phone: adminPhone,
            password: hashedPassword,
            role: adminRole._id,
            companyId: company._id,
            employeeCode: "ADMIN001", // default admin employee code
            joiningDate: new Date(),
        });
        await adminUser.save();

        // Notify the new admin user
        await createNotification({
            userId: adminUser._id,
            title: "Welcome to HRMS! 🎉",
            message: `Your company "${companyName}" has been set up. You are the admin. Login to get started.`,
            type: "company",
            link: "/",
            createdBy: req.user.userId,
        });

        // Send welcome email
        await sendMail({
            email: adminEmail,
            title: "Welcome to HRMS",
            msg: userCreatedTemplate(adminUser, adminPassword),
        });

        res.status(201).json({
            message: "Company, Admin role, and Admin user created successfully",
            company,
            adminRole,
            adminUser,
            success: true,
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error", success: false });
    }
};

export const getCompanies = async (req, res) => {
    try {
        const user = req.user;
        if (user.role === "super_admin") {
            const companies = await Company.find({ isDeleted: false }).populate("createdBy", "firstName lastName email")
            return res.status(200).json({ companies, success: true })
        }
        const companies = await Company.find({ _id: user.company, isDeleted: false }).populate("createdBy", "firstName lastName email")
        res.status(200).json({ companies, success: true })
    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false })
    }
};
export const getAllCompanies = async (req, res) => {
    try {
        const companies = await Company.find()
            .populate("createdBy", "firstName lastName")
            .populate("updatedBy", "firstName lastName")
            .lean();
        const companiesWithAdmins = await Promise.all(
            companies.map(async (company) => {
                const adminRole = await Role.findOne({ name: "admin", companyId: company._id, });
                let admins = [];
                if (adminRole) {
                    admins = await User.find({
                        companyId: company._id,
                        role: adminRole._id,
                    }).select("firstName lastName email phone");
                }
                return {
                    ...company,
                    admins,
                };
            })
        );

        res.status(200).json({
            companies: companiesWithAdmins,
            success: true,
        });
    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false })
    }
};

export const getCompanyById = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id).populate("createdBy", "firstName lastName email")
        if (!company) {
            return res.status(404).json({ message: "Company not found", success: false })
        }
        res.status(200).json({ company, success: true })
    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false })
    }
};

export const updateCompany = async (req, res) => {
    try {
        const { name, address, domain } = req.body
        const company = await Company.findById(req.params.id).populate("createdBy", "firstName lastName email")
        if (!company) {
            return res.status(404).json({ message: "Company not found", success: false })
        }
        // admin can only update their own company
        if (req.user.role !== "super_admin" && company._id.toString() !== req.user.company?.toString()) {
            return res.status(403).json({ message: "Not allowed", success: false })
        }
        company.name = name || company.name
        company.address = address || company.address
        company.domain = domain || company.domain
        company.updatedBy = req.user.userId
        await company.save()
        res.status(200).json({ message: "Company updated successfully", company, success: true })
    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false })
    }
};
export const updateCompanyWithAdmin = async (req, res) => {
    try {
        const {
            companyName,
            companyAddress,
            companyDomain,
            adminFirstName,
            adminLastName,
            adminEmail,
            adminPhone,
            adminPassword,
        } = req.body;

        // 🔹 Validate required fields
        if (!companyName || !companyDomain || !adminFirstName || !adminLastName || !adminEmail || !adminPhone) {
            return res.status(400).json({ message: "All company and admin fields are required", success: false });
        }

        // 🔹 Find the company
        const company = await Company.findById(req.params.id);
        if (!company) {
            return res.status(404).json({ message: "Company not found", success: false });
        }

        // 🔹 Update company fields
        company.name = companyName;
        company.address = companyAddress;
        company.domain = companyDomain;
        await company.save();

        // 🔹 Find first admin of this company
        let adminRole = await Role.findOne({ name: "Admin", companyId: company._id });
        let adminUser = await User.findOne({ companyId: company._id, role: adminRole?._id });

        if (adminUser) {
            // Update admin fields
            adminUser.firstName = adminFirstName;
            adminUser.lastName = adminLastName;
            adminUser.email = adminEmail;
            adminUser.phone = adminPhone;

            // Only hash & update password if provided
            if (adminPassword && adminPassword.trim() !== "") {
                adminUser.password = await bcrypt.hash(adminPassword, 10);
            }

            await adminUser.save();
        }

        res.status(200).json({
            message: "Company and admin updated successfully",
            company,
            adminUser,
            success: true,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Internal server error", success: false });
    }
};

export const deleteCompany = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id)
        if (!company) {
            return res.status(404).json({ message: "Company not found", success: false })
        }
        company.isDeleted = true
        await company.save()
        res.status(200).json({ message: "Company deleted successfully", success: true })
    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false })
    }
};

export const restoreCompany = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id).populate("createdBy", "firstName lastName email")
        if (!company) {
            return res.status(404).json({ message: "Company not found", success: false })
        }
        company.isDeleted = false
        await company.save()
        res.status(200).json({ message: "Company restored successfully", success: true })
    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false })
    }
};

export const toggleCompanyStatus = async (req, res) => {
    try {
        const company = await Company.findById(req.params.id)
        if (!company) {
            return res.status(404).json({ message: "Company not found", success: false })
        }
        company.status = !company.status
        await company.save()
        // Notify all users in the company
        const companyUsers = await User.find({ companyId: company._id }).select("_id");
        if (companyUsers.length) {
            await createNotification({
                userId: companyUsers.map(u => u._id),
                title: `Company ${company.status ? "Activated" : "Deactivated"}`,
                message: `Your company "${company.name}" has been ${company.status ? "activated" : "deactivated"}.`,
                type: "company",
                link: "/",
                createdBy: req.user.userId,
            });
        }
        res.status(200).json({ message: `Company ${company.status ? "activated" : "deactivated"} successfully`, success: true })
    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false })
    }
};


export const uploadCompanyIcon = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: "No file uploaded", success: false });

        const company = await Company.findById(req.params.id);
        if (!company) return res.status(404).json({ message: "Company not found", success: false });

        if (req.user.role !== "super_admin" && company._id.toString() !== req.user.company?.toString())
            return res.status(403).json({ message: "Not allowed", success: false });

        const uploaded = await uploadToCloudinary(req.file, "digicoders/hrms/company-icons");
        company.icon = { url: uploaded.url, publicId: uploaded.publicId };
        company.updatedBy = req.user.userId;
        await company.save();

        res.json({ message: "Icon uploaded", company, success: true });
    } catch (error) {
        res.status(500).json({ message: "Internal server error", success: false });
    }
};
