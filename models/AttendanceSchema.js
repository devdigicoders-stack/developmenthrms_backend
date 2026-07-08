import mongoose from "mongoose";

const locationSchema = new mongoose.Schema({
    latitude: { type: Number },
    longitude: { type: Number },
    address: { type: String },
}, { _id: false });

const punchSchema = new mongoose.Schema({
    checkIn: { type: Date, required: true },
    checkOut: { type: Date },
    checkInLocation: { type: locationSchema },
    checkOutLocation: { type: locationSchema },
    workHours: { type: Number, default: 0 },
}, { _id: false });

const AttendanceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", default: null },
    workShiftId: { type: mongoose.Schema.Types.ObjectId, ref: "WorkShift" },
    date: { type: String, required: true }, // "YYYY-MM-DD"
    // Legacy single-punch fields (kept for backward compat)
    checkIn: { type: Date },
    checkOut: { type: Date },
    checkInLocation: { type: locationSchema },
    checkOutLocation: { type: locationSchema },
    // Multiple punches support
    punches: { type: [punchSchema], default: [] },
    workHours: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ["present", "absent", "half-day", "late", "early-leave", "regularized"],
        default: "present"
    },
    note: { type: String },
    isRegularized: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });

AttendanceSchema.index({ userId: 1, date: 1 }, { unique: true });

const AttendanceModel = mongoose.model("Attendance", AttendanceSchema);
export default AttendanceModel;
