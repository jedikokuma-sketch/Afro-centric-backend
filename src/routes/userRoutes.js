import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import { getPublicProfile, updateMyProfile, updateProfilePicture } from '../controllers/userController.js';
import { uploadSingleImage } from '../middleware/uploadMiddleware.js';
import { validateImageBuffer } from '../services/cloudinaryService.js';

const router = express.Router();

function validateSingleUploadedImage(req, res, next) {
  try {
    if (!req.file) {
      const error = new Error('Provide an image in the "image" field.');
      error.statusCode = 400;
      throw error;
    }

    validateImageBuffer(req.file);
    return next();
  } catch (error) {
    return next(error);
  }
}

router.get('/:userId', getPublicProfile);
router.patch('/me', protect, updateMyProfile);
router.patch(
  '/me/profile-picture',
  protect,
  uploadSingleImage,
  validateSingleUploadedImage,
  updateProfilePicture,
);

export default router;
