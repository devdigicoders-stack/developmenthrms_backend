import express from "express";
import { protect, hasPermission } from "../middleware/authMiddleware.js";
import {
    createComplaint,
    getMyComplaints,
    getAllComplaints,
    updateComplaintStatus,
} from "../controller/ComplaintController.js";

const router = express.Router();

router.post("/create", protect, createComplaint);
router.get("/my", protect, getMyComplaints);

// Admin / Manager routes
router.get("/all", protect, hasPermission("VIEW_ALL_COMPLAINTS"), getAllComplaints);
router.put("/:id/status", protect, hasPermission("MANAGE_COMPLAINT"), updateComplaintStatus);

export default router;
