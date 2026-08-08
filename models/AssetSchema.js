import mongoose from "mongoose";

const assetSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Asset name is required"],
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        type: {
            type: String,
            required: [true, "Asset type is required"],
            trim: true,
        },
        serialNumber: {
            type: String,
            trim: true,
        },
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        status: {
            type: String,
            enum: ["Available", "Assigned", "In Repair", "Lost"],
            default: "Available",
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

const Asset = mongoose.model("Asset", assetSchema);

export default Asset;
