import express from 'express';
import { createOrUpdateNda, getAllNdas, signNda, getNdaSignatures, getMySignatures, deleteNda } from '../controller/NdaController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import upload from '../middleware/multer.js';

const router = express.Router();

router.use(protect); // Require login for all routes

// User Routes
router.get('/', getAllNdas);
router.get('/my-signatures', getMySignatures);
router.post('/:ndaId/sign', signNda);

// Admin Routes
router.post('/', authorize("super_admin"), upload.single("file"), createOrUpdateNda);
router.get('/:ndaId/signatures', authorize("super_admin"), getNdaSignatures);
router.delete('/:id', authorize("super_admin"), deleteNda);

export default router;
