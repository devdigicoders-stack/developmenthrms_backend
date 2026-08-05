import Notification from "../models/NotificationSchema.js";
import User from "../models/UserSchema.js";
import { sendPushNotification } from "./firebaseAdmin.js";

/**
 * Create a notification for one or multiple users
 * @param {Object} opts
 * @param {string|string[]} opts.userId - recipient(s)
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {string} opts.type
 * @param {string} [opts.link]
 * @param {string} [opts.createdBy]
 * @param {Object} [opts.metadata]
 */
export const createNotification = async ({ userId, title, message, type = "system", link, createdBy, metadata }) => {
    try {
        const recipients = Array.isArray(userId) ? userId : [userId];
        const docs = recipients.map(uid => ({ userId: uid, title, message, type, link, createdBy, metadata }));
        await Notification.insertMany(docs);

        // Fetch tokens and send push notifications asynchronously
        const recipientUsers = await User.find({ _id: { $in: recipients }, fcmToken: { $ne: null } }).select("fcmToken");
        recipientUsers.forEach(u => {
            sendPushNotification(u.fcmToken, title, message, { link: link || "/" });
        });
    } catch (err) {
        console.error("Notification creation failed:", err.message);
    }
};
