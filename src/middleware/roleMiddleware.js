export const adminOnly = (req, res, next) => {
    // Ensure req.user exists (meaning authMiddleware ran first) and role is Admin
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({
            success: false,
            message: 'Access denied. Admin previllages required.',
        });
    }
};