import mongoose from "mongoose";

const RegularizationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: "Attendance" }, // null if no record exists
    date: { type: String, required: true }, // "YYYY-MM-DD"
    type: { type: String, enum: ["missed-checkin", "missed-checkout", "wrong-time", "absent"], default: "wrong-time" },
    requestedCheckIn: { type: String }, // "HH:MM"
    requestedCheckOut: { type: String },
    reason: { type: String, required: true },
    status: {
        type: String,
        enum: ["pending", "approved", "rejected"],
        default: "pending"
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date },
    rejectionReason: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

export default mongoose.model("Regularization", RegularizationSchema);
