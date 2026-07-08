import express from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import upload from "../middleware/multer.js";
import {
    listQuoteProfiles,
    listQuoteProfilesAdmin,
    getQuoteProfileDefaults,
    getQuoteProfileHistory,
    createQuoteProfile,
    updateQuoteProfile,
    deleteQuoteProfile,
    uploadQuoteProfileLogo,
    uploadQuoteProfilePaymentQr,
} from "../controller/quoteProfileController.js";

const router = express.Router();
const adminOnly = authorize("admin", "super_admin");

router.get("/", protect, listQuoteProfiles);
router.get("/defaults", protect, adminOnly, getQuoteProfileDefaults);
router.get("/admin", protect, adminOnly, listQuoteProfilesAdmin);
router.get("/:id/history", protect, adminOnly, getQuoteProfileHistory);
router.post("/", protect, adminOnly, createQuoteProfile);
router.patch("/:id", protect, adminOnly, updateQuoteProfile);
router.delete("/:id", protect, adminOnly, deleteQuoteProfile);
router.post("/:id/logo", protect, adminOnly, upload.single("logo"), uploadQuoteProfileLogo);
router.post("/:id/payment-qr", protect, adminOnly, upload.single("paymentQr"), uploadQuoteProfilePaymentQr);

export default router;
