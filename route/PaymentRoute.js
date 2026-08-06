import express from "express";
import { protect, hasPermission } from "../middleware/authMiddleware.js";
import upload from "../middleware/multer.js";
import {
    updateUpiDetails,
    getUpiDetails,
    submitPayment,
    getMyPayments,
    getAllPayments,
    updatePaymentStatus
} from "../controller/PaymentController.js";

const router = express.Router();

// Public / User routes
router.get("/upi", protect, hasPermission("SUBMIT_PAYMENT"), getUpiDetails);
router.post("/submit", protect, hasPermission("SUBMIT_PAYMENT"), upload.single("screenshot"), submitPayment);
router.get("/my", protect, hasPermission("SUBMIT_PAYMENT"), getMyPayments);

// Admin / Manager routes
router.post("/upi-update", protect, hasPermission("MANAGE_PAYMENTS"), updateUpiDetails);
router.get("/all", protect, hasPermission("MANAGE_PAYMENTS"), getAllPayments);
router.put("/:id/status", protect, hasPermission("MANAGE_PAYMENTS"), updatePaymentStatus);

export default router;
