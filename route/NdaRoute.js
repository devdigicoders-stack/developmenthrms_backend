import express from 'express';
import { 
    createOrUpdateNda, 
    getAllNdas, 
    signNda, 
    getNdaSignatures, 
    getMySignatures, 
    deleteNda, 
    skipClientNda, 
    signClientNda,
    getClientNdaSignatures,
    getClientNdaTemplate,
    getEmployeeSignatures
} from '../controller/NdaController.js';
import { protect, authorize, hasPermission } from '../middleware/authMiddleware.js';
import upload from '../middleware/multer.js';

const router = express.Router();

router.use(protect); // Require login for all routes

// User Routes
router.get('/', hasPermission("VIEW_NDA"), getAllNdas);
router.get('/my-signatures', getMySignatures);
router.get('/client/template', getClientNdaTemplate);
router.post('/client/skip', skipClientNda);
router.post('/client/sign', signClientNda);
router.post('/:ndaId/sign', signNda);

// Admin Routes
router.get('/client/signatures', hasPermission("MANAGE_NDA"), getClientNdaSignatures);
router.get('/employee-signatures/:userId', hasPermission("MANAGE_NDA"), getEmployeeSignatures);
router.post('/', hasPermission("MANAGE_NDA"), upload.single("file"), createOrUpdateNda);
router.get('/:ndaId/signatures', hasPermission("MANAGE_NDA"), getNdaSignatures);
router.delete('/:id', hasPermission("MANAGE_NDA"), deleteNda);

export default router;
