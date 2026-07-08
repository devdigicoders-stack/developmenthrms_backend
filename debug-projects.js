import mongoose from 'mongoose';
import Project from './models/ProjectSchema.js';

async function run() {
    await mongoose.connect('mongodb://localhost:27017/DigiCoders_HRMS');
    
    const result = await Project.updateMany(
        { companyId: null },
        { $set: { companyId: "6a4c92d17d320da930b38f01" } }
    );
    console.log(`Updated ${result.modifiedCount} projects to fix companyId issue.`);
    process.exit(0);
}
run().catch(console.error);
