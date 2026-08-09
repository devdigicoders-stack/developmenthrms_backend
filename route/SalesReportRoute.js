import express from "express";
import { getSalesReport } from "../controller/SalesReportController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Apply auth middleware to all routes
router.use(protect);

// Admin / Super Admin only ? Let's allow admins and maybe we can check roles inside controller if needed.
// For now, any logged in user can fetch, but in a real app you'd restrict it to admins.
router.get("/", getSalesReport);

export default router;
