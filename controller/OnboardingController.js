import OnboardingForm from "../models/OnboardingFormSchema.js";
import User from "../models/UserSchema.js";
import SalaryStructure from "../models/SalaryStructureSchema.js";
import { uploadToCloudinary } from "../middleware/multer.js";
import { sendMail } from "../utills/SendEmail.js";

// Helper to handle optional file uploads
const handleFileUpload = async (files, fieldName, folder) => {
    if (files && files[fieldName] && files[fieldName][0]) {
        const file = files[fieldName][0];
        const result = await uploadToCloudinary(file, folder);
        return { publicId: result.publicId, url: result.url };
    }
    return null;
};

export const submitOnboardingForm = async (req, res) => {
    try {
        const userId = req.user.userId;
        const companyId = req.user.company;

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found", success: false });

        if (user.onboardingStatus !== "pending_form") {
            return res.status(400).json({ message: "Form already submitted or approved", success: false });
        }

        const data = req.body;
        
        // Parse JSON strings back to objects (since form-data sends strings)
        let previousCompany = {};
        if (data.previousCompany) previousCompany = JSON.parse(data.previousCompany);
        
        let professionalReferences = [];
        if (data.professionalReferences) professionalReferences = JSON.parse(data.professionalReferences);
        
        let personalReferences = [];
        if (data.personalReferences) personalReferences = JSON.parse(data.personalReferences);

        const folder = `hrms/onboarding/${userId}`;

        // Handle all file uploads
        const cvFile = await handleFileUpload(req.files, "cvFile", folder);
        const highSchoolCertificate = await handleFileUpload(req.files, "highSchoolCertificate", folder);
        const intermediateCertificate = await handleFileUpload(req.files, "intermediateCertificate", folder);
        const diplomaCertificate = await handleFileUpload(req.files, "diplomaCertificate", folder);
        const graduationCertificate = await handleFileUpload(req.files, "graduationCertificate", folder);
        const aadharFront = await handleFileUpload(req.files, "aadharFront", folder);
        const aadharBack = await handleFileUpload(req.files, "aadharBack", folder);
        const panCard = await handleFileUpload(req.files, "panCard", folder);
        const bankPassbook = await handleFileUpload(req.files, "bankPassbook", folder);
        const passportPhoto = await handleFileUpload(req.files, "passportPhoto", folder);
        const fullSizePhoto = await handleFileUpload(req.files, "fullSizePhoto", folder);

        // Previous company documents
        previousCompany.offerLetterFile = await handleFileUpload(req.files, "offerLetterFile", folder);
        previousCompany.experienceLetterFile = await handleFileUpload(req.files, "experienceLetterFile", folder);
        previousCompany.relievingLetterFile = await handleFileUpload(req.files, "relievingLetterFile", folder);
        previousCompany.salarySlipsFile = await handleFileUpload(req.files, "salarySlipsFile", folder);

        const formDataToSave = {
            user: userId,
            companyId,
            alternateMobile: data.alternateMobile,
            linkedInProfile: data.linkedInProfile,
            permanentAddress: data.permanentAddress,
            currentAddress: data.currentAddress,
            yearsOfExperience: data.yearsOfExperience,
            cvFile,
            highSchoolCertificate,
            intermediateCertificate,
            diplomaCertificate,
            graduationCertificate,
            aadharFront,
            aadharBack,
            panCard,
            bankPassbook,
            passportPhoto,
            fullSizePhoto,
            previousCompany,
            professionalReferences,
            personalReferences,
            status: "submitted"
        };

        // If a form already exists (e.g. previous submission failed halfway), delete it to avoid E11000
        await OnboardingForm.findOneAndDelete({ user: userId });

        const form = new OnboardingForm(formDataToSave);

        await form.save();

        // Update user status and additional details
        user.onboardingStatus = "pending_approval";
        if (data.phone) user.phone = data.phone;
        if (data.dateOfBirth) user.dateOfBirth = data.dateOfBirth;
        if (data.gender) user.gender = data.gender;
        if (data.firstName) user.firstName = data.firstName;
        if (data.lastName) user.lastName = data.lastName;
        // Don't update email unless absolutely necessary, or update it if provided
        if (data.email && data.email !== user.email) {
            // Optional: check if email is taken before updating
            user.email = data.email;
        }
        await user.save();

        res.status(201).json({ message: "Onboarding form submitted successfully. Please wait for Admin approval.", success: true });
    } catch (error) {
        console.error("Submit Onboarding Error:", error);
        res.status(500).json({ message: error.message || "Failed to submit onboarding form", success: false });
    }
};

