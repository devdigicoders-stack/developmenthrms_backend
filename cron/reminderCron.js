import cron from "node-cron";
import Meeting from "../models/MeetingSchema.js";
import { createNotification } from "../utills/notificationHelper.js";

const runReminderCron = async () => {
    try {
        console.log("Running automated Meeting Reminder cron job...");

        const now = new Date();
        // Look for meetings that are exactly 1 hour from now (with a 15-minute buffer)
        // E.g., if now is 10:00, check meetings between 10:45 and 11:15
        
        const meetings = await Meeting.find({
            status: "Scheduled",
            date: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) }
        }).populate("leadId", "name");

        for (const meeting of meetings) {
            // Check if meeting is today
            const meetingDate = new Date(meeting.date);
            if (meetingDate.getDate() === now.getDate() && meetingDate.getMonth() === now.getMonth()) {
                const [hours, minutes] = meeting.time.split(":");
                const meetingDateTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hours), parseInt(minutes));
                
                const timeDiffMs = meetingDateTime - now;
                const timeDiffMinutes = Math.floor(timeDiffMs / 1000 / 60);

                // Send reminder if meeting is in 60 minutes (buffer 55-65 mins)
                // Assuming cron runs every 15 mins, we can check if it's within 45 to 60 minutes
                if (timeDiffMinutes > 45 && timeDiffMinutes <= 60) {
                    await createNotification({
                        userId: meeting.assignedTo,
                        title: "Upcoming Meeting Alert! ⏳",
                        message: `Your meeting with ${meeting.leadId?.name} is scheduled at ${meeting.time} today. Location: ${meeting.location || 'N/A'}`,
                        type: "system",
                        link: `/leads`
                    });
                }
            }
        }

        console.log("Meeting Reminder Cron Job Completed.");
    } catch (error) {
        console.error("Error in Meeting Reminder Cron Job:", error);
    }
};

const startReminderCron = () => {
    // Run every 15 minutes
    cron.schedule("*/15 * * * *", runReminderCron);
    console.log("Meeting Reminder Cron Job initialized. Scheduled every 15 minutes.");
};

export default startReminderCron;
