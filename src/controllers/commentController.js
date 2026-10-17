import { createComment, getPhotoComments, updateComment, deleteComment } from '../services/commentService.js';

export async function createCommentController(req, res, next) {
  try {
    const comment = await createComment({
      photoId: req.params.photoId,
      user: req.user,
      text: req.body.text,
    });

    return res.status(201).json({
      success: true,
      message: 'Comment created successfully.',
      data: comment,
    });
  } catch (error) {
    return next(error);
  }
}

export async function getPhotoCommentsController(req, res, next) {
  try {
    const data = await getPhotoComments({
      photoId: req.params.photoId,
      query: req.query,
    });

    return res.status(200).json({
      success: true,
      message: 'Comments fetched successfully.',
      data,
    });
  } catch (error) {
    return next(error);
  }
}

export async function updateCommentController(req, res, next) {
  try {
    const comment = await updateComment({
      commentId: req.params.commentId,
      user: req.user,
      text: req.body.text,
    });

    return res.status(200).json({
      success: true,
      message: 'Comment updated successfully.',
      data: comment,
    });
  } catch (error) {
    return next(error);
  }
}

export async function deleteCommentController(req, res, next) {
  try {
    const data = await deleteComment({
      commentId: req.params.commentId,
      user: req.user,
    });

    return res.status(200).json({
      success: true,
      message: 'Comment deleted successfully.',
      data,
    });
  } catch (error) {
    return next(error);
  }
}

export default {
  createComment: createCommentController,
  getPhotoComments: getPhotoCommentsController,
  updateComment: updateCommentController,
  deleteComment: deleteCommentController,
};
