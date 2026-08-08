import connectdb from "./config/db.js";
import EnvData from "./config/EnvData.js";
import { runAbsentMarking } from "./cron/attendanceCron.js";
import mongoose from "mongoose";

const runTest = async () => {
    try {
        console.log("Connecting to DB...");
        await connectdb();
        
        console.log("Triggering manual run of Absent Marking Cron Job...");
        await runAbsentMarking();
        
        console.log("Test finished!");
    } catch (e) {
        console.error("Test failed:", e);
    } finally {
        mongoose.disconnect();
        process.exit(0);
    }
};

runTest();
