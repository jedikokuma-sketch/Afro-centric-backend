import {
  createPhoto,
  deletePhoto,
  getPhotoById,
  listPhotos,
  updatePhoto,
} from '../services/photoService.mjs';

export async function createPhotoController(req, res, next) {
  try {
    const photo = await createPhoto({
      user: req.user,
      file: req.file,
      metadata: req.body,
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
