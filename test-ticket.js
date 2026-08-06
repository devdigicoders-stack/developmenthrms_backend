import mongoose from "mongoose";
import EnvData from "./config/EnvData.js";
import Ticket from "./models/TicketSchema.js";
import User from "./models/UserSchema.js";

mongoose.connect(EnvData.MONGO_URI).then(async () => {
    const tickets = await Ticket.find();
    console.log("ALL TICKETS:", tickets);
    
    const superAdmin = await User.findOne({ "email": "admin@workastra.com" });
    console.log("SUPER ADMIN COMPANY:", superAdmin?.companyId);
    
    process.exit(0);
});
