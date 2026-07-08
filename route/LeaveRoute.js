import express from "express";
import {
    getMyBalance, getUserBalance, assignLeaveBalance, bulkAssignLeaveBalance,
    applyLeave, getMyLeaves, getCompanyLeaves,
    approveLeave, rejectLeave, cancelLeave
} from "../controller/LeaveController.js";
import { protect, hasPermission } from "../middleware/authMiddleware.js";

const router = express.Router();

// Balance
router.get("/balance", protect, getMyBalance);
router.get("/balance/user/:userId", protect, hasPermission("ASSIGN_LEAVE", "VIEW_ALL_LEAVES"), getUserBalance);
router.post("/balance/assign", protect, hasPermission("ASSIGN_LEAVE"), assignLeaveBalance);
router.post("/balance/bulk-assign", protect, hasPermission("BULK_ASSIGN_LEAVE"), bulkAssignLeaveBalance);

// Applications
router.post("/apply", protect, applyLeave);
router.get("/my", protect, getMyLeaves);
router.get("/company", protect, getCompanyLeaves);
router.patch("/:id/approve", protect, hasPermission("APPROVE_LEAVE"), approveLeave);
router.patch("/:id/reject", protect, hasPermission("REJECT_LEAVE"), rejectLeave);
router.patch("/:id/cancel", protect, cancelLeave);

export default router;
