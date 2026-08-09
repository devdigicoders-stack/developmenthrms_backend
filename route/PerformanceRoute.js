import express from "express";
import { getPerformanceReport, getPerformanceHistory } from "../controller/PerformanceController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getPerformanceReport);
router.get("/history", getPerformanceHistory);

export default router;
