import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { adminOnly } from '../middleware/roleMiddleware.js';
import {
  getUsers,
  updateUserStatus,
  updateUserRole,
  deleteAdminPhoto,
  deleteAdminComment,
} from '../controllers/adminController.js';

const router = express.Router();

// All admin routes require authentication and admin privileges.
router.use(protect, adminOnly);

// User management
router.get('/users', getUsers);
router.patch('/users/:userId/status', updateUserStatus);
router.patch('/users/:userId/role', updateUserRole);

// Admin deletion endpoints
router.delete('/photos/:photoId', deleteAdminPhoto);
router.delete('/comments/:commentId', deleteAdminComment);

export default router;
