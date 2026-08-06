import express from "express";
import { createOrUpdatePolicy, getPolicyByTitle, getAllPolicies, deletePolicy } from "../controller/PolicyController.js";
import { protect, hasPermission } from "../middleware/authMiddleware.js";

const router = express.Router();

// Get specific policy
router.get("/title/:title", protect, hasPermission("VIEW_POLICY"), getPolicyByTitle);

// Get all policies
router.get("/", protect, hasPermission("VIEW_POLICY"), getAllPolicies);

// Create or update policy
router.post("/", protect, hasPermission("MANAGE_POLICY"), createOrUpdatePolicy);

// Delete policy
router.delete("/:id", protect, hasPermission("MANAGE_POLICY"), deletePolicy);

export default router;
