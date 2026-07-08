import Notification from "../models/NotificationSchema.js";

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
    } catch (err) {
        console.error("Notification creation failed:", err.message);
    }
};
