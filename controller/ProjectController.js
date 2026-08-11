import Project from "../models/ProjectSchema.js";
import Task from "../models/TaskSchema.js";
import { createNotification } from "../utills/notificationHelper.js";
import cloudinary from "../utills/cloudinary.js";
import { uploadManyToCloudinary } from "../middleware/multer.js";
import { getSubordinateIds } from "../utills/hierarchyHelper.js";

const isProjectAdmin = (project, userId, userRole, userPermissions) =>
    userRole === "super_admin" ||
    (userPermissions || []).some(p => ["CREATE_PROJECT", "UPDATE_PROJECT"].includes(p)) ||
    project.createdBy._id?.toString() === userId ||
    project.createdBy.toString() === userId;

const populateBundles = (query) => query.populate([
    { path: "fileBundles.uploadedBy", select: "firstName lastName" },
    { path: "fileBundles.sharedWith.user", select: "firstName lastName profilePic" },
    { path: "fileBundles.editLog.by", select: "firstName lastName" },
]);

const canAccessBundle = (bundle, userId, admin) => {
    if (admin) return true;
    if (bundle.isPublic) return true;
    if ((bundle.uploadedBy._id || bundle.uploadedBy).toString() === userId) return true;
    return bundle.sharedWith.some(s => (s.user?._id || s.user).toString() === userId);
};

