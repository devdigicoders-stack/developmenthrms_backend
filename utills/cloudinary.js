import { v2 as cloudinary } from 'cloudinary'
import EnvData from '../config/EnvData.js';

cloudinary.config({
    cloud_name: EnvData.cloudinary_cloud_name,
    api_key: EnvData.cloudinary_api_key,
    api_secret: EnvData.cloudinary_api_secret,
})

export default cloudinary