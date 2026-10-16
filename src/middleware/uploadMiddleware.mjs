import multer from 'multer';
import { validateImageBuffer } from '../services/cloudinaryService.mjs';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

export function requirePhotoUser(req, res, next) {
  if (!req.user?._id) {
    const error = new Error('Authentication is required.');
    error.statusCode = 401;
    return next(error);
  }
  return next();
}

export function uploadSingle(req, res, next) {
  upload.single('image')(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error.code === 'LIMIT_FILE_SIZE') {
      error.statusCode = 413;
      error.message = 'Image exceeds the 10MB upload limit.';
    } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      error.statusCode = 400;
      error.message = 'Only one file in the "image" field is allowed.';
    }

    return next(error);
  });
}

export function validateUploadedImage(req, res, next) {
  try {
    if (!req.file) {
      const error = new Error('An image is required in the "image" field.');
      error.statusCode = 400;
      throw error;
    }

    validateImageBuffer(req.file);
    return next();
  } catch (error) {
    return next(error);
  }
}
