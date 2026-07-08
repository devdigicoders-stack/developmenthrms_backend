import mongoose from "mongoose";

const LeaveTypeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    code: { type: String, required: true }, // e.g. "CL", "SL", "EL"
    description: { type: String },
    defaultDays: { type: Number, default: 0 }, // default annual allocation
    isPaid: { type: Boolean, default: true },
    carryForward: { type: Boolean, default: false },
    maxCarryForward: { type: Number, default: 0 },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    status: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

LeaveTypeSchema.index({ code: 1, companyId: 1 }, { unique: true });

export default mongoose.model("LeaveType", LeaveTypeSchema);
