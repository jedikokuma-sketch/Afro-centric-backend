import {
  createPhotos,
  deletePhoto,
  getPhotoById,
  listPhotos,
  updatePhoto,
} from '../services/photoService.js';

export async function createPhotoController(req, res, next) {
  try {
    const files = req.files;
    let metadata;
    if (files.length === 1) {
      metadata = [req.body];
    } else {
      try {
        metadata = JSON.parse(req.body.photos);
      } catch {
        const error = new Error('For multiple images, provide a JSON array of metadata objects in the "photos" field.');
        error.statusCode = 400;
        throw error;
      }
      if (!Array.isArray(metadata)) {
        const error = new Error('The "photos" field must be a JSON array of metadata objects.');
        error.statusCode = 400;
        throw error;
      }
    }

    const photos = await createPhotos({
      user: req.user,
      files,
      metadataList: metadata,
    });

    return res.status(201).json({
      success: true,
      message: photos.length === 1 ? 'Photo uploaded successfully.' : 'Photos uploaded successfully.',
      data: photos.length === 1 ? photos[0] : photos,
    });
  } catch (error) {
    return next(error);
  }
}

export async function listPhotosController(req, res, next) {
  try {
    const data = await listPhotos(req.query);
    return res.status(200).json({
      success: true,
      message: 'Photos fetched successfully.',
      data,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getPhotoController(req, res, next) {
  try {
    const photo = await getPhotoById(req.params.id);
    return res.status(200).json({
      success: true,
      message: 'Photo retrieved successfully.',
      data: photo,
    });
  } catch (error) {
    return next(error);
  }
}

export async function updatePhotoController(req, res, next) {
  try {
    const photo = await updatePhoto({
      photoId: req.params.id,
      user: req.user,
      updates: req.body,
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

export async function deletePhotoController(req, res, next) {
  try {
    const data = await deletePhoto({
      photoId: req.params.id,
      user: req.user,
    });
    return res.status(200).json({
      success: true,
      message: 'Photo deleted successfully.',
      data,
    });
  } catch (error) {
    return next(error);
  }
}

export default {
  createPhoto: createPhotoController,
  listPhotos: listPhotosController,
  getPhotoById: getPhotoController,
  updatePhoto: updatePhotoController,
  deletePhoto: deletePhotoController,
};
