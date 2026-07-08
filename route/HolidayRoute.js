import express from "express";
import multer from "multer";
import { getHolidays, createHoliday, bulkCreateHolidays, csvUploadHolidays, updateHoliday, deleteHoliday } from "../controller/HolidayController.js";
import { protect, hasPermission } from "../middleware/authMiddleware.js";

const router = express.Router();
const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (_, file, cb) => {
        const allowed = ["text/csv", "application/vnd.ms-excel", "application/csv", "text/plain"];
        const isAllowed = allowed.includes(file.mimetype) || file.originalname.toLowerCase().endsWith(".csv");
        cb(null, isAllowed);
    },
});

router.get("/", protect, getHolidays);
router.post("/", protect, hasPermission("Create_HOLIDAY"), createHoliday);
router.post("/bulk", protect, hasPermission("Create_HOLIDAY"), bulkCreateHolidays);
router.post("/csv-upload", protect, hasPermission("Create_HOLIDAY"), csvUpload.single("file"), csvUploadHolidays);
router.put("/:id", protect, hasPermission("UPDATE_HOLIDAY"), updateHoliday);
router.delete("/:id", protect, hasPermission("DELETE_HOLIDAY"), deleteHoliday);

export default router;
