import mongoose from "mongoose";
import UserModel from "../models/UserSchema.js";

/**
 * getSubordinateIds(userId)
 * ---------------------------------------------------------------
 * MongoDB $graphLookup se ek user ke SAARE neeche wale
 * employees (children, grandchildren, ...) ki IDs nikalata hai.
 *
 * Example tree:
 *   Admin B1
 *     -- HR H      (reportingTo = B1)
 *           -- Employee E  (reportingTo = H)
 *     -- Employee Z (reportingTo = B1)
 *
 * getSubordinateIds(B1._id) returns [B1, H, E, Z]
 * getSubordinateIds(H._id)  returns [H, E]   <- Z is NOT included!
 * getSubordinateIds(Z._id)  returns [Z]
 *
 * @param {string|ObjectId} userId
 * @returns {Promise<ObjectId[]>} array of ObjectIds (includes the user itself)
 */
export const getSubordinateIds = async (userId) => {
    try {
        const uid = typeof userId === "string"
            ? new mongoose.Types.ObjectId(userId)
            : userId;

        const result = await UserModel.aggregate([
            { $match: { _id: uid } },
            {
                $graphLookup: {
                    from: "users",
                    startWith: "$_id",
                    connectFromField: "_id",
                    connectToField: "reportingTo",
                    as: "subordinates",
                    maxDepth: 15,
                    restrictSearchWithMatch: {
                        isDeleted: { $ne: true }
                    }
                }
            },
            { $project: { subordinates: "$subordinates._id" } }
        ]);

        const childIds = result[0]?.subordinates || [];
        return [uid, ...childIds];
    } catch (err) {
        console.error("getSubordinateIds error:", err);
        return [userId];
    }
};
