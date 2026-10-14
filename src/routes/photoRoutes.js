const express = require('express');
const photoController = require('../controllers/photoController');
const { uploadSingle, validateUploadedImage } = require('../middleware/uploadMiddleware');

let authenticate = null;
try {
  const authModule = require('../middleware/authMiddleware');
  authenticate = authModule.authenticate || authModule.requireAuth || authModule.default || authModule;
} catch (error) {
  authenticate = (req, res, next) => {
    const authError = new Error(
      'Authentication middleware is required before the photo upload route. Expected authenticate(req, res, next) from the shared auth module.'
    );
    authError.statusCode = 503;
    return next(authError);
  };
}

const router = express.Router();

router.post('/', authenticate, uploadSingle, validateUploadedImage, photoController.createPhoto);
router.get('/', photoController.listPhotos);
router.get('/:id', photoController.getPhotoById);
router.patch('/:id', authenticate, photoController.updatePhoto);
router.delete('/:id', authenticate, photoController.deletePhoto);

module.exports = router;
