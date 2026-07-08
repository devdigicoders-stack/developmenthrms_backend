import Notification from "../models/NotificationSchema.js";

// GET /api/notifications?page=1&limit=20&unreadOnly=true
export const getMyNotifications = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { page = 1, limit = 20, unreadOnly } = req.query;
        const filter = { userId };
        if (unreadOnly === "true") filter.isRead = false;

        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find(filter)
                .populate("createdBy", "firstName lastName profilePic")
                .sort({ createdAt: -1 })
                .skip((+page - 1) * +limit)
                .limit(+limit),
            Notification.countDocuments(filter),
            Notification.countDocuments({ userId, isRead: false }),
        ]);

        res.status(200).json({ notifications, total, unreadCount, success: true });
    } catch (err) {
        res.status(500).json({ message: "Error fetching notifications", success: false });
    }
};

// GET /api/notifications/unread-count
export const getUnreadCount = async (req, res) => {
    try {
        const userId = req.user.userId;
        const [count, taskCommentCount] = await Promise.all([
            Notification.countDocuments({ userId, isRead: false }),
            Notification.countDocuments({ userId, isRead: false, type: "task_comment" }),
        ]);
        res.status(200).json({ count, taskCommentCount, success: true });
    } catch (err) {
        res.status(500).json({ message: "Error fetching count", success: false });
    }
};

// PATCH /api/notifications/mark-project-read/:projectId
export const markProjectNotificationsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { userId: req.user.userId, isRead: false, type: "task_comment", "metadata.projectId": req.params.projectId },
            { isRead: true }
        );
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ message: "Error marking project notifications", success: false });
    }
};

// PATCH /api/notifications/:id/read
export const markAsRead = async (req, res) => {
    try {
        await Notification.findOneAndUpdate(
            { _id: req.params.id, userId: req.user.userId },
            { isRead: true }
        );
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ message: "Error marking notification", success: false });
    }
};

// PATCH /api/notifications/read-all
export const markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany({ userId: req.user.userId, isRead: false }, { isRead: true });
        res.status(200).json({ message: "All notifications marked as read", success: true });
    } catch (err) {
        res.status(500).json({ message: "Error marking all notifications", success: false });
    }
};

// DELETE /api/notifications/:id
export const deleteNotification = async (req, res) => {
    try {
        await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ message: "Error deleting notification", success: false });
    }
};

// DELETE /api/notifications/clear-all
export const clearAllNotifications = async (req, res) => {
    try {
        await Notification.deleteMany({ userId: req.user.userId });
        res.status(200).json({ message: "All notifications cleared", success: true });
    } catch (err) {
        res.status(500).json({ message: "Error clearing notifications", success: false });
    }
};
