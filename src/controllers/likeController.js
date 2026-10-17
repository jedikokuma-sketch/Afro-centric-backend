import { toggleLike, getPhotoLikes } from '../services/likeService.js';

export async function toggleLikeController(req, res, next) {
  try {
    const data = await toggleLike({
      photoId: req.params.photoId,
      user: req.user,
    });

    return res.status(200).json({
      success: true,
      message: data.liked
        ? 'Photo liked successfully.'
        : 'Photo unliked successfully.',
      data,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getPhotoLikesController(req, res, next) {
  try {
    const data = await getPhotoLikes({
      photoId: req.params.photoId,
      query: req.query,
    });

    return res.status(200).json({
      success: true,
      message: 'Likes fetched successfully.',
      data,
    });
  } catch (error) {
    return next(error);
  }
}

export default {
  toggleLike: toggleLikeController,
  getPhotoLikes: getPhotoLikesController,
};
