import express from 'express'
import { createRole, getRoles, getAllRoles,getAllRolesByCompany, updateRole,getAllCompanyRoles, deleteRole, restoreRole, toggleRoleStatus } from '../controller/RoleController.js'
import { protect, authorize } from '../middleware/authMiddleware.js'

const router = express.Router()

router.post("/create", protect, authorize("super_admin","admin"), createRole)
router.get("/all/active", getRoles)
router.get("/all/:companyId", getAllRolesByCompany)
router.get("/all", getAllRoles)
router.get("/allroles", protect, getAllCompanyRoles)
router.put("/update/:id", protect, authorize("super_admin","admin"), updateRole)
router.delete("/delete/:id", protect, authorize("super_admin","admin"), deleteRole)
router.post("/restore/:id", protect, authorize("super_admin","admin"), restoreRole)
router.patch("/toggle-status/:id", protect, authorize("super_admin","admin"), toggleRoleStatus)

export default router
