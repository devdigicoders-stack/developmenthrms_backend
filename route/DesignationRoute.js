import express from 'express';
import { createDesignation, getDesignations, getAllDesignations, getDesignationsByDepartment, updateDesignation, deleteDesignation, restoreDesignation, toggleDesignationStatus } from '../controller/designationController.js';

const router = express.Router();

router.post('/create', createDesignation);
router.get('/all/active', getDesignations);
router.get('/all', getAllDesignations);
router.get('/getByDepartment/:departmentId', getDesignationsByDepartment);
router.put('/update/:id', updateDesignation);
router.delete('/delete/:id', deleteDesignation);
router.put('/restore/:id', restoreDesignation);
router.put('/toggleStatus/:id', toggleDesignationStatus);

export default router