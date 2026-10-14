const { Types: { ObjectId } } = require('mongoose');
const cloudinaryService = require('./cloudinaryService');

let PhotoModel = null;
try {
  PhotoModel = require('../models/Photo');
} catch (error) {
  PhotoModel = null;
}

let cleanupService = null;
try {
  cleanupService = require('./commentLikeCleanupService');
} catch (error) {
  cleanupService = null;
}

const ALLOWED_CATEGORIES = [
  'Culture',
  'People',
  'Fashion',
  'Nature',
  'Architecture',
  'Events',
  'Traditional Life',
  'Street Photography',
  'Food',
  'Wildlife',
];

const ALLOWED_EDIT_FIELDS = ['title', 'description', 'category', 'country', 'location', 'tags'];
const PROTECTED_FIELDS = ['_id', 'photographer', 'imageUrl', 'cloudinaryPublicId', 'createdAt', 'updatedAt'];

function setPhotoModel(model) {
  PhotoModel = model;
}

function resetPhotoModel() {
  PhotoModel = null;
}

function assertPhotoModel() {
  if (!PhotoModel) {
    throw Object.assign(new Error('The shared Photo model is not available. Add the project Photo model and export it from src/models/Photo.js.'), {
      statusCode: 503,
    });
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeString(value, fieldName, options = {}) {
  const { maxLength = 255, required = false } = options;
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw Object.assign(new Error(`${fieldName} is required.`), { statusCode: 400 });
    }
    return undefined;
  }

  if (typeof value !== 'string') {
    throw Object.assign(new Error(`${fieldName} must be a string.`), { statusCode: 400 });
  }

  const trimmed = value.trim();
  if (required && !trimmed) {
    throw Object.assign(new Error(`${fieldName} is required.`), { statusCode: 400 });
  }

  if (trimmed.length > maxLength) {
    throw Object.assign(new Error(`${fieldName} exceeds the ${maxLength}-character limit.`), { statusCode: 400 });
  }

  return trimmed;
}

function normalizeTags(value) {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  const rawTags = Array.isArray(value) ? value : [value];
  const normalized = [];

  for (const item of rawTags) {
    const tag = normalizeString(item, 'Tag', { maxLength: 50 });
    if (!tag) {
      continue;
    }

    const lowered = tag.toLowerCase();
    if (!normalized.some((existing) => existing.toLowerCase() === lowered)) {
      normalized.push(tag);
    }
  }

  if (normalized.length > 20) {
    throw Object.assign(new Error('Tags must contain at most 20 items.'), { statusCode: 400 });
  }

  return normalized;
}

function buildMetadataFromRequest(rawInput = {}) {
  const metadata = rawInput && typeof rawInput === 'object' ? rawInput : {};

  const allowedKeys = new Set(['title', 'description', 'category', 'country', 'location', 'tags']);
  const unknownKeys = Object.keys(metadata).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw Object.assign(new Error(`Unsupported photo fields: ${unknownKeys.join(', ')}`), { statusCode: 400 });
  }

  const nextMetadata = {};

  if (Object.prototype.hasOwnProperty.call(metadata, 'title')) {
    nextMetadata.title = normalizeString(metadata.title, 'Title', { maxLength: 120, required: true });
  }

  if (Object.prototype.hasOwnProperty.call(metadata, 'description')) {
    nextMetadata.description = normalizeString(metadata.description, 'Description', { maxLength: 2000 });
  }

  if (Object.prototype.hasOwnProperty.call(metadata, 'category')) {
    const category = normalizeString(metadata.category, 'Category', { maxLength: 50, required: true });
    if (!ALLOWED_CATEGORIES.includes(category)) {
      throw Object.assign(new Error(`Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}`), { statusCode: 400 });
    }

    nextMetadata.category = category;
  }

  if (Object.prototype.hasOwnProperty.call(metadata, 'country')) {
    nextMetadata.country = normalizeString(metadata.country, 'Country', { maxLength: 100, required: true });
  }

  if (Object.prototype.hasOwnProperty.call(metadata, 'location')) {
    nextMetadata.location = normalizeString(metadata.location, 'Location', { maxLength: 200 });
  }

  if (Object.prototype.hasOwnProperty.call(metadata, 'tags')) {
    nextMetadata.tags = normalizeTags(metadata.tags);
  }

  return nextMetadata;
}

function isAdminUser(user) {
  if (!user) {
    return false;
  }

  const role = user.role || user.userRole || '';
  return Boolean(user.isAdmin || role.toLowerCase() === 'admin' || role.toLowerCase() === 'superadmin');
}

