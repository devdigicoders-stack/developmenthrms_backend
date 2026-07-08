import express from "express";
import { createWorkShift, getCompanyWorkShifts, getShiftsByCompany, updateWorkShift, deleteWorkShift, toggleWorkShiftStatus } from "../controller/WorkShiftController.js";
import { protect, authorize, hasPermission } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, hasPermission("Create_WORKSHIFT"), createWorkShift);
router.get("/company", protect, getCompanyWorkShifts);
router.get("/by-company/:companyId", protect, getShiftsByCompany);
router.put("/:id", protect, hasPermission("UPDATE_WORKSHIFT"), updateWorkShift);
router.delete("/:id", protect, hasPermission("DELETE_WORKSHIFT"), deleteWorkShift);
router.patch("/:id/toggle", protect, hasPermission("UPDATE_WORKSHIFT"), toggleWorkShiftStatus);

export default router;
