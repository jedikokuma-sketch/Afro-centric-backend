import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { createCommentController, getPhotoCommentsController, updateCommentController, deleteCommentController } from '../controllers/commentController.js';

const router = express.Router();

// Create a comment on a photo
router.post('/:photoId/comments', protect, createCommentController);

// Get comments for a photo
router.get('/:photoId/comments', getPhotoCommentsController);

// Update a comment
router.patch('/comments/:commentId', protect, updateCommentController);

// Delete a comment
router.delete('/comments/:commentId', protect, deleteCommentController);

export default router;
