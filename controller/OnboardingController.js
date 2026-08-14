import OnboardingForm from "../models/OnboardingFormSchema.js";
import User from "../models/UserSchema.js";
import SalaryStructure from "../models/SalaryStructureSchema.js";
import Role from "../models/roleSchema.js";
import { uploadToCloudinary } from "../middleware/multer.js";
import { getSubordinateIds } from "../utills/hierarchyHelper.js";
import { createNotification } from "../utills/notificationHelper.js";
import { sendMail } from "../utills/SendEmail.js";
import { generateOfferPdfBuffer } from "../utills/offerPdfGenerator.js";
import puppeteer from "puppeteer";

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

        try {
            const roles = await Role.find({ name: { $in: ["super_admin", "admin", "hr"] } }).select("_id");
            const roleIds = roles.map(r => r._id);
            const filter = { role: { $in: roleIds }, isActive: true };
            if (companyId) filter.$or = [{ companyId }, { companyId: null }];
            const admins = await User.find(filter).select("_id");
            const adminIds = admins.map(a => a._id);
            
            if (adminIds.length > 0) {
                await createNotification({
                    userId: adminIds,
                    title: "New Onboarding Form 📝",
                    message: `${user.firstName || 'Employee'} ${user.lastName || ''} has submitted their onboarding form.`,
                    type: "user",
                    link: "/onboarding",
                    createdBy: req.user.userId
                });
            }
        } catch (err) {
            console.error("Failed to notify HR/Admin for Onboarding", err);
        }

        res.status(201).json({ message: "Onboarding form submitted successfully. Please wait for Admin approval.", success: true });
    } catch (error) {
        console.error("Submit Onboarding Error:", error);
        res.status(500).json({ message: error.message || "Failed to submit onboarding form", success: false });
    }
};

