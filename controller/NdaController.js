import Nda from "../models/NdaSchema.js";
import NdaSignature from "../models/NdaSignatureSchema.js";
import User from "../models/UserSchema.js";
import Role from "../models/roleSchema.js";
import { createNotification } from "../utills/notificationHelper.js";
import { uploadToCloudinary, uploadBufferToCloudinary } from "../middleware/multer.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument } from 'pdf-lib';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Admin creates or updates an NDA
export const createOrUpdateNda = async (req, res) => {
    try {
        const { title, companyId, documentId, targetAudience } = req.body;
        
        if (!title) {
            return res.status(400).json({ message: "Title is required", success: false });
        }

        let documentUrl = "";
        
        if (req.file) {
            const uploadDir = path.join(__dirname, '../uploads/ndas');
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            
            const ext = path.extname(req.file.originalname) || '';
            const filename = `original_nda_${Date.now()}${ext}`;
            const filePath = path.join(uploadDir, filename);
            
            const fileData = fs.readFileSync(req.file.path);
            fs.writeFileSync(filePath, fileData);
            
            // Delete temp file created by multer
            try { fs.unlinkSync(req.file.path); } catch (e) {}
            
            documentUrl = `${req.protocol}://${req.get('host')}/uploads/ndas/${filename}`;
        }

        let nda = null;
        if (documentId) {
            nda = await Nda.findById(documentId);
        }

        // If this is a Client NDA, disable all other Client NDAs
        if (targetAudience === 'Client') {
            await Nda.updateMany({ targetAudience: 'Client' }, { $set: { status: false } });
        }

        if (nda) {
            nda.title = title;
            if (targetAudience) nda.targetAudience = targetAudience;
            if (req.file) {
                nda.document = { url: documentUrl };
            }
            // Ensure this one is active
            if (targetAudience === 'Client') nda.status = true;
            
            nda.updatedBy = req.user.userId;
            await nda.save();
            return res.status(200).json({ message: "NDA updated successfully", nda, success: true });
        } else {
            if (!req.file) {
                return res.status(400).json({ message: "Document file is required for new NDA", success: false });
            }
            nda = new Nda({
                title,
                document: { url: documentUrl },
                companyId: companyId || null,
                targetAudience: targetAudience || "Both",
                createdBy: req.user.userId
            });
            await nda.save();
            return res.status(201).json({ message: "NDA created successfully", nda, success: true });
        }
    } catch (error) {
        console.error("NDA Create/Update Error:", error);
        res.status(500).json({ message: "Error saving NDA", success: false });
    }
};

// Admin gets all NDAs
export const getAllNdas = async (req, res) => {
    try {
        const { companyId, manage } = req.query;
        let filter = companyId ? { $or: [{ companyId }, { companyId: null }] } : { companyId: null };
        
        // Role-based filtering
        const userRole = (req.user.role || "").toLowerCase();
        
        // If they are on the Manage page and have management rights, show all NDAs
        if (manage === "true" && (userRole === "super_admin" || userRole === "admin" || userRole === "hr")) {
            // No targetAudience filter -> show everything
        } else {
            // If they are on the View/Sign page, filter by their actual role
            if (userRole === "intern") {
                filter.targetAudience = { $in: ["Intern", "Both"] };
            } else {
                // Employees, HR, Admins (when signing) only see Employee NDAs
                filter.targetAudience = { $in: ["Employee", "Both"] };
            }
        }
        
        const ndas = await Nda.find(filter);
        res.status(200).json({ ndas, success: true });
    } catch (error) {
        console.error("Get All NDAs Error:", error);
        res.status(500).json({ message: "Error fetching NDAs", success: false });
    }
};

