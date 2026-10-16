import { body, param, validationResult } from 'express-validator';

// Middleware to check validation results and return 404 if error exist
export const validate = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(404).json({
            success: false,
            errors: errors.array().map((err) => ({
                field: err.path,
                message: err.msg,
            })),
        });
    }
    next();
};

// 1. Validation rules for User Registration
export const validateRegister = [
    body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2})
    .withMessage('Name must be at least 2 characters long'),
    body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address'),
    body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
    validate,
];

// 2. Validation rules for User Login
export const validateLogin = [
    body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email address'),
    body('pasword')
    .notEmpty()
    .withMessage('Password is required'),
    validate,
];

// 3. Validation rule for checking MongoDB Object IDs in URL parameters (e.g., /photos/:id)
export const validateObjectId = [
    param('id')
    .isMongoId()
    .withMessage('Invalid ID format. Must be a valid MongoDB ObjectId'),
    validate,
];