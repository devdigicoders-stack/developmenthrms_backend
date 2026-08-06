import mongoose from 'mongoose';
import EnvData from './config/EnvData.js';
import Complaint from './models/ComplaintSchema.js';

mongoose.connect(EnvData.MONGO_URL).then(async () => {
    console.log("Connected to DB");
    const complaints = await Complaint.find({});
    console.log("Total complaints in DB:", complaints.length);
    if (complaints.length > 0) {
        console.log("First complaint:", JSON.stringify(complaints[0], null, 2));
    }
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