async function createPhoto({ user, file, metadata = {} }) {
  if (!user || !user._id) {
    throw Object.assign(new Error('Authentication is required to upload a photo.'), { statusCode: 401 });
  }

  if (!file || !file.buffer) {
    throw Object.assign(new Error('An image is required.'), { statusCode: 400 });
  }

  cloudinaryService.validateImageBuffer(file);
  assertPhotoModel();

  const cleanMetadata = buildMetadataFromRequest(metadata);
  const protectedFields = Object.keys(metadata).filter((key) => PROTECTED_FIELDS.includes(key));
  if (protectedFields.length > 0) {
    throw Object.assign(new Error(`Protected fields cannot be set by the client: ${protectedFields.join(', ')}`), { statusCode: 400 });
  }

  let uploadedAsset = null;
  try {
    uploadedAsset = await cloudinaryService.uploadImage(file, { folder: 'afrolens/photos' });

    const photo = new PhotoModel({
      ...cleanMetadata,
      photographer: user._id,
      imageUrl: uploadedAsset.secure_url,
      cloudinaryPublicId: uploadedAsset.public_id,
    });

    await photo.save();
    return photo.toObject ? photo.toObject() : photo;
  } catch (error) {
    if (uploadedAsset && uploadedAsset.public_id) {
      try {
        await cloudinaryService.deleteImage(uploadedAsset.public_id);
      } catch (cleanupError) {
        // Intentionally keep the original failure while logging the cleanup issue.
        console.warn('Cloudinary cleanup after photo save failure failed.', cleanupError.message || cleanupError);
      }
    }

    throw error;
  }
}

