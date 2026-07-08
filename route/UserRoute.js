import express from "express";
import { registerUser, loginUser, forgotPassword, resetPassword, adminChangePassword, getAllUsers, getAllUsersByCompany, verifyToken, getUserProfile, updateUserProfile, adminUpdateUser, toggleUserStatus, logoutUser, changePassword } from "../controller/UserController.js";
import upload from "../middleware/multer.js";
import { protect, hasPermission } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/signup", registerUser);
router.post("/create", protect, registerUser);
router.post("/login", loginUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/logout", logoutUser);
router.get("/profile", protect, getUserProfile);
router.put("/profile", protect, upload.single("profilePic"), updateUserProfile);
router.patch("/change-password", protect, changePassword);
router.patch("/:id/change-password", protect, hasPermission("UPDATE_USER"), adminChangePassword);
router.put("/:id", protect, adminUpdateUser);
router.patch("/:id/toggle-status", protect, toggleUserStatus);
router.get("/all", protect, getAllUsers);
router.get("/company/:companyId/users", protect, getAllUsersByCompany);
router.get("/me", protect, verifyToken);

export default router;