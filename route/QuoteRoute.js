import express from "express";
import {
    createQuote,
    getAllQuotes,
    getQuotesByLead,
    getQuoteById,
    updateQuote,
    deleteQuote,
    getQuoteHTML,
    sendQuoteToCustomer,
    getQuoteSendDefaults,
    addQuoteFollowUp,
    updateQuoteFollowUp,
} from "../controller/quoteController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Create a new quote
router.post("/", protect, createQuote);

// Get all quotes for the company (tracker page)
router.get("/", protect, getAllQuotes);

// Get all quotes for a specific lead
router.get("/lead/:leadId", protect, getQuotesByLead);

// Get quote as HTML (print / Save as PDF in browser)
router.get("/:quoteId/html", protect, getQuoteHTML);

// Email templates / placeholders for send UI
router.get("/:quoteId/send-defaults", protect, getQuoteSendDefaults);

// Send quote email with PDF attachment
router.post("/:quoteId/send", protect, sendQuoteToCustomer);

// Follow-ups
router.post("/:quoteId/follow-ups", protect, addQuoteFollowUp);
router.patch("/:quoteId/follow-ups/:followUpId", protect, updateQuoteFollowUp);

// Get quote details by ID
router.get("/:quoteId", protect, getQuoteById);

// Update quote
router.patch("/:quoteId", protect, updateQuote);

// Delete quote
router.delete("/:quoteId", protect, deleteQuote);

export default router;
