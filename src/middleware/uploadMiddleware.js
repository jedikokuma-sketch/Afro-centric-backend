const multer = require('multer');
const { validateImageBuffer } = require('../services/cloudinaryService');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

function uploadSingle(req, res, next) {
  upload.single('image')(req, res, (error) => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(Object.assign(new Error('Image exceeds the 10MB upload limit.'), { statusCode: 413 }));
      }

      if (error.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(Object.assign(new Error('Only one image file can be uploaded at a time.'), { statusCode: 400 }));
      }

      return next(error);
    }

    return next();
  });
}

function validateUploadedImage(req, res, next) {
  if (!req.file) {
    return next(Object.assign(new Error('An image is required.'), { statusCode: 400 }));
  }

  try {
    validateImageBuffer(req.file);
    req.file.isValidated = true;
    return next();
  } catch (error) {
    const statusCode = error.statusCode || 415;
    return next(Object.assign(error, { statusCode }));
  }
}

module.exports = {
  uploadSingle,
  validateUploadedImage,
};
