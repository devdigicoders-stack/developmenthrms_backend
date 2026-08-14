import AssetType from "../models/AssetTypeSchema.js";
import Asset from "../models/AssetSchema.js";

// GET /api/asset-types
export const getAllAssetTypes = async (req, res) => {
    try {
        const types = await AssetType.find().sort({ name: 1 });
        res.status(200).json({ success: true, assetTypes: types });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// POST /api/asset-types
export const createAssetType = async (req, res) => {
    try {
        const { name, description } = req.body;
        
        const existing = await AssetType.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (existing) {
            return res.status(400).json({ success: false, message: "Asset Type with this name already exists" });
        }

        const type = await AssetType.create({
            name,
            description,
            createdBy: req.user.userId
        });
        res.status(201).json({ success: true, message: "Asset Type created", assetType: type });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// PUT /api/asset-types/:id
export const updateAssetType = async (req, res) => {
    try {
        const { name, description } = req.body;
        const type = await AssetType.findById(req.params.id);
        
        if (!type) return res.status(404).json({ success: false, message: "Not found" });

        if (name && name !== type.name) {
            const existing = await AssetType.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
            if (existing) return res.status(400).json({ success: false, message: "Name already exists" });
            
            // Note: If we change the name, we might want to update all Assets using this type?
            // Currently Assets store type as a String. Let's update all assets.
            await Asset.updateMany({ type: type.name }, { type: name });
            type.name = name;
        }

        if (description !== undefined) type.description = description;
        await type.save();

        res.status(200).json({ success: true, message: "Updated successfully", assetType: type });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// DELETE /api/asset-types/:id
export const deleteAssetType = async (req, res) => {
    try {
        const type = await AssetType.findById(req.params.id);
        if (!type) return res.status(404).json({ success: false, message: "Not found" });

        const inUse = await Asset.findOne({ type: type.name });
        if (inUse) {
            return res.status(400).json({ success: false, message: "Cannot delete because assets exist with this type" });
        }

        await AssetType.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true, message: "Deleted successfully" });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
