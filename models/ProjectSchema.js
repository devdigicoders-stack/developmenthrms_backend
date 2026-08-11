import mongoose from "mongoose";

const EditLogSchema = new mongoose.Schema({
    action: { type: String },   // e.g. "Added link: GitHub", "Removed file: design.zip"
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    at: { type: Date, default: Date.now },
});

const FileBundleSchema = new mongoose.Schema({
    name: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    isPublic: { type: Boolean, default: true },
    publicPermission: { type: String, enum: ["read", "read_write"], default: "read_write" },
    sharedWith: [{
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        permission: { type: String, enum: ["read", "read_write"], default: "read_write" },
    }],
    links: [{
        title: { type: String },
        url: { type: String, required: true },
    }],
    envContent: { type: String },
    files: [{
        name: { type: String },
        url: { type: String, required: true },
        publicId: { type: String },
        resourceType: { type: String, default: "raw" },
    }],
    editLog: [EditLogSchema],
    createdAt: { type: Date, default: Date.now },
});

const ProjectSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    status: { type: String, enum: ["active", "completed", "on_hold", "cancelled"], default: "active" },
    startDate: { type: Date },
    endDate: { type: Date },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    clientIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    fileBundles: [FileBundleSchema],
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", default: null },
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model("Project", ProjectSchema);
