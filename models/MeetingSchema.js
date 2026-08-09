import mongoose from "mongoose";

const meetingSchema = new mongoose.Schema({
    leadId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Lead",
        required: true
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Company",
        default: null
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    date: {
        type: Date,
        required: true
    },
    time: {
        type: String, // format "HH:MM"
        required: true
    },
    location: {
        type: String, // physical address or zoom link
        default: ""
    },
    status: {
        type: String,
        enum: ["Scheduled", "Completed", "Cancelled", "Rescheduled"],
        default: "Scheduled"
    },
    notes: {
        type: String, // Minutes of Meeting (MOM)
        default: ""
    },
    nextFollowUp: {
        type: Date,
        default: null
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    }
}, { timestamps: true });

// Prevent duplicate meeting at the exact same date and time for the same lead
meetingSchema.index({ leadId: 1, date: 1, time: 1 }, { unique: true });

const Meeting = mongoose.model("Meeting", meetingSchema);
export default Meeting;
