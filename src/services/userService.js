import mongoose from 'mongoose';
import User from '../models/User.js';
import { uploadImage, deleteImage } from './cloudinaryService.js';

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateUserId(userId) {
  if (
    typeof userId !== 'string' ||
    !mongoose.Types.ObjectId.isValid(userId)
  ) {
    throw createError('User ID is invalid.', 400);
  }
}

function getPublicProfile(user) {
  return {
    _id: user._id,
    name: user.name,
    profilePicture: user.profilePicture,
    bio: user.bio,
    createdAt: user.createdAt,
  };
}

export async function getPublicUserProfile(userId) {
  validateUserId(userId);

  const user = await User.findById(userId)
    .select('name profilePicture bio createdAt')
    .lean();

  if (!user) {
    throw createError('User not found.', 404);
  }

  return getPublicProfile(user);
}

export async function updateUserProfile(userId, updates) {
  if (!userId) {
    throw createError('Authentication is required.', 401);
  }

  if (
    !updates ||
    typeof updates !== 'object' ||
    Array.isArray(updates)
  ) {
    throw createError('Request body must be an object.', 400);
  }

  const fields = Object.keys(updates);
  const allowedFields = ['name', 'bio'];

  if (fields.length === 0) {
    throw createError('Provide name and/or bio to update.', 400);
  }

  const unsupportedFields = fields.filter(
    (field) => !allowedFields.includes(field),
  );

  if (unsupportedFields.length > 0) {
    throw createError(
      `Unsupported profile fields: ${unsupportedFields.join(', ')}.`,
      400,
    );
  }

  const cleanUpdates = {};

  if (Object.hasOwn(updates, 'name')) {
    if (typeof updates.name !== 'string') {
      throw createError('Name must be a string.', 400);
    }

    const name = updates.name.trim();

    if (name.length < 2 || name.length > 100) {
      throw createError(
        'Name must be between 2 and 100 characters.',
        400,
      );
    }

    cleanUpdates.name = name;
  }

  if (Object.hasOwn(updates, 'bio')) {
    if (typeof updates.bio !== 'string') {
      throw createError('Bio must be a string.', 400);
    }

    const bio = updates.bio.trim();

    if (bio.length > 300) {
      throw createError('Bio cannot exceed 300 characters.', 400);
    }

    cleanUpdates.bio = bio;
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: cleanUpdates },
    {
      new: true,
      runValidators: true,
    },
  ).select('name profilePicture bio createdAt');

  if (!user) {
    throw createError('User not found.', 404);
  }

  return getPublicProfile(user);
}

export async function updateUserProfilePicture(userId, file) {
  if (!userId) {
    throw createError('Authentication is required.', 401);
  }

  if (!file) {
    throw createError(
      'Provide an image in the "image" field.',
      400,
    );
  }

  const user = await User.findById(userId);

  if (!user) {
    throw createError('User not found.', 404);
  }

  const uploadedAsset = await uploadImage(file, {
    folder: 'Afro-centric/profile-pictures',
  });

  try {
    user.profilePicture = uploadedAsset.secure_url;
    await user.save();

    return getPublicProfile(user);
  } catch (error) {
    // Remove the newly uploaded asset if the database update fails.
    try {
      await deleteImage(uploadedAsset.public_id);
    } catch (cleanupError) {
      console.error(
        'Profile-picture upload cleanup failed:',
        cleanupError.message,
      );
    }

    throw error;
  }
}
