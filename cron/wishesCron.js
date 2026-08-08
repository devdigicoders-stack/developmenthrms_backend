import cron from "node-cron";
import User from "../models/UserSchema.js";
import { createNotification } from "../utills/notificationHelper.js";

const runWishesCron = async () => {
    try {
        console.log("Running automated Birthday & Anniversary Wishes cron job...");

        const today = new Date();
        const currentDay = today.getDate();
        const currentMonth = today.getMonth(); // 0-indexed
        const currentYear = today.getFullYear();

        // Get all active users
        const users = await User.find({ isActive: true });

        for (const user of users) {
            // 1. Birthday Check
            if (user.dateOfBirth) {
                const dob = new Date(user.dateOfBirth);
                if (dob.getDate() === currentDay && dob.getMonth() === currentMonth) {
                    // Send to the birthday person
                    await createNotification({
                        userId: user._id,
                        title: "Happy Birthday! 🎂",
                        message: `Wishing you a fantastic birthday, ${user.firstName}! Have a great year ahead.`,
                        type: "system",
                        link: "/profile"
                    });
                    
                    // Optionally notify others in the same company (Exclude the birthday person)
                    const colleagues = users.filter(u => 
                        u._id.toString() !== user._id.toString() && 
                        u.companyId?.toString() === user.companyId?.toString()
                    ).map(u => u._id);

                    if (colleagues.length > 0) {
                        await createNotification({
                            userId: colleagues,
                            title: "Birthday Alert! 🎉",
                            message: `Today is ${user.firstName} ${user.lastName}'s birthday! Wish them a great day.`,
                            type: "system",
                            link: "/users" // Or a generic page
                        });
                    }
                }
            }

            // 2. Work Anniversary Check
            if (user.joiningDate) {
                const doj = new Date(user.joiningDate);
                // Check if month and day match, and they didn't join THIS year
                if (doj.getDate() === currentDay && doj.getMonth() === currentMonth && doj.getFullYear() < currentYear) {
                    const yearsOfService = currentYear - doj.getFullYear();
                    const yearSuffix = yearsOfService === 1 ? 'year' : 'years';
                    
                    await createNotification({
                        userId: user._id,
                        title: "Happy Work Anniversary! 🎊",
                        message: `Congratulations on completing ${yearsOfService} ${yearSuffix} with us, ${user.firstName}! Thank you for your dedication.`,
                        type: "system",
                        link: "/profile"
                    });

                    // Notify others
                    const colleagues = users.filter(u => 
                        u._id.toString() !== user._id.toString() && 
                        u.companyId?.toString() === user.companyId?.toString()
                    ).map(u => u._id);

                    if (colleagues.length > 0) {
                        await createNotification({
                            userId: colleagues,
                            title: "Work Anniversary Alert! 🏆",
                            message: `Today marks ${user.firstName} ${user.lastName}'s ${yearsOfService} ${yearSuffix} work anniversary!`,
                            type: "system",
                            link: "/users"
                        });
                    }
                }
            }
        }

        console.log("Wishes Cron Job Completed.");
    } catch (error) {
        console.error("Error in Wishes Cron Job:", error);
    }
};

const startWishesCron = () => {
    // Run every day at 9:00 AM Asia/Kolkata
    cron.schedule("0 9 * * *", runWishesCron, {
        timezone: "Asia/Kolkata"
    });
    console.log("Birthday & Anniversary Cron Job initialized. Scheduled for 9:00 AM daily.");
};

export default startWishesCron;
