import Payment from "../models/PaymentSchema.js";
import SystemSettings from "../models/SystemSettingsSchema.js";
import User from "../models/UserSchema.js";
import { uploadToCloudinary } from "../middleware/multer.js";
import { createNotification } from "../utills/notificationHelper.js";

// Update global UPI details
export const updateUpiDetails = async (req, res) => {
    try {
        const { upiId, payeeName } = req.body;
        if (!upiId) {
            return res.status(400).json({ message: "UPI ID is required", success: false });
        }
        
        let settings = await SystemSettings.findOne();
        if (!settings) {
            settings = new SystemSettings();
        }

        settings.upiDetails = { upiId, payeeName };
        settings.updatedBy = req.user.userId;

        await settings.save();
        res.status(200).json({ message: "UPI Details updated successfully", success: true, data: settings.upiDetails });
    } catch (error) {
        console.error("Error updating UPI details:", error);
        res.status(500).json({ message: "Failed to update UPI details", success: false });
    }
};

// Get global UPI details
export const getUpiDetails = async (req, res) => {
    try {
        const settings = await SystemSettings.findOne();
        if (!settings || !settings.upiDetails?.upiId) {
            return res.status(404).json({ message: "UPI details not found", success: false });
        }
        res.status(200).json({ success: true, upiDetails: settings.upiDetails });
    } catch (error) {
        console.error("Error fetching UPI details:", error);
        res.status(500).json({ message: "Failed to fetch UPI details", success: false });
    }
};

// User submits a payment
export const submitPayment = async (req, res) => {
    try {
        const { amount, transactionId, remark } = req.body;
        const userId = req.user.userId;

        if (!req.file) {
            return res.status(400).json({ message: "Payment screenshot is required", success: false });
        }
        if (!amount || !transactionId) {
            return res.status(400).json({ message: "Amount and Transaction ID are required", success: false });
        }

        const user = await User.findById(userId).select("companyId");
        const companyId = req.user.company || user?.companyId;

        const screenshot = await uploadToCloudinary(req.file, "payments");

        const payment = new Payment({
            userId,
            companyId,
            amount: Number(amount),
            transactionId,
            remark,
            screenshot: {
                url: screenshot.url,
                publicId: screenshot.publicId
            }
        });

        await payment.save();

        // Notify admins about the new payment
        try {
            const admins = await User.find({ "role": { $exists: true } }).populate("role");
            const notifyAdminIds = admins
                .filter(u => u.role?.name === "super_admin" || (u.role?.permissions || []).includes("MANAGE_PAYMENTS"))
                .filter(u => !u.companyId || u.companyId.toString() === companyId?.toString())
                .map(u => u._id);

            if (notifyAdminIds.length > 0) {
                const userObj = await User.findById(userId).select("firstName lastName");
                await createNotification({
                    userId: notifyAdminIds,
                    title: "New Payment Uploaded",
                    message: `${userObj?.firstName || "A client"} uploaded a new payment of ₹${amount}.`,
                    type: "system",
                    createdBy: userId
                });
            }
        } catch (notifErr) {
            console.error("Notification error in submitPayment:", notifErr);
        }

        res.status(201).json({ message: "Payment submitted successfully", success: true, payment });
    } catch (error) {
        console.error("Error submitting payment:", error);
        res.status(500).json({ message: "Failed to submit payment", success: false });
    }
};

// User gets their own payments
export const getMyPayments = async (req, res) => {
    try {
        const userId = req.user.userId;
        const payments = await Payment.find({ userId }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, payments });
    } catch (error) {
        console.error("Error fetching payments:", error);
        res.status(500).json({ message: "Failed to fetch payments", success: false });
    }
};

// Admin gets all payments
export const getAllPayments = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).populate("role");
        const isSuperAdmin = req.user.role === 'super_admin' || user?.role?.name === 'super_admin';

        let filter = {};
        if (!isSuperAdmin) {
            let companyId = req.user.company || user?.companyId;
            if (companyId) {
                filter.companyId = companyId;
            } else {
                return res.status(200).json({ success: true, payments: [] });
            }
        }

        const payments = await Payment.find(filter)
            .populate("userId", "firstName lastName email profilePic")
            .populate("reviewedBy", "firstName lastName")
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, payments });
    } catch (error) {
        console.error("Error fetching all payments:", error);
        res.status(500).json({ message: "Failed to fetch all payments", success: false });
    }
};

// Admin updates payment status
export const updatePaymentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const reviewedBy = req.user.userId;

        if (!["pending", "approved", "rejected"].includes(status)) {
            return res.status(400).json({ message: "Invalid status", success: false });
        }

        const user = await User.findById(req.user.userId).populate("role");
        const isSuperAdmin = req.user.role === 'super_admin' || user?.role?.name === 'super_admin';

        let filter = { _id: id };
        if (!isSuperAdmin) {
            let companyId = req.user.company || user?.companyId;
            if (companyId) {
                filter.companyId = companyId;
            } else {
                return res.status(404).json({ message: "Payment not found", success: false });
            }
        }

        const payment = await Payment.findOne(filter);
        if (!payment) {
            return res.status(404).json({ message: "Payment not found", success: false });
        }

        payment.status = status;
        payment.reviewedBy = reviewedBy;
        payment.reviewedAt = new Date();

        await payment.save();

        // Notify user about payment status
        try {
            await createNotification({
                userId: payment.userId,
                title: `Payment ${status.charAt(0).toUpperCase() + status.slice(1)}`,
                message: `Your payment of ₹${payment.amount} has been ${status}.`,
                type: "system",
                createdBy: reviewedBy
            });
        } catch (notifErr) {
            console.error("Notification error in updatePaymentStatus:", notifErr);
        }

        res.status(200).json({ message: `Payment ${status} successfully`, success: true, payment });
    } catch (error) {
        console.error("Error updating payment status:", error);
        res.status(500).json({ message: "Failed to update payment status", success: false });
    }
};
