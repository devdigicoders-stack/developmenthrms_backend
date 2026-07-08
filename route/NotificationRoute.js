import express from "express";
import { getMyNotifications, getUnreadCount, markAsRead, markAllAsRead, deleteNotification, clearAllNotifications, markProjectNotificationsRead } from "../controller/NotificationController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getMyNotifications);
router.get("/unread-count", protect, getUnreadCount);
router.patch("/read-all", protect, markAllAsRead);
router.patch("/mark-project-read/:projectId", protect, markProjectNotificationsRead);
router.delete("/clear-all", protect, clearAllNotifications);
router.patch("/:id/read", protect, markAsRead);
router.delete("/:id", protect, deleteNotification);

export default router;
