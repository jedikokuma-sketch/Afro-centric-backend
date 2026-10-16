import rateLimit from 'express-rate-limit';

// 1. Strict Limiter for Auth Routes (login / Register)
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes window
    max: 10, // Limit each IP to 10 login/register attempts per 15 mins
    message: {
        success: false,
        message: 'Too many authentication attempts from this IP. Please try again after 15 minutes',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// 2. General Limiter for All Standard API Routes
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        success: false,
        message: 'Too many requests from this IP. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// 3. Limiter for Upload Operations
export const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour window
    max: 20, // Limit each IP to 20 uploads per hour
    message: {
        success: false,
        message: 'Upload limit reached for this IP. Please try again in an hour',
    },
    standardHeaders: true,
    legacyHeaders: false,
});