import mongoose from "mongoose";

const assetTypeSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Asset type name is required"],
            trim: true,
            unique: true
        },
        description: {
            type: String,
            trim: true,
        },
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Company",
            default: null,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    { timestamps: true }
);

const AssetType = mongoose.model("AssetType", assetTypeSchema);

export default AssetType;
