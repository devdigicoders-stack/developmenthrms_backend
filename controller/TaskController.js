import Task from "../models/TaskSchema.js";
import Project from "../models/ProjectSchema.js";
import User from "../models/UserSchema.js";
import cloudinary from "../utills/cloudinary.js";
import { createNotification } from "../utills/notificationHelper.js";
import { uploadManyToCloudinary } from "../middleware/multer.js";
import { getSubordinateIds } from "../utills/hierarchyHelper.js";

const populateTask = (query) =>
    query
        .populate("assignedTo", "firstName lastName profilePic email")
        .populate("createdBy", "firstName lastName profilePic")
        .populate("qaAssignedTo", "firstName lastName profilePic")
        .populate("comments.author", "firstName lastName profilePic")
        .populate("attachments.uploadedBy", "firstName lastName")
        .populate("comments.attachments.uploadedBy", "firstName lastName")
        .populate("assignmentHistory.user", "firstName lastName profilePic")
        .populate("assignmentHistory.by", "firstName lastName")
        .populate("commentAllowedUsers", "firstName lastName");

const STATUS_LABELS = {
    todo: "To Do", in_progress: "In Progress", qa: "QA",
    admin_review: "Admin Review", done: "Done",
};

const pushEvent = (task, eventType, text, meta, byUserId) => {
    task.comments.push({ isEvent: true, eventType, text, eventMeta: meta, author: byUserId, createdAt: new Date() });
};

