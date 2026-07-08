import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // recipient
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
        type: String,
        enum: ["attendance", "user", "role", "department", "company", "shift", "system", "task_comment"],
        default: "system"
    },
    isRead: { type: Boolean, default: false },
    link: { type: String },  // frontend route to navigate on click
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // who triggered it
    metadata: { type: mongoose.Schema.Types.Mixed }, // extra data
}, { timestamps: true });

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

const NotificationModel = mongoose.model("Notification", NotificationSchema);
export default NotificationModel;
