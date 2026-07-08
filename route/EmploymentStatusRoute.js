import express from "express";
import { createEmployeeStatus, getCompanyEmploymentStatuses, getStatusesByCompany, updateEmployeeStatus, deleteEmployeeStatus, toggleEmployeeStatus } from "../controller/EmploymentStatusController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, authorize("super_admin", "admin"), createEmployeeStatus);
router.get("/company", protect, getCompanyEmploymentStatuses);
router.get("/by-company/:companyId", protect, getStatusesByCompany);
router.put("/:id", protect, authorize("super_admin", "admin"), updateEmployeeStatus);
router.delete("/:id", protect, authorize("super_admin", "admin"), deleteEmployeeStatus);
router.patch("/:id/toggle", protect, authorize("super_admin", "admin"), toggleEmployeeStatus);

export default router;
