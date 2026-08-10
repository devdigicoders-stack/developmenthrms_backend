import express from "express";
import { protect, hasPermission } from "../middleware/authMiddleware.js";
import upload from "../middleware/multer.js";
import { submitOnboardingForm, getPendingOnboardingRequests, approveOnboarding, rejectOnboarding, getMyOfferLetter, downloadOfferLetterPdf, downloadEmployeeOfferLetterPdf } from "../controller/OnboardingController.js";

const router = express.Router();

const uploadFields = upload.fields([
    { name: "cvFile", maxCount: 1 },
    { name: "highSchoolCertificate", maxCount: 1 },
    { name: "intermediateCertificate", maxCount: 1 },
    { name: "diplomaCertificate", maxCount: 1 },
    { name: "graduationCertificate", maxCount: 1 },
    { name: "aadharFront", maxCount: 1 },
    { name: "aadharBack", maxCount: 1 },
    { name: "panCard", maxCount: 1 },
    { name: "bankPassbook", maxCount: 1 },
    { name: "passportPhoto", maxCount: 1 },
    { name: "fullSizePhoto", maxCount: 1 },
    { name: "offerLetterFile", maxCount: 1 },
    { name: "experienceLetterFile", maxCount: 1 },
    { name: "relievingLetterFile", maxCount: 1 },
    { name: "salarySlipsFile", maxCount: 1 }
]);

router.post("/submit", protect, uploadFields, submitOnboardingForm);
router.get("/requests", protect, hasPermission("MANAGE_USER", "APPROVE_ONBOARDING"), getPendingOnboardingRequests);
router.post("/approve/:id", protect, hasPermission("MANAGE_USER", "APPROVE_ONBOARDING"), approveOnboarding);
router.post("/reject/:id", protect, hasPermission("MANAGE_USER", "APPROVE_ONBOARDING"), rejectOnboarding);
router.get("/my-offer-letter", protect, getMyOfferLetter);
router.get("/my-offer-letter/download", protect, downloadOfferLetterPdf);
router.get("/user-offer-letter/:userId/download", protect, hasPermission("MANAGE_USER"), downloadEmployeeOfferLetterPdf);

export default router;
