import dotenv from 'dotenv'

dotenv.config();

const EnvData={
    PORT:process.env.PORT||3000,
    MONGO_URI:process.env.MONGO_URI,
    JWT_SECRET:process.env.JWT_SECRET,
    Email_User:process.env.Email_User,
    Email_Pass:process.env.Email_Pass,
    cloudinary_cloud_name:process.env.cloudinary_cloud_name,
    cloudinary_api_key:process.env.cloudinary_api_key,
    cloudinary_api_secret:process.env.cloudinary_api_secret,
    NODE_ENV:process.env.NODE_ENV,
    CLIENT_URL:process.env.CLIENT_URL
}

export default EnvData;
