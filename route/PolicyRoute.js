import express from "express";
import { createOrUpdatePolicy, getPolicyByTitle, getAllPolicies, deletePolicy } from "../controller/PolicyController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";


const router = express.Router();

// Get specific policy (Users can access this, or even public if needed. We'll make it protected but accessible by any role)
router.get("/title/:title", protect, getPolicyByTitle);

// Get all policies
router.get("/", protect, getAllPolicies);

// Create or update policy (Admin only, or based on permission)
router.post("/", protect, authorize("super_admin"), createOrUpdatePolicy);

// Delete policy (Admin only)
router.delete("/:id", protect, authorize("super_admin"), deletePolicy);

export default router;
