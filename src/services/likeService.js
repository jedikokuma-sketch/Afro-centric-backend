import mongoose from 'mongoose';
import Like from '../models/Like.js';
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

export async function toggleLike({ photoId, user }) {
  validateObjectId(photoId, 'Photo ID');

  if (!user?._id) {
    throw createError('Authentication is required.', 401);
  }

  await ensurePhotoExists(photoId);

  const existingLike = await Like.findOne({
    photo: photoId,
    user: user._id,
  });

  if (existingLike) {
    await Like.deleteOne({ _id: existingLike._id });

    return {
      liked: false,
      photoId: String(photoId),
    };
  }

  try {
    await Like.create({
      photo: photoId,
      user: user._id,
    });
  } catch (error) {
    // Handle a duplicate-key race between simultaneous requests.
    if (error.code === 11000) {
      const like = await Like.findOne({
        photo: photoId,
        user: user._id,
      });

      if (like) {
        return {
          liked: true,
          photoId: String(photoId),
        };
      }
    }

    throw error;
  }

  return {
    liked: true,
    photoId: String(photoId),
  };
}

export async function getPhotoLikes({ photoId, query = {} }) {
  validateObjectId(photoId, 'Photo ID');

  const { page, limit } = parsePagination(query);

  await ensurePhotoExists(photoId);

  const filter = { photo: photoId };

  const [likes, total] = await Promise.all([
    Like.find(filter)
      .populate('user', 'name profilePicture')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Like.countDocuments(filter),
  ]);

  return {
    likes,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
