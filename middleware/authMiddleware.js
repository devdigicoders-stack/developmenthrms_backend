import jwt from 'jsonwebtoken'
import EnvData from '../config/EnvData.js'


export const genrateToken = (payload) => {
    return jwt.sign(payload, EnvData.JWT_SECRET, { expiresIn: "1d" })
}



export const protect = (req, res, next) => {
    const token = req.cookies.token;
    // const token = req.headers.authorization?.split(" ")[1]
    if (!token) {
        return res.status(401).json({success:false, message: "Not authorized, no token" })
    }
    try {
        const decoded = jwt.verify(token, EnvData.JWT_SECRET)
        req.user = decoded
        next()
    } catch (error) {
        return res.status(401).json({ message: "Not authorized, token failed", success: false })
    }
}

export const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ message: "Not authorized to access this route", success: false })
        }
        next()
    }
};

// Permission-based guard — fetches fresh permissions from DB on every request
export const hasPermission = (...perms) => {
    return async (req, res, next) => {
        try {
            const roleName = req.user.role;
            if (roleName === "super_admin") return next();

            // Dynamically import to avoid circular deps
            const { default: User } = await import("../models/UserSchema.js");
            const user = await User.findById(req.user.userId)
                .select("role isActive")
                .populate("role", "name permissions");

            if (!user || !user.isActive)
                return res.status(403).json({ message: "Account inactive or not found", success: false });

            if (user.role?.name === "super_admin") return next();

            const userPerms = user.role?.permissions || [];
            if (perms.some(p => userPerms.includes(p))) return next();

            return res.status(403).json({ message: "Permission denied", success: false });
        } catch (err) {
            return res.status(500).json({ message: "Permission check failed", success: false });
        }
    };
};