const canEditBundle = (bundle, userId, admin) => {
    if (admin) return true;
    if ((bundle.uploadedBy._id || bundle.uploadedBy).toString() === userId) return true;
    if (bundle.isPublic && bundle.publicPermission === "read_write") return true;
    const entry = bundle.sharedWith.find(s => (s.user?._id || s.user).toString() === userId);
    return entry?.permission === "read_write";
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

export const createProject = async (req, res) => {
    try {
        const { name, description, status, startDate, endDate, members, companyId, clientIds } = req.body;
        // Default to the main company if super_admin doesn't provide one
        const projectCompanyId = req.user.role === "super_admin" 
            ? (companyId || req.user.company || "6a4c92d17d320da930b38f01") 
            : req.user.company;
        const project = await Project.create({
            name, description, status, startDate, endDate,
            members: members || [],
            companyId: projectCompanyId,
            clientIds: clientIds || [],
            createdBy: req.user.userId,
        });

        if (members && members.length > 0) {
            await createNotification({
                userId: members,
                title: "New Project Assigned",
                message: `You have been added to the project "${name}"`,
                type: "system",
                createdBy: req.user.userId
            });
        }

        res.status(201).json({ success: true, data: project });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getProjects = async (req, res) => {
    try {
        const isSuperAdmin = req.user.role === "super_admin";
        const hasAdminPerm = (req.user.permissions || []).some(p =>
            ["VIEW_ALL_PROJECTS", "CREATE_PROJECT"].includes(p)
        );
        const filter = { isDeleted: false };

        if (isSuperAdmin) {
            // Super Admin sees all projects across all companies
        } else {
            // Hierarchy filter:
            // Get all subordinate user IDs (self + children + grandchildren)
            // Admin B1 sees projects where B1's team members are involved
            // Admin B2 does NOT see Admin B1's team projects
            const allowedIds = await getSubordinateIds(req.user.userId);

            if (hasAdminPerm) {
                // Admin with permission: see all projects in their hierarchy's company scope
                // but restrict to subordinate members
                filter.$or = [
                    { members: { $in: allowedIds } },
                    { createdBy: { $in: allowedIds } }
                ];
            } else {
                // Regular employee/manager: only their own projects
                filter.$or = [
                    { members: req.user.userId },
                    { createdBy: req.user.userId },
                    { clientIds: req.user.userId }
                ];
            }
        }

        const projects = await Project.find(filter)
            .populate("createdBy", "firstName lastName profilePic")
            .populate("members", "firstName lastName profilePic")
            .populate("clientIds", "firstName lastName profilePic email")
            .sort({ createdAt: -1 });
        res.json({ success: true, data: projects });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getProjectById = async (req, res) => {
    try {
        const project = await Project.findOne({ _id: req.params.id, isDeleted: false })
            .populate("createdBy", "firstName lastName profilePic")
            .populate("members", "firstName lastName profilePic email")
            .populate("clientIds", "firstName lastName profilePic email");
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        const userId = req.user.userId;
        const isAdmin = req.user.role === "super_admin" || (req.user.permissions || []).some(p =>
            ["VIEW_ALL_PROJECTS", "CREATE_PROJECT"].includes(p)
        );
        const isMember = project.members.some(m => m._id.toString() === userId);
        const isCreator = project.createdBy._id.toString() === userId;
        const isClient = project.clientIds?.some(c => c._id.toString() === userId);
        if (!isAdmin && !isMember && !isCreator && !isClient)
            return res.status(403).json({ success: false, message: "Access denied" });

        res.json({ success: true, data: project });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const updateProject = async (req, res) => {
    try {
        const existing = await Project.findById(req.params.id);
        const project = await Project.findByIdAndUpdate(
            req.params.id, { ...req.body, updatedBy: req.user.userId }, { returnDocument: 'after' }
        );
        
        const oldMembers = existing ? existing.members.map(m => m.toString()) : [];
        const currentMembers = project.members || [];
        const newMembers = currentMembers.filter(m => !oldMembers.includes(m.toString()));
        
        if (newMembers.length > 0) {
            await createNotification({
                userId: newMembers,
                title: "Project Assigned",
                message: `You have been added to the project "${project.name}"`,
                type: "system",
                createdBy: req.user.userId
            });
        }

        // Auto-update lead if status is completed
        if (req.body.status === "completed" && existing.status !== "completed" && project.leadId) {
            const { default: Lead } = await import("../models/LeadSchema.js");
            await Lead.findByIdAndUpdate(project.leadId, { 
                $set: { status: "Project Done" },
                $push: { 
                    history: { 
                        changedBy: req.user.userId, 
                        changedAt: new Date(), 
                        changes: { status: { from: existing?.status || "Sent to Project Team", to: "Project Done" } } 
                    } 
                }
            });
        }

        res.json({ success: true, data: project });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const deleteProject = async (req, res) => {
    try {
        const canDelete = req.user.role === "super_admin" ||
            (req.user.permissions || []).includes("DELETE_PROJECT");
        if (!canDelete) return res.status(403).json({ success: false, message: "Permission denied" });

        await Project.findByIdAndUpdate(req.params.id, { isDeleted: true });
        await Task.updateMany({ project: req.params.id }, { isDeleted: true });
        res.json({ success: true, message: "Project deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ── File Bundles ──────────────────────────────────────────────────────────────

export const getFileBundles = async (req, res) => {
    try {
        const project = await populateBundles(
            Project.findOne({ _id: req.params.id, isDeleted: false })
        );
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        const userId = req.user.userId;
        const admin = isProjectAdmin(project, userId, req.user.role, req.user.permissions);

        const bundles = project.fileBundles
            .filter(b => canAccessBundle(b, userId, admin))
            .map(b => ({ ...b.toObject(), canEdit: canEditBundle(b, userId, admin) }));
        res.json({ success: true, data: bundles, isAdmin: admin });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const createFileBundle = async (req, res) => {
    try {
        const { name, links, envContent, isPublic, publicPermission, sharedWith } = req.body;
        const project = await Project.findOne({ _id: req.params.id, isDeleted: false });
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        const isSuperAdmin = req.user.role === "super_admin";
        const hasProjectManagePermission = (req.user.permissions || []).some(p => ["CREATE_PROJECT", "UPDATE_PROJECT"].includes(p));
        const isProjectCreator = project.createdBy?.toString() === req.user.userId || project.createdBy?._id?.toString() === req.user.userId;
        const hasUploadPermission = (req.user.permissions || []).includes("UPLOAD_PROJECT_FILE");

        if (!isSuperAdmin && !hasProjectManagePermission && !isProjectCreator && !hasUploadPermission) {
            return res.status(403).json({ success: false, message: "You do not have permission to upload files to this project." });
        }

        const pub = isPublic === "false" || isPublic === false ? false : true;
        const shared = sharedWith
            ? (Array.isArray(sharedWith) ? sharedWith : JSON.parse(sharedWith)).map(s =>
                typeof s === "object" ? s : { user: s, permission: "read_write" }
              )
            : [];

        let parsedLinks = [];
        try { parsedLinks = links ? JSON.parse(links) : []; } catch { parsedLinks = []; }

        const uploadedFiles = await uploadManyToCloudinary(req.files || []);
        const logEntries = [];
        uploadedFiles.forEach(f => logEntries.push({ action: `Added file: ${f.name}`, by: req.user.userId }));
        parsedLinks.filter(l => l.url?.trim()).forEach(l => logEntries.push({ action: `Added link: ${l.title || l.url}`, by: req.user.userId }));
        if (envContent?.trim()) logEntries.push({ action: "Added ENV variables", by: req.user.userId });

        if (!uploadedFiles.length && !parsedLinks.filter(l => l.url?.trim()).length && !envContent?.trim())
            return res.status(400).json({ success: false, message: "Nothing to add" });

        const bundle = {
            name,
            isPublic: pub,
            publicPermission: publicPermission || "read_write",
            sharedWith: shared,
            uploadedBy: req.user.userId,
            links: parsedLinks.filter(l => l.url?.trim()),
            envContent: envContent?.trim() || undefined,
            files: uploadedFiles.map(f => ({ name: f.name, url: f.url, publicId: f.publicId, resourceType: f.resourceType })),
            editLog: logEntries,
        };

        await Project.findByIdAndUpdate(req.params.id, { $push: { fileBundles: bundle } });

        const updated = await populateBundles(Project.findById(req.params.id));
        const userId = req.user.userId;
        const admin = isProjectAdmin(updated, userId, req.user.role, req.user.permissions);
        res.status(201).json({ success: true, data: updated.fileBundles.filter(b => canAccessBundle(b, userId, admin)) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const updateFileBundle = async (req, res) => {
    try {
        const { id, bundleId } = req.params;
        const { addLinks, removeLinks, removeFiles, envContent, isPublic, publicPermission, sharedWith } = req.body;

        const project = await Project.findOne({ _id: id, isDeleted: false });
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        const userId = req.user.userId;
        const admin = isProjectAdmin(project, userId, req.user.role, req.user.permissions);
        const bundle = project.fileBundles.id(bundleId);
        if (!bundle) return res.status(404).json({ success: false, message: "Bundle not found" });

        if (!canEditBundle(bundle, userId, admin))
            return res.status(403).json({ success: false, message: "You only have read access" });

        const logEntries = [];

        // Add new uploaded files
        const newFiles = await uploadManyToCloudinary(req.files || []);
        newFiles.forEach(f => {
            bundle.files.push({ name: f.name, url: f.url, publicId: f.publicId, resourceType: f.resourceType });
            logEntries.push({ action: `Added file: ${f.name}`, by: userId });
        });

        // Add new links
        let newLinks = [];
        try { newLinks = addLinks ? JSON.parse(addLinks) : []; } catch { newLinks = []; }
        newLinks.filter(l => l.url?.trim()).forEach(l => {
            bundle.links.push(l);
            logEntries.push({ action: `Added link: ${l.title || l.url}`, by: userId });
        });

        // Remove links by index
        let removeLinksArr = [];
        try { removeLinksArr = removeLinks ? JSON.parse(removeLinks) : []; } catch { removeLinksArr = []; }
        if (removeLinksArr.length) {
            const removed = removeLinksArr.map(i => bundle.links[i]?.title || bundle.links[i]?.url).filter(Boolean);
            bundle.links = bundle.links.filter((_, i) => !removeLinksArr.includes(i));
            removed.forEach(r => logEntries.push({ action: `Removed link: ${r}`, by: userId }));
        }

        // Remove files by id
        let removeFilesArr = [];
        try { removeFilesArr = removeFiles ? JSON.parse(removeFiles) : []; } catch { removeFilesArr = []; }
        for (const fid of removeFilesArr) {
            const f = bundle.files.id(fid);
            if (f) {
                logEntries.push({ action: `Removed file: ${f.name}`, by: userId });
                if (f.publicId) await cloudinary.uploader.destroy(f.publicId, { resource_type: f.resourceType || "raw" }).catch(() => {});
                f.deleteOne();
            }
        }

        // Update ENV
        if (envContent !== undefined) {
            const action = bundle.envContent ? "Updated ENV variables" : "Added ENV variables";
            bundle.envContent = envContent;
            logEntries.push({ action, by: userId });
        }

        // Update access (admin only)
        if (admin) {
            if (isPublic !== undefined) bundle.isPublic = isPublic === "false" || isPublic === false ? false : true;
            if (publicPermission !== undefined) bundle.publicPermission = publicPermission;
            if (sharedWith !== undefined) {
                const parsed = typeof sharedWith === "string" ? JSON.parse(sharedWith) : sharedWith;
                bundle.sharedWith = parsed.map(s => typeof s === "object" ? s : { user: s, permission: "read_write" });
            }
        }

        logEntries.forEach(e => bundle.editLog.push(e));
        await project.save();

        const updated = await populateBundles(Project.findById(id));
        const updAdmin = isProjectAdmin(updated, userId, req.user.role, req.user.permissions);
        res.json({ success: true, data: updated.fileBundles.filter(b => canAccessBundle(b, userId, updAdmin)) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const deleteFileBundle = async (req, res) => {
    try {
        const { id, bundleId } = req.params;
        const project = await Project.findOne({ _id: id, isDeleted: false });
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        const userId = req.user.userId;
        const admin = isProjectAdmin(project, userId, req.user.role, req.user.permissions);
        const bundle = project.fileBundles.id(bundleId);
        if (!bundle) return res.status(404).json({ success: false, message: "Bundle not found" });

        if (!admin && bundle.uploadedBy.toString() !== userId)
            return res.status(403).json({ success: false, message: "Not allowed" });

        for (const f of bundle.files) {
            if (f.publicId) await cloudinary.uploader.destroy(f.publicId, { resource_type: f.resourceType || "raw" }).catch(() => {});
        }

        bundle.deleteOne();
        await project.save();
        res.json({ success: true, message: "Deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const updateBundleAccess = async (req, res) => {
    try {
        const { id, bundleId } = req.params;
        const { sharedWith, isPublic, publicPermission } = req.body;
        const project = await Project.findOne({ _id: id, isDeleted: false });
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        const userId = req.user.userId;
        const admin = isProjectAdmin(project, userId, req.user.role, req.user.permissions);
        if (!admin) return res.status(403).json({ success: false, message: "Only admin or project owner can manage access" });

        const bundle = project.fileBundles.id(bundleId);
        if (!bundle) return res.status(404).json({ success: false, message: "Bundle not found" });

        if (sharedWith !== undefined)
            bundle.sharedWith = sharedWith.map(s => typeof s === "object" ? s : { user: s, permission: "read_write" });
        if (isPublic !== undefined) bundle.isPublic = isPublic;
        if (publicPermission !== undefined) bundle.publicPermission = publicPermission;
        bundle.editLog.push({ action: "Access updated", by: userId });

        await project.save();
        const updated = await populateBundles(Project.findById(id));
        res.json({ success: true, data: updated.fileBundles });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
