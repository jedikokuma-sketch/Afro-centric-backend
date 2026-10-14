const photoService = require('../services/photoService');

async function createPhoto(req, res, next) {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
        errors: ['Authentication required.'],
      });
    }

    const photo = await photoService.createPhoto({
      user: req.user,
      file: req.file,
      metadata: req.body || {},
    });

    return res.status(201).json({
      success: true,
      message: 'Photo uploaded successfully.',
      data: photo,
    });
  } catch (error) {
    return next(error);
  }
}

async function listPhotos(req, res, next) {
  try {
    const result = await photoService.listPhotos(req.query || {});
    return res.status(200).json({
      success: true,
      message: 'Photos fetched successfully.',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function getPhotoById(req, res, next) {
  try {
    const photo = await photoService.getPhotoById(req.params.id);
    return res.status(200).json({
      success: true,
      message: 'Photo retrieved successfully.',
      data: photo,
    });
  } catch (error) {
    return next(error);
  }
}

async function updatePhoto(req, res, next) {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
        errors: ['Authentication required.'],
      });
    }

    const photo = await photoService.updatePhoto({
      photoId: req.params.id,
      user: req.user,
      updates: req.body || {},
    });

    return res.status(200).json({
      success: true,
      message: 'Photo updated successfully.',
      data: photo,
    });
  } catch (error) {
    return next(error);
  }
}

async function deletePhoto(req, res, next) {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
        errors: ['Authentication required.'],
      });
    }

    const result = await photoService.deletePhoto({
      photoId: req.params.id,
      user: req.user,
    });

    return res.status(200).json({
      success: true,
      message: 'Photo deleted successfully.',
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createPhoto,
  listPhotos,
  getPhotoById,
  updatePhoto,
  deletePhoto,
};
