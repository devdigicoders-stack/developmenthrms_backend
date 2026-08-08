import express from "express";
import {
    createAsset,
    getAssets,
    getAssetById,
    updateAsset,
    deleteAsset,
    assignAsset,
    unassignAsset,
    getMyAssets
} from "../controller/AssetController.js";
import { protect, hasPermission } from "../middleware/authMiddleware.js";

const router = express.Router();

// Get all assets & create a new asset
router.route("/")
    .get(protect, getAssets)
    .post(protect, hasPermission("CREATE_ASSET", "MANAGE_ASSETS"), createAsset);

// Get my assets (Must be before /:id)
router.get("/my-assets", protect, getMyAssets);

// Assign and Unassign endpoints
router.patch("/:id/assign", protect, hasPermission("MANAGE_ASSETS"), assignAsset);
router.patch("/:id/unassign", protect, hasPermission("MANAGE_ASSETS"), unassignAsset);

// Get, update, delete specific asset
router.route("/:id")
    .get(protect, getAssetById)
    .put(protect, hasPermission("EDIT_ASSET", "MANAGE_ASSETS"), updateAsset)
    .delete(protect, hasPermission("DELETE_ASSET", "MANAGE_ASSETS"), deleteAsset);

export default router;
