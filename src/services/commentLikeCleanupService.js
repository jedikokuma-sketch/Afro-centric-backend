import mongoose from 'mongoose';
import Comment from '../models/Comment.js';
import Like from '../models/Like.js';

export async function cleanupPhotoRelations(photoId) {
  if (!mongoose.Types.ObjectId.isValid(photoId)) {
    const error = new Error('Photo ID is invalid.');
    error.statusCode = 400;
    throw error;
  }

  const filter = { photo: photoId };

  // Remove both related collections before the photo itself is deleted.
  // If either operation fails, propagate the error to prevent photo deletion.
  const [commentsResult, likesResult] = await Promise.all([
    Comment.deleteMany(filter),
    Like.deleteMany(filter),
  ]);

  return {
    deletedComments: commentsResult.deletedCount ?? 0,
    deletedLikes: likesResult.deletedCount ?? 0,
  };
}

export default { cleanupPhotoRelations };
