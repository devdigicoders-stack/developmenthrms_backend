import mongoose from "mongoose";

const ticketResponseSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const ticketSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Company",
            required: true,
        },
        projectId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Project",
            required: true,
        },
        subject: {
            type: String,
            required: true,
        },
        description: {
            type: String,
            required: true,
        },
        status: {
            type: String,
            enum: ["Open", "In Progress", "Resolved", "Closed"],
            default: "Open",
        },
        priority: {
            type: String,
            enum: ["Low", "Medium", "High", "Urgent"],
            default: "Medium",
        },
        responses: [ticketResponseSchema]
    },
    { timestamps: true }
);

export default mongoose.model("Ticket", ticketSchema);