export const getPendingOnboardingRequests = async (req, res) => {
    try {
        const query = {};
        if (req.user.company) {
            query.companyId = req.user.company;
        }
        
        const requests = await OnboardingForm.find(query)
            .populate("user", "firstName lastName email phone dateOfBirth gender");
        
        res.status(200).json({ requests, success: true });
    } catch (error) {
        res.status(500).json({ message: "Error fetching onboarding requests", success: false });
    }
};

export const approveOnboarding = async (req, res) => {
    try {
        const { id } = req.params; // OnboardingForm ID
        const { basicSalary } = req.body;

        if (!basicSalary || basicSalary <= 0) {
            return res.status(400).json({ message: "Basic salary is required for approval", success: false });
        }

        const form = await OnboardingForm.findById(id).populate("user");
        if (!form) return res.status(404).json({ message: "Onboarding form not found", success: false });

        if (form.status === "approved") {
            return res.status(400).json({ message: "Already approved", success: false });
        }

        // Approve form
        form.status = "approved";
        form.reviewedBy = req.user.userId;
        await form.save();

        // Update user status
        const user = form.user;
        user.onboardingStatus = "approved";
        await user.save();

        // Create Salary Structure
        const salary = new SalaryStructure({
            userId: user._id,
            companyId: form.companyId,
            ctc: basicSalary, // Setting the overall CTC
            basic: Math.round(basicSalary * 0.4), // 40% of CTC for Basic
            effectiveFrom: new Date().toISOString().slice(0, 7), // "YYYY-MM" format usually
            earnings: [],
            deductions: []
        });
        await salary.save();

        // Send Offer Letter Email
        const msg = `
            <h2>Offer Letter from HRMS</h2>
            <p>Dear ${user.firstName} ${user.lastName},</p>
            <p>We are thrilled to offer you a position at our company. Your onboarding application has been formally approved.</p>
            <p><strong>Your CTC (Basic Salary) has been fixed at: ₹${basicSalary} per month.</strong></p>
            <p>You can now log in to the dashboard to access your employee portal, view attendance, and manage your leaves.</p>
            <p>Welcome to the team!</p>
            <br/>
            <p>Best Regards,</p>
            <p>HR Department</p>
        `;
        
        await sendMail({ email: user.email, title: "Offer Letter - Application Approved! 🎉", msg });

        res.status(200).json({ message: "Employee approved successfully", success: true });
    } catch (error) {
        console.error("Approve Onboarding Error:", error);
        res.status(500).json({ message: "Failed to approve employee", success: false });
    }
};

export const getMyOfferLetter = async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId).populate("companyId");
        if (!user) return res.status(404).json({ message: "User not found", success: false });

        if (user.onboardingStatus !== "approved") {
            return res.status(403).json({ message: "Offer letter is only available after approval.", success: false });
        }

        const salary = await SalaryStructure.findOne({ userId }).sort({ createdAt: -1 });
        if (!salary) {
            return res.status(404).json({ message: "Salary structure not found", success: false });
        }

        res.status(200).json({
            success: true,
            user: {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                dateOfJoining: salary.createdAt // Fallback to salary creation date as offer date
            },
            company: user.companyId,
            ctc: salary.ctc,
            basic: salary.basic
        });
    } catch (error) {
        console.error("Get Offer Letter Error:", error);
        res.status(500).json({ message: "Failed to fetch offer letter", success: false });
    }
};
