import express from 'express'
import { createRole, getRoles, getAllRoles,getAllRolesByCompany, updateRole,getAllCompanyRoles, deleteRole, restoreRole, toggleRoleStatus } from '../controller/RoleController.js'
import { protect, authorize, hasPermission } from '../middleware/authMiddleware.js'

const router = express.Router()

router.post("/create", protect, hasPermission("Create_ROLE"), createRole)
router.get("/all/active", getRoles)
router.get("/all/:companyId", getAllRolesByCompany)
router.get("/all", getAllRoles)
router.get("/allroles", protect, getAllCompanyRoles)
router.put("/update/:id", protect, hasPermission("UPDATE_ROLE"), updateRole)
router.delete("/delete/:id", protect, hasPermission("DELETE_ROLE"), deleteRole)
router.post("/restore/:id", protect, authorize("super_admin","admin"), restoreRole)
router.patch("/toggle-status/:id", protect, authorize("super_admin","admin"), toggleRoleStatus)

export default router