// User signs an NDA
export const signNda = async (req, res) => {
    try {
        const { ndaId } = req.params;
        const { signatureBase64 } = req.body;

        if (!signatureBase64) {
            return res.status(400).json({ message: "Signature is required", success: false });
        }

        // Check if already signed
        const existing = await NdaSignature.findOne({ ndaId, userId: req.user.userId });
        if (existing) {
            return res.status(400).json({ message: "You have already signed this NDA", success: false });
        }

        // Get Original NDA
        const nda = await Nda.findById(ndaId);
        if (!nda) return res.status(404).json({ message: "NDA not found", success: false });

        let signedDocumentUrl = "";

        // Attempt to stamp the signature if there is a document
        if (nda.document && nda.document.url) {
            try {
                // 1. Download original document as array buffer
                const docResponse = await axios.get(nda.document.url, { responseType: 'arraybuffer' });
                const docBytes = docResponse.data;

                // 2. Try to load as PDF
                let pdfDoc;
                try {
                    pdfDoc = await PDFDocument.load(docBytes);
                } catch (pdfErr) {
                    console.log("Not a valid PDF, cannot stamp.");
                }

                if (pdfDoc) {
                    // 3. Convert Base64 Signature to Image
                    const signatureImageBytes = Buffer.from(signatureBase64.split(',')[1], 'base64');
                    const signatureImage = await pdfDoc.embedPng(signatureImageBytes);

                    // 4. Draw Signature on ALL pages
                    const pages = pdfDoc.getPages();
                    
                    // Scale image down
                    const sigDims = signatureImage.scale(0.3);
                    
                    pages.forEach((page) => {
                        const { width } = page.getSize();
                        page.drawImage(signatureImage, {
                            x: width - sigDims.width - 50, // Right side with 50px padding
                            y: 50,
                            width: sigDims.width,
                            height: sigDims.height,
                        });
                    });

                    // 5. Save the new PDF to a buffer
                    const modifiedPdfBytes = await pdfDoc.save();
                    const modifiedPdfBuffer = Buffer.from(modifiedPdfBytes);

                    // 6. Save new signed PDF to Local Uploads Folder
                    const signedDir = path.join(__dirname, '../uploads/ndas/signed');
                    if (!fs.existsSync(signedDir)) fs.mkdirSync(signedDir, { recursive: true });
                    
                    const filename = `signed_nda_${ndaId}_${req.user.userId}_${Date.now()}.pdf`;
                    const filePath = path.join(signedDir, filename);
                    fs.writeFileSync(filePath, modifiedPdfBuffer);
                    
                    signedDocumentUrl = `${req.protocol}://${req.get('host')}/uploads/ndas/signed/${filename}`;
                }
            } catch (err) {
                console.error("PDF Stamping Error:", err);
                return res.status(500).json({ message: "Error stamping signature on document. Please ensure the uploaded file is a valid PDF.", success: false });
            }
        }

        const signature = new NdaSignature({
            ndaId,
            userId: req.user.userId,
            signatureBase64,
            signedDocumentUrl
        });
        
        await signature.save();

        try {
            const user = await User.findById(req.user.userId).select("firstName lastName companyId");
            const roles = await Role.find({ name: { $in: ["super_admin", "admin", "hr"] } }).select("_id");
            const roleIds = roles.map(r => r._id);
            const filter = { role: { $in: roleIds }, isActive: true };
            if (user?.companyId) filter.$or = [{ companyId: user.companyId }, { companyId: null }];
            const admins = await User.find(filter).select("_id");
            const adminIds = admins.map(a => a._id);
            
            if (adminIds.length > 0) {
                await createNotification({
                    userId: adminIds,
                    title: "NDA Signed ✍️",
                    message: `${user?.firstName || 'Employee'} ${user?.lastName || ''} has signed the NDA: ${nda.title}`,
                    type: "company",
                    link: "/nda",
                    createdBy: req.user.userId
                });
            }
        } catch (err) {
            console.error("Failed to notify HR/Admin for NDA", err);
        }

        res.status(201).json({ message: "NDA signed successfully", success: true });
    } catch (error) {
        console.error("Sign NDA Error:", error);
        res.status(500).json({ message: "Error signing NDA", success: false });
    }
};

// Get all signatures for an NDA (for admin)
export const getNdaSignatures = async (req, res) => {
    try {
        const { ndaId } = req.params;
        const signatures = await NdaSignature.find({ ndaId }).populate('userId', 'firstName lastName email employeeCode profilePic');
        res.status(200).json({ signatures, success: true });
    } catch (error) {
        console.error("Get Signatures Error:", error);
        res.status(500).json({ message: "Error fetching signatures", success: false });
    }
};

// Get NDAs signed by current user
export const getMySignatures = async (req, res) => {
    try {
        const signatures = await NdaSignature.find({ userId: req.user.userId }).populate('ndaId', 'title document targetAudience');
        res.status(200).json({ signatures, success: true });
    } catch (error) {
        console.error("Get My Signatures Error:", error);
        res.status(500).json({ message: "Error fetching your signatures", success: false });
    }
};

// Admin deletes an NDA
export const deleteNda = async (req, res) => {
    try {
        const { id } = req.params;
        const nda = await Nda.findByIdAndDelete(id);
        if (!nda) return res.status(404).json({ message: "NDA not found", success: false });
        
        // Delete all signatures associated with this NDA
        await NdaSignature.deleteMany({ ndaId: id });
        
        res.status(200).json({ message: "NDA deleted successfully", success: true });
    } catch (error) {
        console.error("Delete NDA Error:", error);
        res.status(500).json({ message: "Error deleting NDA", success: false });
    }
};

// Client skips NDA
export const skipClientNda = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ message: "User not found", success: false });
        
        user.clientNdaStatus = "skipped";
        await user.save();
        
        res.json({ message: "NDA skipped successfully", success: true });
    } catch (error) {
        console.error("Skip Client NDA Error:", error);
        res.status(500).json({ message: "Error skipping NDA", success: false });
    }
};

