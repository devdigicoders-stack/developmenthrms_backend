import express from "express";
import {
    submitResignation,
    getMyResignation,
    getAllResignations,
    updateResignationStatus,
    processClearance
} from "../controller/ResignationController.js";
import { protect, hasPermission } from "../middleware/authMiddleware.js";

const router = express.Router();

// Employee endpoints
router.post("/", protect, submitResignation);
router.get("/my-resignation", protect, getMyResignation);

// Admin/HR endpoints
router.get("/", protect, hasPermission("MANAGE_RESIGNATIONS"), getAllResignations);
router.patch("/:id/status", protect, hasPermission("MANAGE_RESIGNATIONS"), updateResignationStatus);
router.patch("/:id/clearance", protect, hasPermission("MANAGE_RESIGNATIONS"), processClearance);

export default router;
