import mongoose from 'mongoose';
import Project from './models/ProjectSchema.js';

async function run() {
    await mongoose.connect('mongodb://localhost:27017/DigiCoders_HRMS');
    const projects = await Project.find({ clientId: { $ne: null } });
    for (const p of projects) {
        if (!p.clientIds.includes(p.clientId)) {
            p.clientIds.push(p.clientId);
            await p.save();
        }
    }
    console.log(`Migrated ${projects.length} projects.`);
    process.exit(0);
}
run().catch(console.error);