export const createTask = async (req, res) => {
    try {
        const { title, description, status, priority, assignedTo, dueDate, projectId, links } = req.body;

        const project = await Project.findOne({ _id: projectId, isDeleted: false });
        if (!project) return res.status(404).json({ success: false, message: "Project not found" });

        const uploaded = await uploadManyToCloudinary(req.files || []);
        const attachments = uploaded.map(f => ({
            name: f.name, url: f.url, publicId: f.publicId,
            type: f.resourceType, uploadedBy: req.user.userId,
        }));

        const assignedUsers = assignedTo ? (Array.isArray(assignedTo) ? assignedTo : [assignedTo]) : [];
        const initialHistory = assignedUsers.map(id => ({
            user: id, action: "assigned", by: req.user.userId,
        }));

        const task = await Task.create({
            title, description, status, priority, dueDate, links,
            project: projectId,
            assignedTo: assignedUsers,
            createdBy: req.user.userId,
            attachments,
            assignmentHistory: initialHistory,
        });

        if (assignedUsers.length > 0) {
            await createNotification({
                userId: assignedUsers,
                title: "New Task Assigned",
                message: `You have been assigned to the task "${title}" in project "${project.name}"`,
                type: "system",
                createdBy: req.user.userId
            });
        }

        const populated = await populateTask(Task.findById(task._id));
        res.status(201).json({ success: true, data: populated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getTasksByProject = async (req, res) => {
    try {
        const { projectId } = req.params;
        const userId = req.user.userId;
        const isSuperAdmin = req.user.role === "super_admin";
        const hasTaskPerm = (req.user.permissions || []).some(p =>
            ["VIEW_ALL_TASKS", "CREATE_TASK"].includes(p)
        );

        const project = await Project.findById(projectId);
        const isClient = project?.clientIds?.some(id => id.toString() === userId);

        const filter = { project: projectId, isDeleted: false };

        if (isSuperAdmin) {
            // Super Admin sees all tasks
        } else if (hasTaskPerm) {
            // Admin/Manager with permission: see tasks assigned to their subordinates
            const allowedIds = await getSubordinateIds(userId);
            filter.$or = [
                { assignedTo: { $in: allowedIds } },
                { qaAssignedTo: { $in: allowedIds } },
                { createdBy: { $in: allowedIds } },
            ];
        } else if (!isClient) {
            // Regular employee: only tasks assigned to them
            filter.$or = [{ assignedTo: userId }, { qaAssignedTo: userId }];
        }

        const tasks = await populateTask(Task.find(filter).sort({ createdAt: -1 }));
        res.json({ success: true, data: tasks });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getTaskById = async (req, res) => {
    try {
        const task = await populateTask(Task.findOne({ _id: req.params.id, isDeleted: false }));
        if (!task) return res.status(404).json({ success: false, message: "Task not found" });

        const userId = req.user.userId;
        const isAdmin = req.user.role === "super_admin" || (req.user.permissions || []).some(p =>
            ["VIEW_ALL_TASKS", "CREATE_TASK"].includes(p)
        );
        const project = await Project.findById(task.project);
        const isClient = project?.clientIds?.some(id => id.toString() === userId);

        const isAssigned = task.assignedTo.some(u => u._id.toString() === userId);
        const isQA = task.qaAssignedTo?._id?.toString() === userId;
        const isCreator = task.createdBy?._id?.toString() === userId;

        if (!isAdmin && !isAssigned && !isQA && !isCreator && !isClient)
            return res.status(403).json({ success: false, message: "Access denied" });

        res.json({ success: true, data: task });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const updateTask = async (req, res) => {
    try {
        const { assignedTo, qaAssignedTo, status, qaStatus, linkedBundles, ...rest } = req.body;
        const task = await Task.findById(req.params.id)
            .populate("assignedTo", "firstName lastName")
            .populate("createdBy", "firstName lastName")
            .populate("qaAssignedTo", "firstName lastName");
        if (!task) return res.status(404).json({ success: false, message: "Task not found" });

        const userId = req.user.userId;
        const isAdmin = req.user.role === "super_admin" || (req.user.permissions || []).some(p =>
            ["CREATE_TASK", "UPDATE_TASK"].includes(p)
        );
        const isAssigned = task.assignedTo.some(u => u._id.toString() === userId);
        const isQA = task.qaAssignedTo?._id?.toString() === userId;

        // QA user: can only update qaStatus
        if (isQA && !isAdmin) {
            if (qaStatus === undefined)
                return res.status(403).json({ success: false, message: "QA users can only update QA result" });
        }

        // Non-admin, non-QA: only allowed stage transitions
        if (status && status !== task.status && !isAdmin && !isQA) {
            if (!isAssigned)
                return res.status(403).json({ success: false, message: "Not assigned to this task" });
            const allowed = { todo: "in_progress", in_progress: "qa" };
            if (allowed[task.status] !== status)
                return res.status(403).json({ success: false, message: "Invalid stage transition" });
        }

        const notifyAdded = [], notifyRemoved = [];

        // Handle assignedTo changes (admin only)
        if (assignedTo !== undefined && isAdmin) {
            const newIds = (Array.isArray(assignedTo) ? assignedTo : [assignedTo]).map(String);
            const oldIds = task.assignedTo.map(u => u._id.toString());
            const added = newIds.filter(id => !oldIds.includes(id));
            const removed = oldIds.filter(id => !newIds.includes(id));

            added.forEach(id => {
                task.assignmentHistory.push({ user: id, action: "assigned", by: userId });
                notifyAdded.push(id);
                pushEvent(task, "assigned", `assigned a member to this task`, { userId: id }, userId);
            });
            removed.forEach(id => {
                task.assignmentHistory.push({ user: id, action: "removed", by: userId });
                notifyRemoved.push(id);
                pushEvent(task, "removed", `removed a member from this task`, { userId: id }, userId);
            });
            task.assignedTo = newIds;
            // Reset workStarted so new assignee must click Start Work
            if (added.length) task.workStarted = false;
        }

        // Handle QA assignment (admin only)
        if (qaAssignedTo !== undefined && isAdmin) {
            const oldQA = task.qaAssignedTo?._id?.toString();
            const newQA = qaAssignedTo || null;
            if (String(oldQA) !== String(newQA)) {
                task.qaAssignedTo = newQA || null;
                task.qaStarted = false; // Reset so new QA must click Start Work
                if (newQA) {
                    pushEvent(task, "qa_assigned", `assigned QA reviewer to this task`, { userId: newQA }, userId);
                    // Notify all assignees + QA person
                    const notifyQA = [
                        newQA,
                        ...task.assignedTo.map(u => (u._id || u).toString()),
                    ].filter((id, i, arr) => id !== userId && arr.indexOf(id) === i);
                    if (notifyQA.length) {
                        await createNotification({
                            userId: notifyQA,
                            title: "QA Assigned",
                            message: `QA reviewer assigned to "${task.title}"`,
                            type: "task_comment",
                            link: `/projects/${task.project}`,
                            createdBy: userId,
                            metadata: { taskId: task._id, projectId: task.project },
                        });
                    }
                } else {
                    pushEvent(task, "qa_assigned", `removed QA reviewer from this task`, {}, userId);
                }
            }
        }

        // Handle status change
        if (status && status !== task.status) {
            // Admin sending back from admin_review to in_progress
            if (status === "in_progress" && task.status === "admin_review" && isAdmin) {
                task.workStarted = false; // Reset so dev must restart
                task.commentAllowedUsers = task.assignedTo.map(u => (u._id || u).toString());
                pushEvent(task, "status_change",
                    `sent task back to In Progress for rework`,
                    { from: task.status, to: status }, userId
                );
                // Notify assignees
                const notifyDevs = task.assignedTo.map(u => (u._id || u).toString()).filter(id => id !== userId);
                if (notifyDevs.length) {
                    await createNotification({
                        userId: notifyDevs,
                        title: "Task Sent Back",
                        message: `Admin sent "${task.title}" back to In Progress for rework`,
                        type: "task_comment",
                        link: `/projects/${task.project}`,
                        createdBy: userId,
                        metadata: { taskId: task._id, projectId: task.project },
                    });
                }
            } else {
                pushEvent(task, "status_change",
                    `changed status from "${STATUS_LABELS[task.status]}" to "${STATUS_LABELS[status]}"`,
                    { from: task.status, to: status }, userId
                );
            }
            task.status = status;
            // Lock chat for assignees when moving to QA
            if (status === "qa") task.commentAllowedUsers = [];
        }

        // Handle qaStatus change — auto-advance or revert
        if (qaStatus && qaStatus !== task.qaStatus) {
            if (qaStatus === "pass") {
                pushEvent(task, "qa_result", `marked QA as PASS — task moved to Admin Review`, { result: "pass" }, userId);
                task.qaStatus = "pass";
                task.status = "admin_review";
                pushEvent(task, "status_change",
                    `changed status from "QA" to "Admin Review"`,
                    { from: "qa", to: "admin_review" }, userId
                );
            } else if (qaStatus === "fail") {
                pushEvent(task, "qa_result", `marked QA as FAIL — task sent back to In Progress`, { result: "fail" }, userId);
                task.qaStatus = "pending";
                task.status = "in_progress";
                task.workStarted = false; // Dev must start work again
                // Re-grant comment access to original assignees
                task.commentAllowedUsers = task.assignedTo.map(u => (u._id || u).toString());
                pushEvent(task, "status_change",
                    `changed status from "QA" to "In Progress" (QA Failed)`,
                    { from: "qa", to: "in_progress", qaFail: true }, userId
                );
                // Notify assignees of QA fail
                const failNotify = task.assignedTo.map(u => (u._id || u).toString()).filter(id => id !== userId);
                if (failNotify.length) {
                    await createNotification({
                        userId: failNotify,
                        title: "QA Failed",
                        message: `QA failed for "${task.title}" — task returned to In Progress`,
                        type: "task_comment",
                        link: `/projects/${task.project}`,
                        createdBy: userId,
                        metadata: { taskId: task._id, projectId: task.project },
                    });
                }
            } else {
                task.qaStatus = qaStatus;
                pushEvent(task, "qa_result", `reset QA status`, { result: qaStatus }, userId);
            }
        }

        // Handle linkedBundles change
        if (linkedBundles !== undefined) {
            const newLinked = Array.isArray(linkedBundles) ? linkedBundles : [linkedBundles];
            const oldLinked = task.linkedBundles.map(String);
            const addedBundles = newLinked.filter(id => !oldLinked.includes(String(id)));
            const removedBundles = oldLinked.filter(id => !newLinked.map(String).includes(id));
            addedBundles.forEach(id => pushEvent(task, "bundle_linked", `linked a bundle to this task`, { bundleId: id }, userId));
            removedBundles.forEach(id => pushEvent(task, "bundle_linked", `unlinked a bundle from this task`, { bundleId: id, removed: true }, userId));
            task.linkedBundles = newLinked;
        }

        Object.assign(task, rest);
        await task.save();

        if (notifyAdded.length) {
            await createNotification({
                userId: notifyAdded,
                title: "You were assigned to a task",
                message: `You have been assigned to "${task.title}"`,
                type: "task_comment",
                link: `/projects/${task.project}`,
                createdBy: userId,
                metadata: { taskId: task._id, projectId: task.project },
            });
        }
        if (notifyRemoved.length) {
            await createNotification({
                userId: notifyRemoved,
                title: "You were removed from a task",
                message: `You have been removed from "${task.title}"`,
                type: "task_comment",
                link: `/projects/${task.project}`,
                createdBy: userId,
                metadata: { taskId: task._id, projectId: task.project },
            });
        }

        const populated = await populateTask(Task.findById(req.params.id));
        res.json({ success: true, data: populated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// Assigned user starts work (todo→in_progress) or QA starts review
export const startWork = async (req, res) => {
    try {
        const task = await Task.findOne({ _id: req.params.id, isDeleted: false });
        if (!task) return res.status(404).json({ success: false, message: "Task not found" });

        const userId = req.user.userId;
        const isAssigned = task.assignedTo.some(u => u.toString() === userId);
        const isQA = task.qaAssignedTo?.toString() === userId;

        if (task.status === "todo" && isAssigned) {
            task.status = "in_progress";
            task.workStarted = true;
            pushEvent(task, "status_change", `started work — status changed from "To Do" to "In Progress"`, { from: "todo", to: "in_progress" }, userId);
        } else if (task.status === "in_progress" && isAssigned && !task.workStarted) {
            // Allow restart after QA fail
            task.workStarted = true;
            pushEvent(task, "status_change", `restarted work after QA feedback`, {}, userId);
        } else if (task.status === "qa" && isQA) {
            task.qaStarted = true;
            pushEvent(task, "status_change", `started QA review`, {}, userId);
        } else {
            return res.status(403).json({ success: false, message: "Not allowed to start work on this task" });
        }

        await task.save();
        const populated = await populateTask(Task.findById(task._id));
        res.json({ success: true, data: populated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const deleteTask = async (req, res) => {
    try {
        const canDelete = req.user.role === "super_admin" ||
            (req.user.permissions || []).includes("DELETE_TASK");
        if (!canDelete) return res.status(403).json({ success: false, message: "Permission denied" });

        await Task.findByIdAndUpdate(req.params.id, { isDeleted: true });
        res.json({ success: true, message: "Task deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const addComment = async (req, res) => {
    try {
        const { text } = req.body;
        const task = await Task.findById(req.params.id)
            .populate("assignedTo", "_id")
            .populate("createdBy", "_id")
            .populate("project", "_id clientIds");
        if (!task) return res.status(404).json({ success: false, message: "Task not found" });

        const userId = req.user.userId;
        const isAdmin = req.user.role === "super_admin" || (req.user.permissions || []).some(p =>
            ["CREATE_TASK", "UPDATE_TASK"].includes(p)
        );
        const isAssigned = task.assignedTo.some(u => u._id.toString() === userId);
        const isQA = task.qaAssignedTo?.toString() === userId;
        const isAllowed = task.commentAllowedUsers.some(u => (u._id || u).toString() === userId);
        const isCreator = task.createdBy._id.toString() === userId;
        const isClient = task.project?.clientIds?.some(id => id.toString() === userId);

        if (!isAdmin && !isAssigned && !isQA && !isAllowed && !isCreator && !isClient)
            return res.status(403).json({ success: false, message: "You no longer have write access to this task" });

        const uploaded = await uploadManyToCloudinary(req.files || []);
        const attachments = uploaded.map(f => ({
            name: f.name, url: f.url, publicId: f.publicId,
            type: f.resourceType, uploadedBy: userId,
        }));

        await Task.findByIdAndUpdate(
            req.params.id,
            { $push: { comments: { text, attachments, author: userId } } },
            { new: true }
        );

        const recipients = [
            ...task.assignedTo.map(u => u._id.toString()),
            task.createdBy._id.toString(),
            ...(task.qaAssignedTo ? [task.qaAssignedTo.toString()] : []),
        ].filter((id, i, arr) => id !== userId && arr.indexOf(id) === i);

        if (recipients.length) {
            await createNotification({
                userId: recipients,
                title: "New comment on task",
                message: `${text ? text.slice(0, 80) : "A file was attached"} — on task "${task.title}"`,
                type: "task_comment",
                link: `/projects/${task.project._id}`,
                createdBy: userId,
                metadata: { taskId: task._id, projectId: task.project._id },
            });
        }

        const populated = await populateTask(Task.findById(task._id));
        res.json({ success: true, data: populated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const deleteComment = async (req, res) => {
    try {
        const { id, commentId } = req.params;
        const task = await Task.findById(id);
        const comment = task.comments.id(commentId);
        if (!comment) return res.status(404).json({ success: false, message: "Comment not found" });

        const isAuthor = comment.author.toString() === req.user.userId;
        const isAdmin = req.user.role === "super_admin" || (req.user.permissions || []).some(p =>
            ["DELETE_TASK", "CREATE_TASK"].includes(p)
        );
        if (!isAuthor && !isAdmin)
            return res.status(403).json({ success: false, message: "Not allowed" });

        for (const att of comment.attachments) {
            if (att.publicId) await cloudinary.uploader.destroy(att.publicId, { resource_type: att.type || "raw" }).catch(() => {});
        }

        comment.deleteOne();
        await task.save();
        const populated = await populateTask(Task.findById(id));
        res.json({ success: true, data: populated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const addAttachment = async (req, res) => {
    try {
        const uploaded = await uploadManyToCloudinary(req.files || []);
        const attachments = uploaded.map(f => ({
            name: f.name, url: f.url, publicId: f.publicId,
            type: f.resourceType, uploadedBy: req.user.userId,
        }));

        const task = await Task.findByIdAndUpdate(
            req.params.id,
            { $push: { attachments: { $each: attachments } } },
            { new: true }
        );
        const populated = await populateTask(Task.findById(task._id));
        res.json({ success: true, data: populated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const deleteAttachment = async (req, res) => {
    try {
        const { id, attachmentId } = req.params;
        const task = await Task.findById(id);
        const att = task.attachments.id(attachmentId);
        if (!att) return res.status(404).json({ success: false, message: "Attachment not found" });

        if (att.publicId) await cloudinary.uploader.destroy(att.publicId, { resource_type: att.type || "raw" }).catch(() => {});
        att.deleteOne();
        await task.save();
        res.json({ success: true, message: "Attachment deleted" });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const grantCommentAccess = async (req, res) => {
    try {
        const { userIds } = req.body;
        const isAdmin = req.user.role === "super_admin" || (req.user.permissions || []).some(p =>
            ["CREATE_TASK", "UPDATE_TASK"].includes(p)
        );
        if (!isAdmin) return res.status(403).json({ success: false, message: "Admin only" });
        const task = await Task.findByIdAndUpdate(
            req.params.id,
            { commentAllowedUsers: userIds || [] },
            { new: true }
        );
        if (!task) return res.status(404).json({ success: false, message: "Task not found" });
        const populated = await populateTask(Task.findById(task._id));
        res.json({ success: true, data: populated });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

export const getMyTaskHistory = async (req, res) => {
    try {
        const userId = req.user.userId;
        const tasks = await Task.find(
            { "assignmentHistory.user": userId, isDeleted: false },
            { title: 1, project: 1, status: 1, priority: 1, assignmentHistory: 1 }
        )
        .populate("project", "name")
        .populate("assignmentHistory.by", "firstName lastName")
        .sort({ updatedAt: -1 })
        .limit(20);

        const result = tasks.map(t => ({
            _id: t._id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            project: t.project,
            history: t.assignmentHistory
                .filter(h => h.user.toString() === userId)
                .sort((a, b) => new Date(b.at) - new Date(a.at)),
        }));

        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
