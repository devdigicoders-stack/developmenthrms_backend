import Policy from "../models/PolicySchema.js";
import User from "../models/UserSchema.js";
import { createNotification } from "../utills/notificationHelper.js";

// Admin creates or updates a policy (Privacy Policy, NDA, etc.)
export const createOrUpdatePolicy = async (req, res) => {
    try {
        const { title, content, companyId } = req.body;
        
        if (!title || !content) {
            return res.status(400).json({ message: "Title and content are required", success: false });
        }

        // Find existing policy by title and companyId
        let policy = await Policy.findOne({ title, companyId: companyId || null });

        if (policy) {
            policy.content = content;
            policy.updatedBy = req.user.userId;
            await policy.save();

            const filter = { isActive: true };
            if (policy.companyId) filter.companyId = policy.companyId;
            const users = await User.find(filter).select("_id");
            if (users.length > 0) {
                await createNotification({
                    userId: users.map(u => u._id),
                    title: "Policy Updated 📜",
                    message: `The company policy "${title}" has been updated.`,
                    type: "company",
                    link: "/policies",
                    createdBy: req.user.userId
                });
            }

            return res.status(200).json({ message: "Policy updated successfully", policy, success: true });
        } else {
            policy = new Policy({
                title,
                content,
                companyId: companyId || null,
                createdBy: req.user.userId
            });
            await policy.save();

            const filter = { isActive: true };
            if (policy.companyId) filter.companyId = policy.companyId;
            const users = await User.find(filter).select("_id");
            if (users.length > 0) {
                await createNotification({
                    userId: users.map(u => u._id),
                    title: "New Policy Published 📜",
                    message: `A new company policy "${title}" has been published.`,
                    type: "company",
                    link: "/policies",
                    createdBy: req.user.userId
                });
            }

            return res.status(201).json({ message: "Policy created successfully", policy, success: true });
        }
    } catch (error) {
        console.error("Policy Create/Update Error:", error);
        res.status(500).json({ message: "Error saving policy", success: false });
    }
};

// Users get the policy by title
export const getPolicyByTitle = async (req, res) => {
    try {
        const { title } = req.params;
        const { companyId } = req.query;

        // Try to find company specific first, if not fallback to global
        let policy;
        if (companyId) {
            policy = await Policy.findOne({ title, companyId });
        }
        
        if (!policy) {
            policy = await Policy.findOne({ title, companyId: null });
        }

        if (!policy) {
            return res.status(404).json({ message: "Policy not found", success: false });
        }

        res.status(200).json({ policy, success: true });
    } catch (error) {
        console.error("Policy Get Error:", error);
        res.status(500).json({ message: "Error fetching policy", success: false });
    }
};

// Admin gets all policies
export const getAllPolicies = async (req, res) => {
    try {
        const { companyId } = req.query;
        const filter = companyId ? { $or: [{ companyId }, { companyId: null }] } : { companyId: null };
        const policies = await Policy.find(filter);
        res.status(200).json({ policies, success: true });
    } catch (error) {
        console.error("Get All Policies Error:", error);
        res.status(500).json({ message: "Error fetching policies", success: false });
    }
};

// Admin deletes a policy
export const deletePolicy = async (req, res) => {
    try {
        const { id } = req.params;
        const policy = await Policy.findById(id);
        if (!policy) {
            return res.status(404).json({ message: "Policy not found", success: false });
        }
        await Policy.findByIdAndDelete(id);
        res.status(200).json({ message: "Policy deleted successfully", success: true });
    } catch (error) {
        console.error("Policy Delete Error:", error);
        res.status(500).json({ message: "Error deleting policy", success: false });
    }
};