export const getPendingOnboardingRequests = async (req, res) => {
    try {
        const reqUser = await User.findById(req.user.userId).populate("role");
        const isSuperAdmin = reqUser?.role?.name === "super_admin";

        const query = {};
        if (isSuperAdmin) {
            // Super Admin sees all onboarding requests
        } else {
            // Hierarchy filter:
            // Admin B1 sees onboarding requests of B1's hierarchy only
            // Admin B2's employees' requests are NOT visible to Admin B1
            const allowedIds = await getSubordinateIds(req.user.userId);
            query.user = { $in: allowedIds };
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

        const form = await OnboardingForm.findById(id)
            .populate({ path: "user", populate: [{ path: "role" }, { path: "designation" }] })
            .populate("companyId");
        if (!form) return res.status(404).json({ message: "Onboarding form not found", success: false });

        if (form.status === "approved") {
            return res.status(400).json({ message: "Already approved", success: false });
        }

        // Update form and user status in memory (Not saved yet)
        form.status = "approved";
        form.reviewedBy = req.user.userId;
        
        const user = form.user;
        user.onboardingStatus = "approved";

        // Prepare Salary Structure in memory (Not saved yet)
        const salary = new SalaryStructure({
            userId: user._id,
            companyId: form.companyId ? form.companyId._id : null,
            ctc: basicSalary, // Setting the overall CTC
            basic: Math.round(basicSalary * 0.4), // 40% of CTC for Basic
            effectiveFrom: new Date().toISOString().slice(0, 7), // "YYYY-MM" format usually
            components: [] // Using components array as per schema
        });

        // Send Offer Letter Email
        const emailMsg = `
            <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; color: #333; max-width: 600px;">
                <p>Dear ${user.firstName} ${user.lastName},</p>
                <p>Congratulations!</p>
                <p>We are delighted to inform you that your onboarding process has been successfully completed and approved by the management.</p>
                <p>It is our pleasure to officially welcome you to Digicoder Private Limited. Please find your Offer Letter attached to this email in PDF format. Kindly review the document carefully and keep it for your records.</p>
                <p>Your employee dashboard has been activated successfully. You can log in using your assigned credentials to:</p>
                <ul style="line-height: 1.8;">
                    <li>Access your daily tasks</li>
                    <li>Mark and view your attendance</li>
                    <li>Apply for and track leave requests</li>
                    <li>Stay updated with company activities and announcements</li>
                </ul>
                <p>We are excited to have you as a part of our team. We believe your skills, dedication, and enthusiasm will contribute significantly to our organization's growth and success.</p>
                <p>Should you have any questions or require any assistance, please feel free to contact the HR Department.</p>
                <p>We wish you a successful and rewarding journey with Digicoder Private Limited.</p>
                <br/>
                <p style="margin-bottom: 5px;">Warm Regards,</p>
                <p style="margin: 0;"><strong>Human Resources Department</strong></p>
                <p style="margin: 0;">Digicoder Private Limited</p>
            </div>
        `;

        const company = form.companyId;
        const dateOptions = { month: 'long', day: 'numeric', year: 'numeric' };
        const today = new Date().toLocaleDateString('en-US', dateOptions);
        const joinDate = new Date(user.dateOfJoining || Date.now()).toLocaleDateString('en-US', dateOptions);
        const roleName = user.designation?.name || user.role?.name || 'Developer';
        const companyName = company?.name || 'DigiCoders';
        let logoUrl = company?.icon?.url || '';
        if (logoUrl && logoUrl.startsWith('/')) {
            const protocol = req.protocol === 'http' && req.get('host').includes('localhost') ? 'http' : 'https';
            logoUrl = `${protocol}://${req.get('host')}${logoUrl}`;
        }

        const pdfHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 0; margin: 0; color: #333; }
                    .page { width: 210mm; min-height: 297mm; padding: 20mm; box-sizing: border-box; position: relative; margin: 0 auto; background: white; page-break-after: always; }
                    .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.15; width: 85%; z-index: 0; }
                    .content-wrapper { position: relative; z-index: 10; font-size: 14px; line-height: 1.6; text-align: justify; }
                    .header-logo { text-align: center; margin-bottom: 20px; }
                    .header-logo img { height: 60px; object-fit: contain; }
                    .header-title { text-align: center; font-size: 24px; font-weight: 900; color: #111; margin-bottom: 20px; }
                    .title { text-align: center; font-weight: bold; font-size: 20px; text-decoration: underline; margin-bottom: 40px; text-underline-offset: 4px; }
                    p { margin-bottom: 12px; }
                    .mt-3 { margin-top: 12px; }
                    .mt-8 { margin-top: 32px; }
                    .mt-12 { margin-top: 48px; }
                    .mt-16 { margin-top: 64px; }
                    .ml-6 { margin-left: 24px; }
                    .leading-loose { line-height: 2; }
                    .flex-end { display: flex; align-items: flex-end; }
                </style>
            </head>
            <body>
                <!-- Page 1 -->
                <div class="page">
                    ${logoUrl ? '<img src="' + logoUrl + '" class="watermark" />' : ''}
                    <div class="content-wrapper">
                        <div class="header-logo">
                            ${logoUrl ? '<img src="' + logoUrl + '" />' : '<div class="header-title">' + companyName + '</div>'}
                        </div>
                        <div class="title">Offer Letter</div>
                        <p>Dated: ${today}</p>
                        <p>Mr ${user.firstName} ${user.lastName}</p>
                        <p>B/o ${user.address || "Address"}</p>
                        <p class="mt-3">Dear ${user.firstName},</p>
                        <p>We are pleased to inform you that, with reference to your application and subsequent interview you had with us, we are pleased to offer you as a <strong>"${roleName}"</strong> at our Corporate Head Office - Lucknow, on the terms and conditions discussed and agreed by you at the time of your interview. You are requested to join us on <strong>${joinDate}</strong> as agreed by you. Your monthly remuneration will be ${Number(basicSalary).toLocaleString("en-IN")} INR and Your work timings will be <strong>10:00AM to 07:00PM, Monday to Saturday</strong>. You will be on probation period for first 3 months, after serving the probation period your performance and efforts will be reviewed to continue as permanent employee in ${companyName}. You will also get some incentive & increment for your Better Performance.</p>
                        <p>We Will also review your performance and work every year and you will get benefits as per them. And your salary will be revised as per performance.</p>
                        <p>As per the acceptance of this offer letter, you will also accept the attached Working Terms and Conditions (Annexure-I) and Non-Disclosure Agreement (Annexure-II) as per the joining rules and regulation. You will serve not less than 1 month of notice period when you decide to discontinue with your role at ${companyName}.</p>
                        <p>Your first salary will be credited after 45 days of working, 15 days salary will be hold for the security deposited, it will be settled with your last salary from company (FnF Settlement, 60 Days after Reliving).</p>
                        <p>This above offer is subject to yours being medically found fit and your document and background check being found satisfactory on verification. You should have your independent movement for performing your duties hence you are required to maintain own transportation.</p>
                        <p>Now therefore, you are requested to submit one set copies of the following documents to us at the time of your joining. You are also advised to bring originals along with the copies same will be returned immediately after our verification.</p>
                        <div class="ml-6 leading-loose">
                            1. Educational certificates, 2 References.<br/>
                            2. Four passport size color photographs.<br/>
                            3. Two copies of Photo ID with Address Proof.
                        </div>
                    </div>
                </div>
                <!-- Page 2 -->
                <div class="page">
                    ${logoUrl ? '<img src="' + logoUrl + '" class="watermark" />' : ''}
                    <div class="content-wrapper">
                        <p class="mt-8">Please sign and return to the undersigned the duplicate copy of this letter signifying your acceptance.</p>
                        <p>We welcome you to ${companyName} family and look forward to a fruitful collaboration. We are confident that your contribution will take us further in our journey towards becoming world leaders. We assure you of our support for your professional development and growth.</p>
                        <div class="mt-12">
                            <p style="margin-bottom: 24px;">Best Regards,</p>
                            <p>Manager - Human Resources</p>
                            <p><strong>${companyName}</strong></p>
                        </div>
                        <div class="mt-16 flex-end">
                            <p>I, ___________________________, accept the above offer and will begin the internship position on ${joinDate}.<br/><br/><br/>Signature_________________________.</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;

        // 1. Save everything to database FIRST
        await salary.save();
        await form.save();
        await user.save();

        // 2. Send immediate success response to Frontend
        res.status(200).json({ message: "Employee approved successfully", success: true });

        // 3. Background Task: Generate PDF and Send Email (Doesn't block the response)
        (async () => {
            try {
                const pdfBuffer = await generateOfferPdfBuffer(pdfHtml);
                await sendMail({ 
                    email: user.email, 
                    title: "Offer Letter – Welcome to Digicoder Private Limited", 
                    msg: emailMsg,
                    attachments: [
                        {
                            filename: `Offer_Letter_${user.firstName}_${user.lastName}.pdf`,
                            content: pdfBuffer,
                            contentType: 'application/pdf'
                        }
                    ]
                });
            } catch (mailErr) {
                console.error("Error generating or sending PDF email in background:", mailErr);
                // Fallback to sending just the email if PDF fails
                try {
                    await sendMail({ email: user.email, title: "Offer Letter – Welcome to Digicoder Private Limited", msg: emailMsg });
                } catch (fallbackMailErr) {
                    console.error("Error sending fallback onboarding email in background:", fallbackMailErr);
                }
            }
        })();
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

export const rejectOnboarding = async (req, res) => {
    try {
        const { id } = req.params;

        const form = await OnboardingForm.findById(id).populate("user");
        if (!form) return res.status(404).json({ message: "Onboarding form not found", success: false });

        if (form.status === "approved") {
            return res.status(400).json({ message: "Already approved", success: false });
        }

        // Reject form
        form.status = "rejected";
        form.reviewedBy = req.user.userId;
        await form.save();

        // Update user status
        const user = form.user;
        user.onboardingStatus = "rejected";
        await user.save();

        res.status(200).json({ message: "Employee rejected successfully", success: true });
    } catch (error) {
        console.error("Reject Onboarding Error:", error);
        res.status(500).json({ message: "Failed to reject employee", success: false });
    }
};

export const downloadOfferLetterPdf = async (req, res) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId).populate("companyId designation role");
        if (!user) return res.status(404).json({ message: "User not found", success: false });

        if (user.onboardingStatus !== "approved") {
            return res.status(403).json({ message: "Offer letter is only available after approval.", success: false });
        }

        const salary = await SalaryStructure.findOne({ userId }).sort({ createdAt: -1 });
        if (!salary) {
            return res.status(404).json({ message: "Salary structure not found", success: false });
        }

        const company = user.companyId;
        const ctc = salary.ctc;
        const basic = salary.basic;
        const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const joinDate = new Date(salary.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const currentYear = new Date().getFullYear();
        let logoUrl = company?.icon?.url || '';
        
        // Ensure logoUrl is absolute for Puppeteer to render
        if (logoUrl && logoUrl.startsWith('/')) {
            const protocol = req.protocol === 'http' && req.get('host').includes('localhost') ? 'http' : 'https';
            logoUrl = `${protocol}://${req.get('host')}${logoUrl}`;
        }

        const htmlContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: 'Helvetica', 'Arial', sans-serif; color: #333; padding: 40px; position: relative; }
                    .watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.15; width: 85%; z-index: -1; pointer-events: none; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .header img { height: 80px; }
                    .title { text-align: center; font-size: 20px; font-weight: bold; text-decoration: underline; margin-bottom: 45px; }
                    .content { font-size: 14.5px; line-height: 1.6; text-align: justify; z-index: 1; position: relative; }
                    .content p { margin-bottom: 12px; }
                    .list-docs { margin-left: 20px; margin-bottom: 20px; line-height: 1.8; }
                    .signatures { margin-top: 40px; }
                    .signatures p { margin: 5px 0; }
                    .page-break { page-break-before: always; }
                    .footer-sig { display: flex; align-items: flex-end; margin-top: 40px; }
                </style>
            </head>
            <body>
                <img src="${logoUrl}" class="watermark" />
                <div class="header">
                    <img src="${logoUrl}" alt="Company Logo" />
                </div>
                
                <div class="title">Offer Letter</div>
                
                <div class="content">
                    <p>Dated: ${today}</p>
                    <p>Mr ${user.firstName} ${user.lastName}</p>
                    <p>B/o ${user.address || "Address"}</p>
                    <p>Dear ${user.firstName},</p>
                    
                    <p>We are pleased to inform you that, with reference to your application and subsequent interview you had with us, we are pleased to offer you as a <strong>"${user.designation?.name || user.role?.name || 'Developer'}"</strong> at our Corporate Head Office - Lucknow, on the terms and conditions discussed and agreed by you at the time of your interview. You are requested to join us on <strong>${joinDate}</strong> as agreed by you. Your monthly remuneration will be ${ctc?.toLocaleString("en-IN")} INR and Your work timings will be <strong>10:00AM to 07:00PM, Monday to Saturday</strong>. You will be on probation period for first 3 months, after serving the probation period your performance and efforts will be reviewed to continue as permanent employee in ${company?.name || 'DigiCoders'}. You will also get some incentive & increment for your Better Performance.</p>
                    
                    <p>We Will also review your performance and work every year and you will get benefits as per them. And your salary will be revised as per performance.</p>
                    
                    <p>As per the acceptance of this offer letter, you will also accept the attached Working Terms and Conditions (Annexure-I) and Non-Disclosure Agreement (Annexure-II) as per the joining rules and regulation. You will serve not less than 1 month of notice period when you decide to discontinue with your role at ${company?.name || 'DigiCoders'}.</p>
                    
                    <p>Your first salary will be credited after 45 days of working, 15 days salary will be hold for the security deposited, it will be settled with your last salary from company (FnF Settlement, 60 Days after Reliving).</p>
                    
                    <p>This above offer is subject to yours being medically found fit and your document and background check being found satisfactory on verification. You should have your independent movement for performing your duties hence you are required to maintain own transportation.</p>
                    
                    <p>Now therefore, you are requested to submit one set copies of the following documents to us at the time of your joining. You are also advised to bring originals along with the copies same will be returned immediately after our verification.</p>
                    
                    <div class="list-docs">
                        1. Educational certificates, 2 References.<br>
                        2. Four passport size color photographs.<br>
                        3. Two copies of Photo ID with Address Proof.
                    </div>
                </div>
                
                <div class="page-break"></div>
                <img src="${logoUrl}" class="watermark" />
                
                <div class="content" style="margin-top: 40px;">
                    <p>Please sign and return to the undersigned the duplicate copy of this letter signifying your acceptance.</p>
                    
                    <p>We welcome you to ${company?.name || 'DigiCoders'} family and look forward to a fruitful collaboration. We are confident that your contribution will take us further in our journey towards becoming world leaders. We assure you of our support for your professional development and growth.</p>
                    
                    <div class="signatures">
                        <p>Best Regards,</p>
                        <br>
                        <p>Manager - Human Resources</p>
                        <p>${company?.name || 'DigiCoders Technologies Private Limited'}</p>
                    </div>
                    
                    <div class="footer-sig">
                        <p>I, ___________________________, accept the above offer and will begin the internship position on ${joinDate}.<br><br>Signature_________________________.</p>
                    </div>
                </div>
            </body>
            </html>
        `;

        const pdfBuffer = await generateOfferPdfBuffer(htmlContent);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="Offer_Letter.pdf"'
        });
        res.send(pdfBuffer);
    } catch (error) {
        console.error("Download Offer Letter Error:", error);
        res.status(500).json({ message: "Failed to generate offer letter PDF", success: false });
    }
};

export const downloadEmployeeOfferLetterPdf = async (req, res) => {
    try {
        const originalUserId = req.user?.userId;
        if (!req.user) req.user = {};
        req.user.userId = req.params.userId;
        
        await downloadOfferLetterPdf(req, res);
        
        if (originalUserId) {
            req.user.userId = originalUserId;
        }
    } catch (error) {
        console.error("Download Employee Offer Letter Error:", error);
        if (!res.headersSent) {
            res.status(500).json({ message: "Failed to generate employee offer letter PDF", success: false });
        }
    }
};