async function listPhotos(query = {}) {
  assertPhotoModel();

  const rawPage = query.page === undefined || query.page === null || query.page === '' ? 1 : Number.parseInt(query.page, 10);
  const rawLimit = query.limit === undefined || query.limit === null || query.limit === '' ? 12 : Number.parseInt(query.limit, 10);
  const page = Number.isInteger(rawPage) ? rawPage : Number.NaN;
  const limit = Number.isInteger(rawLimit) ? rawLimit : Number.NaN;

  if (Number.isNaN(page) || page < 1) {
    throw Object.assign(new Error('Page must be a positive integer.'), { statusCode: 400 });
  }

  if (Number.isNaN(limit) || limit < 1 || limit > 50) {
    throw Object.assign(new Error('Limit must be between 1 and 50.'), { statusCode: 400 });
  }

  const filter = {};
  const rawCategory = typeof query.category === 'string' ? query.category.trim() : '';
  const rawCountry = typeof query.country === 'string' ? query.country.trim() : '';
  const rawTag = typeof query.tag === 'string' ? query.tag.trim() : '';
  const rawSearch = typeof query.search === 'string' ? query.search.trim() : '';

  if (rawCategory) {
    filter.category = rawCategory;
  }

  if (rawCountry) {
    filter.country = new RegExp(`^${escapeRegExp(rawCountry)}$`, 'i');
  }

  if (rawTag) {
    filter.tags = { $in: [new RegExp(`^${escapeRegExp(rawTag)}$`, 'i')] };
  }

  if (rawSearch) {
    const searchRegex = new RegExp(escapeRegExp(rawSearch), 'i');
    filter.$or = [
      { title: searchRegex },
      { description: searchRegex },
      { location: searchRegex },
      { tags: { $in: [searchRegex] } },
    ];
  }

  const [photos, total] = await Promise.all([
    PhotoModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PhotoModel.countDocuments(filter),
  ]);

  return {
    photos,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

async function getPhotoById(photoId) {
  if (!photoId || !ObjectId.isValid(photoId)) {
    throw Object.assign(new Error('Photo ID is invalid.'), { statusCode: 400 });
  }

  assertPhotoModel();

  const photoQuery = PhotoModel.findById(photoId);
  let photo = null;

  if (photoQuery && typeof photoQuery.populate === 'function') {
    photo = await photoQuery.populate('photographer', '_id name username avatar');
  } else {
    photo = await PhotoModel.findById(photoId);
  }

  if (!photo) {
    throw Object.assign(new Error('Photo not found.'), { statusCode: 404 });
  }

  return photo.toObject ? photo.toObject() : photo;
}

async function updatePhoto({ photoId, user, updates = {} }) {
  if (!user || !user._id) {
    throw Object.assign(new Error('Authentication is required.'), { statusCode: 401 });
  }

  if (!photoId || !ObjectId.isValid(photoId)) {
    throw Object.assign(new Error('Photo ID is invalid.'), { statusCode: 400 });
  }

  assertPhotoModel();

  const allowedUpdates = {};
  const updateKeys = Object.keys(updates || {});
  if (updateKeys.length === 0) {
    throw Object.assign(new Error('At least one update field is required.'), { statusCode: 400 });
  }

  const forbiddenFields = updateKeys.filter((key) => !ALLOWED_EDIT_FIELDS.includes(key) || PROTECTED_FIELDS.includes(key));
  if (forbiddenFields.length > 0) {
    throw Object.assign(new Error(`These fields are not editable: ${forbiddenFields.join(', ')}`), { statusCode: 400 });
  }

  const photo = await PhotoModel.findById(photoId);
  if (!photo) {
    throw Object.assign(new Error('Photo not found.'), { statusCode: 404 });
  }

  const photoOwnerId = photo.photographer ? String(photo.photographer) : '';
  const currentUserId = String(user._id);
  const isOwner = photoOwnerId === currentUserId;
  const isAdmin = isAdminUser(user);

  if (!isOwner && !isAdmin) {
    throw Object.assign(new Error('You do not have permission to update this photo.'), { statusCode: 403 });
  }

  if (!isOwner && isAdmin) {
    throw Object.assign(new Error('Admin users are not allowed to edit another user\'s photo metadata.'), { statusCode: 403 });
  }

  for (const key of updateKeys) {
    if (key === 'tags') {
      allowedUpdates.tags = normalizeTags(updates.tags);
      continue;
    }

    if (key === 'category') {
      const category = normalizeString(updates.category, 'Category', { maxLength: 50, required: true });
      if (!ALLOWED_CATEGORIES.includes(category)) {
        throw Object.assign(new Error(`Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}`), { statusCode: 400 });
      }
      allowedUpdates.category = category;
      continue;
    }

    if (key === 'title') {
      allowedUpdates.title = normalizeString(updates.title, 'Title', { maxLength: 120, required: true });
      continue;
    }

    if (key === 'description') {
      allowedUpdates.description = normalizeString(updates.description, 'Description', { maxLength: 2000 });
      continue;
    }

    if (key === 'country') {
      allowedUpdates.country = normalizeString(updates.country, 'Country', { maxLength: 100, required: true });
      continue;
    }

    if (key === 'location') {
      allowedUpdates.location = normalizeString(updates.location, 'Location', { maxLength: 200 });
    }
  }

  Object.assign(photo, allowedUpdates);
  await photo.save();
  return photo.toObject ? photo.toObject() : photo;
}

async function deletePhoto({ photoId, user }) {
  if (!user || !user._id) {
    throw Object.assign(new Error('Authentication is required.'), { statusCode: 401 });
  }

  if (!photoId || !ObjectId.isValid(photoId)) {
    throw Object.assign(new Error('Photo ID is invalid.'), { statusCode: 400 });
  }

  assertPhotoModel();

  const photo = await PhotoModel.findById(photoId);
  if (!photo) {
    throw Object.assign(new Error('Photo not found.'), { statusCode: 404 });
  }

  const isOwner = String(photo.photographer) === String(user._id);
  const isAdmin = isAdminUser(user);

  if (!isOwner && !isAdmin) {
    throw Object.assign(new Error('You do not have permission to delete this photo.'), { statusCode: 403 });
  }

  if (!cleanupService || typeof cleanupService.cleanupPhotoRelations !== 'function') {
    throw Object.assign(new Error('The shared comments/likes cleanup service is required before deleting a photo.'), { statusCode: 503 });
  }

  try {
    await cleanupService.cleanupPhotoRelations(String(photo._id));
  } catch (error) {
    throw Object.assign(new Error('Related comment and like cleanup failed before the photo could be deleted.'), {
      statusCode: 503,
      cause: error,
    });
  }

  try {
    if (photo.cloudinaryPublicId) {
      await cloudinaryService.deleteImage(photo.cloudinaryPublicId);
    }
  } catch (error) {
    throw Object.assign(new Error('Cloudinary asset removal failed during photo deletion.'), {
      statusCode: 503,
      cause: error,
    });
  }

  await PhotoModel.deleteOne({ _id: photo._id });

  return {
    deletedPhotoId: String(photo._id),
    cloudinaryDeleted: Boolean(photo.cloudinaryPublicId),
    cleanupStatus: 'completed',
  };
}

module.exports = {
  ALLOWED_CATEGORIES,
  setPhotoModel,
  resetPhotoModel,
  createPhoto,
  listPhotos,
  getPhotoById,
  updatePhoto,
  deletePhoto,
};
