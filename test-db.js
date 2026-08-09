import mongoose from 'mongoose';
import Lead from './models/LeadSchema.js';
import Quote from './models/QuoteSchema.js';
import Meeting from './models/MeetingSchema.js';
import User from './models/UserSchema.js';
import EnvData from './config/EnvData.js';

async function test() {
    await mongoose.connect(EnvData.MONGO_URL);
    console.log("Connected to DB");

    const users = await User.find().select("firstName lastName role");
    for (let u of users) {
        console.log(`User: ${u.firstName} ${u.lastName} (${u._id})`);
    }

    const quotes = await Quote.find({ status: "accepted" });
    for (let q of quotes) {
        console.log(`Quote: ${q.title} | Total: ${q.grandTotal} | CreatedBy: ${q.createdBy} | LeadId: ${q.leadId}`);
    }
    
    const leads = await Lead.find();
    for (let l of leads) {
        console.log(`Lead: ${l.name} | Status: ${l.status} | AssignedTo: ${l.assignedTo}`);
    }

    process.exit(0);
}
test();
