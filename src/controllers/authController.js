import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import generateToken from '../utils/generateToken.js';

//@desc Register a new user
// @route POST /api/auth/register
// @access Public
export const registerUser = async (req, res, next) => {
    try {
        const { name, email, password, bio, profilePicture } = req.body;

        // 1. To check if user already exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email.',
            });
        }

        // 2. Create user
        const user = await User.create({
            name,
            email,
            password,
            bio: bio || '',
            profilePicture: profilePicture || '',
            role: 'user', // Force default role
        });

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            data: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: generateToken(user._id),
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc Authenticate user & get token
// @route POST /api/auth/login
// @access Public
export const loginUser = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // 1. Find user by email and include password field
        const user = await User.findOne({ email }).select('+password');

        // 2. Check if user exists and password is correct
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
            });
        }

        // 3. Check if account is suspended
        if (user.accountStatus === 'suspended') {
            return res.status(403).json({
                success: false,
                message: 'Your account has been suspended. Please contact support.',
            });
        }

        // 4. Send success response with token
        return res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: generateToken(user._id),
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc Get current user profile
// @route GET /api/auth/me
// @access Private
export const getMe = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        res.json({
            success: true,
            data: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                bio: user.bio,
                profilePicture: user.profilePicture,
            },
        });
    } catch (error) {
        next(error);
    }
};

// @desc Logout user / Clear session or token
// @route POST /api/auth/logout
// @access Public / Private
export const logoutUser = async (req, res) => {
    try {
        res.cookie('token', '', {
            httpOnly: true,
            expires: new Date(0),
        });

        return res.status(200).json({
            success: true,
            message: 'User logged out successfully',
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Logout failed',
            error: error.message,
        });
    }
};