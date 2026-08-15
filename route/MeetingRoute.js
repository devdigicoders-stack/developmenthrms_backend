import express from "express";
import { createMeeting, getMeetingsByLead, updateMeeting, deleteMeeting, getAllMeetings } from "../controller/MeetingController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createMeeting);
router.get("/all", protect, getAllMeetings);
router.get("/lead/:leadId", protect, getMeetingsByLead);
router.patch("/:id", protect, updateMeeting);
router.delete("/:id", protect, deleteMeeting);

export default router;
