import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import upload from "../middleware/multer.js";
import {
    createTask, getTasksByProject, getTaskById,
    updateTask, deleteTask,
    addComment, deleteComment,
    addAttachment, deleteAttachment,
    getMyTaskHistory, grantCommentAccess, startWork,
} from "../controller/TaskController.js";

const router = express.Router();
router.use(protect);

router.post("/", upload.array("attachments", 10), createTask);
router.get("/my-history", getMyTaskHistory);
router.get("/project/:projectId", getTasksByProject);
router.get("/:id", getTaskById);
router.put("/:id", updateTask);
router.patch("/:id/start", startWork);
router.delete("/:id", deleteTask);
router.patch("/:id/comment-access", grantCommentAccess);

router.post("/:id/comments", upload.array("attachments", 5), addComment);
router.delete("/:id/comments/:commentId", deleteComment);

router.post("/:id/attachments", upload.array("attachments", 10), addAttachment);
router.delete("/:id/attachments/:attachmentId", deleteAttachment);

export default router;
