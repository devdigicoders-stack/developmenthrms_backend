import express from "express";
import { protect, hasPermission } from "../middleware/authMiddleware.js";
import { createTicket, getTickets, getTicketById, updateTicketStatus, replyToTicket } from "../controller/TicketController.js";

const router = express.Router();
router.use(protect);

router.post("/", hasPermission("RAISE_TICKET"), createTicket);
router.get("/", getTickets); // Logic inside controller to filter by VIEW_TICKET vs MANAGE_TICKET
router.get("/:id", getTicketById);
router.put("/:id/status", hasPermission("MANAGE_TICKET"), updateTicketStatus);
router.post("/:id/reply", replyToTicket); // Logic inside controller to check if owner or MANAGE_TICKET

export default router;
