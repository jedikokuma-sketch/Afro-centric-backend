import jwt from 'jsonwebtoken';
import User from '../models/User.js'

export const protect = async (req, res, next) => {
    let token;
    // Using optional chaining (?.) prevents crashes if authorization header is missing
    if (req.headers.authorization?.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            // Find user from the token (excluding password)
            req.user = await User.findById(decoded.id).select('-password');

            if (!req.user || req.user.accountStatus !== 'active') {
                return res.status(401).json({
                    success: false,
                    message: 'Account not found or inactive. Please log in again.',
                });
            }

            return next();
        } catch (error) {
            console.error(error);
            return res.status(401).json({
                success: false,
                message: 'Not authorized, kindly login',
            });
        }
    }

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Not authorized, kindly login',
        });
    }
};