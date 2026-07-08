import express from "express";
import { permission } from "../config/permission.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    data: permission,
  });
});

export default router;  