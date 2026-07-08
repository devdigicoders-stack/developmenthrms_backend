import multer from "multer";
import cloudinary from "../utills/cloudinary.js";

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },  // 50 MB — covers large lead CSV files
});

const getResourceType = (mimetype = "") => {
    if (mimetype.startsWith("image/")) return "image";
    if (mimetype.startsWith("video/")) return "video";
    return "raw";
};

export const uploadToCloudinary = (file, folder = "digicoders/hrmsv2") =>
    new Promise((resolve, reject) => {
        const resource_type = getResourceType(file.mimetype);

        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type },
            (error, result) => {
                if (error) return reject(error);
                resolve({
                    name: file.originalname,
                    url: result.secure_url,
                    publicId: result.public_id,
                    resourceType: resource_type,
                });
            }
        );

        stream.end(file.buffer);
    });

export const uploadManyToCloudinary = (files = [], folder) =>
    Promise.all(files.map(f => uploadToCloudinary(f, folder)));

export default upload;
