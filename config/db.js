import mongoose from "mongoose";
import EnvData from "./EnvData.js";

const connectdb= async()=>{
    try {
        const conn=await mongoose.connect(EnvData.MONGO_URI)
        console.log("Mongo DB Connected Successfully!", conn.connection.host)
    } catch (error) {
        console.log("Mongo DB Connection Failed", error)
    }
}

export default connectdb