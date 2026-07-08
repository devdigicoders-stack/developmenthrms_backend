import express from "express";
import { requestRegularization, getMyRegularizations, getCompanyRegularizations, getTeamRegularizations, approveRegularization, rejectRegularization } from "../controller/RegularizationController.js";
import { protect, hasPermission } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, requestRegularization);
router.get("/my", protect, getMyRegularizations);
router.get("/team", protect, hasPermission("VIEW_TEAM_ATTENDANCE", "VIEW_ALL_ATTENDANCES", "APPROVE_REGULARIZATION", "REJECT_REGULARIZATION"), getTeamRegularizations);
router.get("/company", protect, hasPermission("VIEW_ALL_ATTENDANCES"), getCompanyRegularizations);
router.patch("/:id/approve", protect, hasPermission("APPROVE_REGULARIZATION"), approveRegularization);
router.patch("/:id/reject", protect, hasPermission("REJECT_REGULARIZATION"), rejectRegularization);

export default router;
