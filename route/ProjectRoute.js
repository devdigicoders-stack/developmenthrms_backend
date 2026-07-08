import express from "express";
import https from "https";
import http from "http";
import { protect } from "../middleware/authMiddleware.js";
import upload from "../middleware/multer.js";
import {
    createProject, getProjects, getProjectById, updateProject, deleteProject,
    getFileBundles, createFileBundle, updateFileBundle, deleteFileBundle, updateBundleAccess,
} from "../controller/ProjectController.js";

const router = express.Router();
router.use(protect);

// Proxy download — fetches file server-side and streams with correct filename
router.get("/download-proxy", (req, res) => {
    const { url, name } = req.query;
    if (!url) return res.status(400).json({ message: "url required" });

    const safeName = (name || "file").replace(/[^\w\s.-]/g, "_");
    const client = url.startsWith("https") ? https : http;

    const doRequest = (targetUrl, hops = 0) => {
        if (hops > 5) return res.status(500).json({ message: "Too many redirects" });
        client.get(targetUrl, (upstream) => {
            if ([301, 302, 307, 308].includes(upstream.statusCode)) {
                upstream.resume();
                return doRequest(upstream.headers.location, hops + 1);
            }
            res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
            res.setHeader("Content-Type", upstream.headers["content-type"] || "application/octet-stream");
            upstream.pipe(res);
        }).on("error", () => res.status(500).json({ message: "Download failed" }));
    };

    doRequest(url);
});
router.post("/", createProject);
router.get("/", getProjects);
router.get("/:id", getProjectById);
router.put("/:id", updateProject);
router.delete("/:id", deleteProject);

router.get("/:id/bundles", getFileBundles);
router.post("/:id/bundles", upload.array("files", 10), createFileBundle);
router.put("/:id/bundles/:bundleId", upload.array("files", 10), updateFileBundle);
router.delete("/:id/bundles/:bundleId", deleteFileBundle);
router.patch("/:id/bundles/:bundleId/access", updateBundleAccess);

export default router;
