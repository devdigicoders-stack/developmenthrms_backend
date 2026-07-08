import express from "express";
import { createDepartment, deleteDepartment, getAllDepartments, getCompanyDepartments, getDepartments, getDepartmentById, getDepartmentsByCompany, restoreDepartment, toggleDepartmentStatus, updateDepartment
} from "../controller/DepartmentController.js";

import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, authorize("super_admin","admin"), createDepartment);
router.get("/", protect, getDepartments);
router.get("/all", protect, authorize("super_admin","admin"), getAllDepartments);
router.get("/company", protect, getCompanyDepartments);
router.get("/by-company/:companyId", protect, getDepartmentsByCompany);
router.get("/:id", protect, getDepartmentById);
router.put("/:id", protect, authorize("super_admin","admin"), updateDepartment);
router.delete("/:id", protect, authorize("super_admin","admin"), deleteDepartment);
router.patch("/restore/:id", protect, authorize("super_admin","admin"), restoreDepartment);
router.patch("/toggle-status/:id", protect, authorize("super_admin","admin"), toggleDepartmentStatus);

export default router;