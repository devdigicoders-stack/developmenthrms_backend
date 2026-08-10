import Asset from "../models/AssetSchema.js";
import User from "../models/UserSchema.js";
import { createNotification } from "../utills/notificationHelper.js";
import { getSubordinateIds } from "../utills/hierarchyHelper.js";

// POST /api/assets
export const createAsset = async (req, res) => {
    try {
        const { name, description, type, serialNumber } = req.body;
        const companyId = req.user.companyId; // Ensure middleware sets this, or fetch via req.user.userId
        
        // Fetch companyId from user if it's not directly in req.user
        let finalCompanyId = companyId;
        if (!finalCompanyId) {
            const user = await User.findById(req.user.userId).select("companyId");
            if (!user) {
                return res.status(404).json({ message: "User not found", success: false });
            }
            finalCompanyId = user.companyId;
        }

        const asset = new Asset({
            name,
            description,
            type,
            serialNumber,
            companyId: finalCompanyId,
            createdBy: req.user.userId,
            status: "Available"
        });

        await asset.save();
        res.status(201).json({ message: "Asset created successfully", asset, success: true });
    } catch (error) {
        console.error("CREATE ASSET ERROR:", error);
        res.status(500).json({ message: "Error creating asset", error: error.message, success: false });
    }
};

// GET /api/assets
export const getAssets = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).populate("role");
        const isSuperAdmin = user?.role?.name === "super_admin";

        let query = {};
        if (isSuperAdmin) {
            // Super Admin sees all assets
        } else {
            // Hierarchy filter:
            // Admin B1 sees assets assigned to B1's team only
            // Admin B2's team assets are NOT visible to Admin B1
            const allowedIds = await getSubordinateIds(req.user.userId);
            // Show unassigned assets OR assets assigned to subordinates
            query.$or = [
                { assignedTo: null },
                { assignedTo: { $in: allowedIds } }
            ];
        }

        const assets = await Asset.find(query)
            .populate("assignedTo", "firstName lastName email")
            .populate("createdBy", "firstName lastName")
            .sort({ createdAt: -1 });

        res.status(200).json({ assets, success: true });
    } catch (error) {
        console.error("GET ASSETS ERROR:", error);
        res.status(500).json({ message: "Error fetching assets", error: error.message, success: false });
    }
};

// GET /api/assets/my-assets
export const getMyAssets = async (req, res) => {
    try {
        const userId = req.user.userId;
        
        const assets = await Asset.find({ assignedTo: userId })
            .populate("createdBy", "firstName lastName")
            .sort({ createdAt: -1 });

        res.status(200).json({ assets, success: true });
    } catch (error) {
        console.error("GET MY ASSETS ERROR:", error);
        res.status(500).json({ message: "Error fetching your assets", error: error.message, success: false });
    }
};

// GET /api/assets/:id
export const getAssetById = async (req, res) => {
    try {
        const { id } = req.params;
        const asset = await Asset.findById(id)
            .populate("assignedTo", "firstName lastName email")
            .populate("createdBy", "firstName lastName");

        if (!asset) {
            return res.status(404).json({ message: "Asset not found", success: false });
        }

        res.status(200).json({ asset, success: true });
    } catch (error) {
        console.error("GET ASSET ERROR:", error);
        res.status(500).json({ message: "Error fetching asset details", error: error.message, success: false });
    }
};

// PUT /api/assets/:id
export const updateAsset = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, type, serialNumber, status } = req.body;

        const asset = await Asset.findByIdAndUpdate(
            id,
            { name, description, type, serialNumber, status },
            { new: true, runValidators: true }
        ).populate("assignedTo", "firstName lastName email");

        if (!asset) {
            return res.status(404).json({ message: "Asset not found", success: false });
        }

        res.status(200).json({ message: "Asset updated successfully", asset, success: true });
    } catch (error) {
        console.error("UPDATE ASSET ERROR:", error);
        res.status(500).json({ message: "Error updating asset", error: error.message, success: false });
    }
};

// DELETE /api/assets/:id
export const deleteAsset = async (req, res) => {
    try {
        const { id } = req.params;
        const asset = await Asset.findByIdAndDelete(id);

        if (!asset) {
            return res.status(404).json({ message: "Asset not found", success: false });
        }

        res.status(200).json({ message: "Asset deleted successfully", success: true });
    } catch (error) {
        console.error("DELETE ASSET ERROR:", error);
        res.status(500).json({ message: "Error deleting asset", error: error.message, success: false });
    }
};

// PATCH /api/assets/:id/assign
export const assignAsset = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ message: "User ID is required to assign asset", success: false });
        }

        const asset = await Asset.findById(id);
        if (!asset) {
            return res.status(404).json({ message: "Asset not found", success: false });
        }

        if (asset.status !== "Available") {
            return res.status(400).json({ message: `Asset is currently ${asset.status} and cannot be assigned`, success: false });
        }

        asset.assignedTo = userId;
        asset.status = "Assigned";
        await asset.save();

        const updatedAsset = await Asset.findById(id).populate("assignedTo", "firstName lastName email");

        // Notify the employee
        await createNotification({
            userId: userId,
            title: "New Asset Assigned",
            message: `You have been assigned a new asset: ${asset.name} (${asset.serialNumber || 'N/A'})`,
            type: "system",
            link: "/my-assets"
        });

        res.status(200).json({ message: "Asset assigned successfully", asset: updatedAsset, success: true });
    } catch (error) {
        console.error("ASSIGN ASSET ERROR:", error);
        res.status(500).json({ message: "Error assigning asset", error: error.message, success: false });
    }
};

// PATCH /api/assets/:id/unassign
export const unassignAsset = async (req, res) => {
    try {
        const { id } = req.params;

        const asset = await Asset.findById(id);
        if (!asset) {
            return res.status(404).json({ message: "Asset not found", success: false });
        }

        if (asset.status !== "Assigned") {
            return res.status(400).json({ message: "Asset is not currently assigned to anyone", success: false });
        }

        const previousUserId = asset.assignedTo;

        asset.assignedTo = null;
        asset.status = "Available";
        await asset.save();

        if (previousUserId) {
            await createNotification({
                userId: previousUserId,
                title: "Asset Unassigned",
                message: `The asset "${asset.name}" has been unassigned/recovered from your account.`,
                type: "system",
                link: "/my-assets"
            });
        }

        res.status(200).json({ message: "Asset unassigned successfully", asset, success: true });
    } catch (error) {
        console.error("UNASSIGN ASSET ERROR:", error);
        res.status(500).json({ message: "Error unassigning asset", error: error.message, success: false });
    }
};
