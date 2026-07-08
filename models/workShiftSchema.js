import mongoose from "mongoose";

const workShiftSchema = new mongoose.Schema({
    name: { type: String, required: true },
    startTime: { type: String, required: true },   // "HH:MM" 24h format e.g. "09:00"
    endTime: { type: String, required: true },     // "HH:MM" 24h format e.g. "18:00"
    gracePeriod: { type: Number, default: 0 },
    lateThreshold: { type: Number, default: 30 },
    earlyLeaveThreshold: { type: Number, default: 30 },
    weekOff: { type: [Number], default: [0, 6] },  // 0=Sun … 6=Sat
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    status: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

workShiftSchema.index({ name: 1, companyId: 1 }, { unique: true });

const WorkShiftModel = mongoose.model("WorkShift", workShiftSchema);
export default WorkShiftModel;
