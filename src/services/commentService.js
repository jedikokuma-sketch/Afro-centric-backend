import mongoose from 'mongoose';
import Comment from '../models/Comment.js';
import Photo from '../models/Photo.js';

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateObjectId(id, label) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw createError(`${label} is invalid.`, 400);
  }
}

function getUserId(user) {
  return String(user?._id ?? '');
}

function isAdmin(user) {
  return user?.role?.toLowerCase() === 'admin';
}

async function ensurePhotoExists(photoId) {
  const photo = await Photo.findById(photoId).select('_id');

  if (!photo) {
    throw createError('Photo not found.', 404);
  }
}

function parsePagination(query = {}) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 10);

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 50
  ) {
    throw createError(
      'Page must be positive and limit must be between 1 and 50.',
      400,
    );
  }

  return { page, limit };
}

export async function createComment({ photoId, user, text }) {
  validateObjectId(photoId, 'Photo ID');

  if (!user?._id) {
    throw createError('Authentication is required.', 401);
  }

  if (typeof text !== 'string' || !text.trim()) {
    throw createError('Comment text is required.', 400);
  }

  const cleanText = text.trim();

  if (cleanText.length > 1000) {
    throw createError('Comment cannot exceed 1000 characters.', 400);
  }

  await ensurePhotoExists(photoId);

  const comment = await Comment.create({
    photo: photoId,
    user: user._id,
    text: cleanText,
  });

  return Comment.findById(comment._id)
    .populate('user', 'name profilePicture')
    .lean();
}

export async function getPhotoComments({ photoId, query = {} }) {
  validateObjectId(photoId, 'Photo ID');

  const { page, limit } = parsePagination(query);

  await ensurePhotoExists(photoId);

  const filter = { photo: photoId };

  const [comments, total] = await Promise.all([
    Comment.find(filter)
      .populate('user', 'name profilePicture')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Comment.countDocuments(filter),
  ]);

  return {
    comments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function updateComment({ commentId, user, text }) {
  validateObjectId(commentId, 'Comment ID');

  if (!user?._id) {
    throw createError('Authentication is required.', 401);
  }

  if (typeof text !== 'string' || !text.trim()) {
    throw createError('Comment text is required.', 400);
  }

  const cleanText = text.trim();

  if (cleanText.length > 1000) {
    throw createError('Comment cannot exceed 1000 characters.', 400);
  }

  const comment = await Comment.findById(commentId);

  if (!comment) {
    throw createError('Comment not found.', 404);
  }

  if (String(comment.user) !== getUserId(user)) {
    throw createError('You can only edit your own comments.', 403);
  }

  comment.text = cleanText;
  await comment.save();

  return Comment.findById(comment._id)
    .populate('user', 'name profilePicture')
    .lean();
}

export async function deleteComment({ commentId, user }) {
  validateObjectId(commentId, 'Comment ID');

  if (!user?._id) {
    throw createError('Authentication is required.', 401);
  }

  const comment = await Comment.findById(commentId);

  if (!comment) {
    throw createError('Comment not found.', 404);
  }

  if (
    String(comment.user) !== getUserId(user) &&
    !isAdmin(user)
  ) {
    throw createError(
      'You do not have permission to delete this comment.',
      403,
    );
  }

  await Comment.deleteOne({ _id: comment._id });

  return { deletedCommentId: String(comment._id) };
}
