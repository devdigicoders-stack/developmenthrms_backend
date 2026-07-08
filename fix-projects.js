import mongoose from 'mongoose';
import Project from './models/ProjectSchema.js';

async function run() {
    await mongoose.connect('mongodb://localhost:27017/DigiCoders_HRMS');
    
    // Set all null company projects to the company of the user
    const companyId = new mongoose.Types.ObjectId("6a4c92d17d320da930b38f01");
    const res = await Project.updateMany(
        { companyId: { $in: [null, undefined] } },
        { $set: { companyId: companyId } }
    );
    console.log("Updated projects:", res.modifiedCount);
    
    process.exit(0);
}
run().catch(console.error);
