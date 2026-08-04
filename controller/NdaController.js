import Nda from "../models/NdaSchema.js";
import NdaSignature from "../models/NdaSignatureSchema.js";
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

        if (nda) {
            nda.title = title;
            if (targetAudience) nda.targetAudience = targetAudience;
            if (req.file) {
                nda.document = { url: documentUrl };
            }
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
        const signatures = await NdaSignature.find({ userId: req.user.userId }).select('ndaId signedAt');
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