// Client signs NDA
export const signClientNda = async (req, res) => {
    try {
        const { signatureBase64 } = req.body;
        if (!signatureBase64) return res.status(400).json({ message: "Signature is required", success: false });

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ message: "User not found", success: false });
        
        if (user.clientNdaStatus === "signed") {
            return res.status(400).json({ message: "NDA already signed", success: false });
        }

        // Find active Client NDA template
        const clientNda = await Nda.findOne({ targetAudience: 'Client', status: true });
        
        let signedDocumentUrl = "";

        if (clientNda && clientNda.document && clientNda.document.url) {
            try {
                // Fetch the PDF from URL (works for local uploads and cloudinary)
                const pdfResponse = await axios.get(clientNda.document.url, { responseType: 'arraybuffer' });
                const docBytes = pdfResponse.data;
                
                const pdfDoc = await PDFDocument.load(docBytes);
                const signatureImageBytes = Buffer.from(signatureBase64.split(',')[1], 'base64');
                const signatureImage = await pdfDoc.embedPng(signatureImageBytes);
                
                const pages = pdfDoc.getPages();
                const sigDims = signatureImage.scale(0.3);
                
                pages.forEach((page) => {
                    const { width } = page.getSize();
                    page.drawImage(signatureImage, {
                        x: width - sigDims.width - 50, // Right side with 50px padding
                        y: 50,
                        width: sigDims.width,
                        height: sigDims.height,
                    });
                });
                
                const modifiedPdfBytes = await pdfDoc.save();
                const modifiedPdfBuffer = Buffer.from(modifiedPdfBytes);
                
                const signedDir = path.join(__dirname, '../uploads/ndas/signed');
                if (!fs.existsSync(signedDir)) fs.mkdirSync(signedDir, { recursive: true });
                
                const filename = `client_signed_nda_${req.user.userId}_${Date.now()}.pdf`;
                const filePath = path.join(signedDir, filename);
                fs.writeFileSync(filePath, modifiedPdfBuffer);
                
                signedDocumentUrl = `${req.protocol}://${req.get('host')}/uploads/ndas/signed/${filename}`;
            } catch (pdfErr) {
                console.error("PDF Stamping Error:", pdfErr);
            }
        }

        user.clientNdaStatus = "signed";
        await user.save();

        // Save a dummy signature record to keep track of document URL
        const signature = new NdaSignature({
            userId: req.user.userId,
            signatureBase64,
            signedDocumentUrl
        });
        await signature.save();

        // Notify Super Admin
        try {
            const roles = await Role.find({ name: { $in: ["super_admin", "admin"] } }).select("_id");
            const roleIds = roles.map(r => r._id);
            const filter = { role: { $in: roleIds }, isActive: true };
            if (user.companyId) filter.$or = [{ companyId: user.companyId }, { companyId: null }];
            const admins = await User.find(filter).select("_id");
            const adminIds = admins.map(a => a._id);
            
            if (adminIds.length > 0) {
                await createNotification({
                    userId: adminIds,
                    title: "Client NDA Signed ✍️",
                    message: `Client ${user.firstName || ''} ${user.lastName || ''} has signed their NDA.`,
                    type: "company",
                    link: "/nda",
                    createdBy: req.user.userId
                });
            }
            // bbbb
        } catch (err) {
            console.error("Failed to notify Admin for Client NDA", err);
        }

        res.json({ message: "Client NDA signed successfully", signedDocumentUrl, success: true });
    } catch (error) {
        console.error("Sign Client NDA Error:", error);
        res.status(500).json({ message: error.message || "Error signing Client NDA", success: false });
    }
};

// Admin gets all client NDA signatures
export const getClientNdaSignatures = async (req, res) => {
    try {
        const signatures = await NdaSignature.find({ ndaId: { $exists: false } })
            .populate('userId', 'firstName lastName email profilePic clientNdaStatus')
            .sort({ createdAt: -1 });
            
        res.status(200).json({ signatures, success: true });
    } catch (error) {
        console.error("Get Client Signatures Error:", error);
        res.status(500).json({ message: "Error fetching client signatures", success: false });
    }
};

// Get active Client NDA template for client login
export const getClientNdaTemplate = async (req, res) => {
    try {
        const clientNda = await Nda.findOne({ targetAudience: 'Client', status: true });
        
        if (!clientNda) {
            return res.status(200).json({ nda: null, message: "No active Client NDA found", success: true });
        }
        
        res.status(200).json({ nda: clientNda, success: true });
    } catch (error) {
        console.error("Get Client NDA Template Error:", error);
        res.status(500).json({ message: "Error fetching Client NDA template", success: false });
    }
};
