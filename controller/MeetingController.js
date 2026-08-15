import Meeting from "../models/MeetingSchema.js";
import Lead from "../models/LeadSchema.js";
import { createNotification } from "../utills/notificationHelper.js";

// Create a meeting
export const createMeeting = async (req, res) => {
    try {
        const { leadId, title, date, time, location, assignedTo, notes } = req.body;
        
        if (!leadId || !title || !date || !time || !assignedTo) {
            return res.status(400).json({ message: "Lead, Title, Date, Time, and Assigned User are required", success: false });
        }

        const lead = await Lead.findById(leadId);
        if (!lead) return res.status(404).json({ message: "Lead not found", success: false });

        const meeting = new Meeting({
            leadId,
            companyId: lead.companyId,
            title,
            date,
            time,
            location,
            notes,
            assignedTo,
            createdBy: req.user.userId
        });

        await meeting.save();

        // Create notification for the assigned user (if someone else assigned it)
        if (assignedTo !== req.user.userId) {
            await createNotification({
                userId: assignedTo,
                title: "New Meeting Assigned",
                message: `You have been assigned a new meeting with Lead: ${lead.name} on ${new Date(date).toLocaleDateString()} at ${time}.`,
                type: "system",
                link: `/leads`
            });
        }

        res.status(201).json({ message: "Meeting scheduled successfully", success: true, meeting });
    } catch (error) {
        console.error("CREATE MEETING ERROR:", error);
        if (error.code === 11000) {
            return res.status(409).json({ message: "A meeting is already scheduled at this date and time for this lead", success: false });
        }
        res.status(500).json({ message: "Error scheduling meeting", success: false });
    }
};

// Get all meetings for a lead
export const getMeetingsByLead = async (req, res) => {
    try {
        const { leadId } = req.params;
        const meetings = await Meeting.find({ leadId })
            .populate("assignedTo", "firstName lastName profilePic")
            .populate("createdBy", "firstName lastName")
            .sort({ date: 1, time: 1 });
            
        res.status(200).json({ success: true, meetings });
    } catch (error) {
        console.error("GET MEETINGS ERROR:", error);
        res.status(500).json({ message: "Error fetching meetings", success: false });
    }
};

// Update a meeting
export const updateMeeting = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, date, time, location, status, notes, nextFollowUp, assignedTo } = req.body;

        const meeting = await Meeting.findById(id);
        if (!meeting) return res.status(404).json({ message: "Meeting not found", success: false });

        if (title) meeting.title = title;
        if (date) meeting.date = date;
        if (time) meeting.time = time;
        if (location !== undefined) meeting.location = location;
        if (status) meeting.status = status;
        if (notes !== undefined) meeting.notes = notes;
        if (nextFollowUp !== undefined) meeting.nextFollowUp = nextFollowUp;
        if (assignedTo) meeting.assignedTo = assignedTo;

        await meeting.save();

        res.status(200).json({ message: "Meeting updated successfully", success: true, meeting });
    } catch (error) {
        console.error("UPDATE MEETING ERROR:", error);
        res.status(500).json({ message: "Error updating meeting", success: false });
    }
};

// Delete a meeting
export const deleteMeeting = async (req, res) => {
    try {
        const { id } = req.params;
        const meeting = await Meeting.findByIdAndDelete(id);
        
        if (!meeting) return res.status(404).json({ message: "Meeting not found", success: false });

        res.status(200).json({ message: "Meeting deleted successfully", success: true });
    } catch (error) {
        console.error("DELETE MEETING ERROR:", error);
        res.status(500).json({ message: "Error deleting meeting", success: false });
    }
};

// Get all meetings based on permissions
export const getAllMeetings = async (req, res) => {
    try {
        const userId = req.user.userId;
        const role = req.user.role;
        let meetings = [];

        if (role === "super_admin") {
            meetings = await Meeting.find()
                .populate("leadId", "orgName contactNumber contactPerson")
                .populate("assignedTo", "firstName lastName profilePic")
                .populate("createdBy", "firstName lastName")
                .sort({ date: 1, time: 1 });
        } else {
            // dynamically import user to check permissions
            const { default: User } = await import("../models/UserSchema.js");
            const userData = await User.findById(userId).populate("role");
            const perms = userData?.role?.permissions || [];

            if (perms.includes("VIEW_ALL_MEETINGS") || role === "admin") {
                meetings = await Meeting.find({ companyId: userData.companyId })
                    .populate("leadId", "orgName contactNumber contactPerson")
                    .populate("assignedTo", "firstName lastName profilePic")
                    .populate("createdBy", "firstName lastName")
                    .sort({ date: 1, time: 1 });
            } else if (perms.includes("VIEW_MEETING")) {
                meetings = await Meeting.find({ assignedTo: userId })
                    .populate("leadId", "orgName contactNumber contactPerson")
                    .populate("assignedTo", "firstName lastName profilePic")
                    .populate("createdBy", "firstName lastName")
                    .sort({ date: 1, time: 1 });
            }
        }

        res.status(200).json({ success: true, meetings });
    } catch (error) {
        console.error("GET ALL MEETINGS ERROR:", error);
        res.status(500).json({ message: "Error fetching all meetings", success: false });
    }
};
