import express from "express";
import { checkIn, checkOut, getMyAttendance, getTodayAttendance, getCompanyAttendance, getAttendanceSummary, manualPunch, adminCreatePunch, getTeamAttendance } from "../controller/AttendanceController.js";
import { protect, hasPermission } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/checkin", protect, checkIn);
router.patch("/checkout", protect, checkOut);
router.get("/today", protect, getTodayAttendance);
router.get("/my", protect, getMyAttendance);
router.get("/summary", protect, getAttendanceSummary);
router.get("/team", protect, hasPermission("VIEW_TEAM_ATTENDANCE", "VIEW_ALL_ATTENDANCES"), getTeamAttendance);
router.get("/company", protect, hasPermission("VIEW_ALL_ATTENDANCES"), getCompanyAttendance);
router.patch("/:id/manual-punch", protect, hasPermission("UPDATE_ATTENDANCE"), manualPunch);
router.post("/admin-punch", protect, hasPermission("Create_ATTENDANCE"), adminCreatePunch);

export default router;
