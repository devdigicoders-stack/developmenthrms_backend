import express from "express";
import { getLeaveTypes, getLeaveTypesByCompany, createLeaveType, updateLeaveType, deleteLeaveType } from "../controller/LeaveTypeController.js";
import { protect, hasPermission } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getLeaveTypes);
router.get("/by-company/:companyId", protect, getLeaveTypesByCompany);
router.post("/", protect, hasPermission("Create_LEAVE_TYPE"), createLeaveType);
router.put("/:id", protect, hasPermission("UPDATE_LEAVE_TYPE"), updateLeaveType);
router.delete("/:id", protect, hasPermission("DELETE_LEAVE_TYPE"), deleteLeaveType);

export default router;
