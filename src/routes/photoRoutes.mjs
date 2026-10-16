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
  uploadSingle,
  validateUploadedImage,
} from '../middleware/uploadMiddleware.mjs';

const router = express.Router();

router.post('/', protect, requirePhotoUser, uploadSingle, validateUploadedImage, createPhotoController);
router.get('/', listPhotosController);
router.get('/:id', getPhotoController);
router.patch('/:id', protect, updatePhotoController);
router.delete('/:id', protect, deletePhotoController);

export default router;
