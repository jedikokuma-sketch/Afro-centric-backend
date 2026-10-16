import express from 'express';
import { protect } from '../middleware/authMiddleware.js';
import {
  createPhotoController,
  deletePhotoController,
  getPhotoController,
  listPhotosController,
  updatePhotoController,
} from '../controllers/photoController.mjs';
import {
  requirePhotoUser,
  uploadImages,
  validateUploadedImage,
} from '../middleware/uploadMiddleware.mjs';

const router = express.Router();

router.post('/', protect, requirePhotoUser, uploadImages, validateUploadedImage, createPhotoController);
router.get('/', listPhotosController);
router.get('/:id', getPhotoController);
router.patch('/:id', protect, updatePhotoController);
router.delete('/:id', protect, deletePhotoController);

export default router;
