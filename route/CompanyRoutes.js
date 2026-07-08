import express from 'express'
import { createCompany, createCompanyWithAdmin, updateCompanyWithAdmin, getCompanies, getAllCompanies, getCompanyById, updateCompany, deleteCompany, restoreCompany, toggleCompanyStatus, uploadCompanyIcon } from '../controller/CompanyController.js'
import { protect, authorize } from '../middleware/authMiddleware.js'
import upload from '../middleware/multer.js'

const router = express.Router()

router.post("/",              protect, authorize("super_admin"), createCompany)
router.post("/with-admin",    protect, authorize("super_admin"), createCompanyWithAdmin)
router.get("/",               protect, getCompanies)
router.get("/all",            protect, authorize("super_admin"), getAllCompanies)
router.get("/:id",            protect, getCompanyById)                          // admin can view own company
router.put("/:id",            protect, updateCompany)                           // admin can update own company
router.put("/:id/with-admin", protect, authorize("super_admin"), updateCompanyWithAdmin)
router.delete("/:id",         protect, authorize("super_admin"), deleteCompany)
router.patch("/:id/status",   protect, authorize("super_admin"), toggleCompanyStatus)
router.patch("/:id/icon",     protect, upload.single("icon"), uploadCompanyIcon) // admin can upload logo

export default router
