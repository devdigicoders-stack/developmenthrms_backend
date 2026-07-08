import mongoose from "mongoose";

const AttachmentSchema = new mongoose.Schema({
    name: { type: String },
    url: { type: String, required: true },
    publicId: { type: String },
    type: { type: String }, // image, video, raw (zip, pdf, etc.)
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    uploadedAt: { type: Date, default: Date.now },
});

const CommentSchema = new mongoose.Schema({
    text: { type: String },
    attachments: [AttachmentSchema],
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    isEvent: { type: Boolean, default: false },
    eventType: { type: String }, // "status_change", "assigned", "removed", "qa_result", "qa_fail", "bundle_linked"
    eventMeta: { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
});

const AssignmentHistorySchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, enum: ["assigned", "removed"], required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    at: { type: Date, default: Date.now },
});

const TaskSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String },
    status: { type: String, enum: ["todo", "in_progress", "qa", "admin_review", "done"], default: "todo" },
    qaStatus: { type: String, enum: ["pending", "pass", "fail"], default: "pending" },
    priority: { type: String, enum: ["low", "medium", "high", "urgent"], default: "medium" },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    dueDate: { type: Date },
    linkedBundles: [{ type: mongoose.Schema.Types.ObjectId }],
    qaAssignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    workStarted: { type: Boolean, default: false },
    qaStarted: { type: Boolean, default: false },
    commentAllowedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    attachments: [AttachmentSchema],
    comments: [CommentSchema],
    assignmentHistory: [AssignmentHistorySchema],
    isDeleted: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.model("Task", TaskSchema);
