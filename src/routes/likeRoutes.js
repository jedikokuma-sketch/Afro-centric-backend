import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { toggleLikeController, getPhotoLikesController } from '../controllers/likeController.js';

const router = express.Router();

// Like or unlike a photo
router.post('/:photoId/likes/toggle', protect, toggleLikeController);

// Get likes for a photo
router.get('/:photoId/likes', getPhotoLikesController);

export default router;