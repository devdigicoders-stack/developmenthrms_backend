import express from "express";
import {
    getAllAssetTypes,
    createAssetType,
    updateAssetType,
    deleteAssetType
} from "../controller/AssetTypeController.js";
import { protect, hasPermission } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getAllAssetTypes);
router.post("/", protect, hasPermission("MANAGE_ASSET_TYPE"), createAssetType);
router.put("/:id", protect, hasPermission("MANAGE_ASSET_TYPE"), updateAssetType);
router.delete("/:id", protect, hasPermission("MANAGE_ASSET_TYPE"), deleteAssetType);

export default router;
