import { Types } from 'mongoose';
import cloudinaryService from './cloudinaryService.mjs';

export const ALLOWED_CATEGORIES = Object.freeze([
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
]);

const allowedMetadataFields = new Set([
  'title', 'description', 'category', 'country', 'location', 'tags',
]);
const protectedFields = new Set([
  '_id', 'photographer', 'imageUrl', 'cloudinaryPublicId', 'createdAt', 'updatedAt',
]);
const allowedQueryFields = new Set(['search', 'category', 'country', 'tag', 'page', 'limit']);
const fieldLimits = Object.freeze({
  title: 120,
  description: 2000,
  category: 50,
  country: 100,
  location: 200,
  tag: 30,
});

let injectedPhotoModel;
let injectedCleanupService;

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function databaseError(cause, message) {
  if (cause?.name === 'ValidationError' || cause?.name === 'CastError') {
    return createError('Photo data does not satisfy the shared Photo schema.', 400);
  }
  const error = createError(message, 503);
  error.cause = cause;
  return error;
}

export function setPhotoModelForTests(model) {
  injectedPhotoModel = model;
}

export function setPhotoCleanupForTests(cleanupService) {
  injectedCleanupService = cleanupService;
}

export function resetPhotoDependenciesForTests() {
  injectedPhotoModel = undefined;
  injectedCleanupService = undefined;
}

async function getPhotoModel() {
  if (injectedPhotoModel) {
    return injectedPhotoModel;
  }

  try {
    const module = await import('../models/Photo.js');
    return module.default;
  } catch (cause) {
    const error = createError('The shared Photo model is unavailable; resolve and export the agreed Photo schema before mounting photo routes.', 503);
    error.cause = cause;
    throw error;
  }
}

async function getCleanupService() {
  if (injectedCleanupService) {
    return injectedCleanupService;
  }

  try {
    const module = await import('./commentLikeCleanupService.js');
    const cleanupService = module.cleanupPhotoRelations
      ? module
      : module.default;
    if (typeof cleanupService?.cleanupPhotoRelations !== 'function') {
      throw new Error('cleanupPhotoRelations(photoId) is not exported.');
    }
    return cleanupService;
  } catch (cause) {
    const error = createError('The shared Comments & Likes cleanup service is unavailable; photo deletion is disabled until it exports cleanupPhotoRelations(photoId).', 503);
    error.cause = cause;
    throw error;
  }
}

function requirePlainObject(value, label) {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw createError(`${label} must be an object.`, 400);
  }
  return value;
}

function normalizeString(value, field, { required = false, maxLength = 255 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw createError(`${field} is required.`, 400);
    }
    return value === '' ? '' : undefined;
  }
  if (typeof value !== 'string') {
    throw createError(`${field} must be a string.`, 400);
  }
  const normalized = value.trim();
  if (required && normalized.length === 0) {
    throw createError(`${field} is required.`, 400);
  }
  if (normalized.length > maxLength) {
    throw createError(`${field} cannot exceed ${maxLength} characters.`, 400);
  }
  return normalized;
}

function normalizeTags(value) {
  let tags = value;
  if (typeof tags === 'string') {
    try {
      tags = JSON.parse(tags);
    } catch {
      throw createError('Tags must be a JSON-encoded array of strings.', 400);
    }
  }
  if (!Array.isArray(tags)) {
    throw createError('Tags must be an array of strings.', 400);
  }
  if (tags.length > 20) {
    throw createError('Tags cannot contain more than 20 items.', 400);
  }

  const normalized = [];
  for (const valueItem of tags) {
    const tag = normalizeString(valueItem, 'Each tag', { required: true, maxLength: fieldLimits.tag });
    if (!normalized.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      normalized.push(tag);
    }
  }
  return normalized;
}

function normalizeMetadata(input, { requireCreationFields = false } = {}) {
  const metadata = requirePlainObject(input, 'Photo metadata');
  const keys = Object.keys(metadata);
  const forbidden = keys.filter((key) => protectedFields.has(key));
  if (forbidden.length > 0) {
    throw createError(`Protected photo fields cannot be set: ${forbidden.join(', ')}.`, 400);
  }
  const unknown = keys.filter((key) => !allowedMetadataFields.has(key));
  if (unknown.length > 0) {
    throw createError(`Unsupported photo fields: ${unknown.join(', ')}.`, 400);
  }

  if (requireCreationFields && ['title', 'category', 'country'].some((field) => !Object.hasOwn(metadata, field))) {
    throw createError('Title, category, and country are required.', 400);
  }

  const result = {};
  for (const field of ['title', 'description', 'country', 'location']) {
    if (Object.hasOwn(metadata, field)) {
      result[field] = normalizeString(metadata[field], field, {
        required: field === 'title' || field === 'country' && requireCreationFields,
        maxLength: fieldLimits[field],
      });
      if (field === 'title' && result[field].length < 2) {
        throw createError('title must be at least 2 characters.', 400);
      }
    }
  }
  if (Object.hasOwn(metadata, 'category')) {
    const category = normalizeString(metadata.category, 'category', { required: true, maxLength: fieldLimits.category });
    if (!ALLOWED_CATEGORIES.includes(category)) {
      throw createError(`Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}.`, 400);
    }
    result.category = category;
  }
  if (Object.hasOwn(metadata, 'tags')) {
    result.tags = normalizeTags(metadata.tags);
  }
  return result;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function queryString(query, field, maxLength = 100) {
  const value = query[field];
  if (value === undefined || value === '') {
    return '';
  }
  if (typeof value !== 'string') {
    throw createError(`${field} must be a single string value.`, 400);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw createError(`${field} cannot exceed ${maxLength} characters.`, 400);
  }
  return normalized;
}

function parsePageValue(value, field, fallback, max = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === '') {
    return fallback;
  }
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw createError(`${field} must be a positive integer.`, 400);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > max) {
    throw createError(`${field} must be between 1 and ${max}.`, 400);
  }
  return number;
}

function assertPhotoId(photoId) {
  if (typeof photoId !== 'string' || !Types.ObjectId.isValid(photoId)) {
    throw createError('Photo ID is invalid.', 400);
  }
}

function assertAuthenticatedUser(user) {
  if (!user?._id || !Types.ObjectId.isValid(String(user._id))) {
    throw createError('Authentication is required.', 401);
  }
}

function userId(value) {
  return String(value?._id ?? value ?? '');
}

function isAdmin(user) {
  return typeof user?.role === 'string' && user.role.toLowerCase() === 'admin';
}

async function findPhotoById(model, photoId) {
  const query = model.findById(photoId);
  if (query && typeof query.populate === 'function') {
    return query.populate('photographer', 'name profilePicture');
  }
  return query;
}

export async function createPhoto({ user, file, metadata }) {
  assertAuthenticatedUser(user);
  if (!file?.buffer) {
    throw createError('An image is required in the "image" field.', 400);
  }
  cloudinaryService.validateImageBuffer(file);
  const cleanMetadata = normalizeMetadata(metadata, { requireCreationFields: true });
  const Photo = await getPhotoModel();

  let uploadedAsset;
  try {
    uploadedAsset = await cloudinaryService.uploadImage(file, { folder: 'afrolens/photos' });
    const photo = new Photo({
      ...cleanMetadata,
      photographer: user._id,
      imageUrl: uploadedAsset.secure_url,
      cloudinaryPublicId: uploadedAsset.public_id,
    });
    try {
      await photo.save();
    } catch (cause) {
      throw databaseError(cause, 'Photo could not be saved because the database operation failed.');
    }
    return photo.toObject ? photo.toObject() : photo;
  } catch (error) {
    if (uploadedAsset?.public_id) {
      try {
        await cloudinaryService.deleteImage(uploadedAsset.public_id);
      } catch {
        console.warn('Photo upload compensation failed; original error retained.');
      }
    }
    throw error;
  }
}

export async function listPhotos(rawQuery = {}) {
  const query = requirePlainObject(rawQuery, 'Query');
  const unknown = Object.keys(query).filter((key) => !allowedQueryFields.has(key));
  if (unknown.length > 0) {
    throw createError(`Unsupported query parameters: ${unknown.join(', ')}.`, 400);
  }

  const page = parsePageValue(query.page, 'page', 1);
  const limit = parsePageValue(query.limit, 'limit', 12, 50);
  const search = queryString(query, 'search');
  const category = queryString(query, 'category', 50);
  const country = queryString(query, 'country');
  const tag = queryString(query, 'tag', fieldLimits.tag);

  if (category && !ALLOWED_CATEGORIES.includes(category)) {
    throw createError(`Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}.`, 400);
  }

  const filter = {};
  if (category) filter.category = category;
  if (country) filter.country = new RegExp(`^${escapeRegExp(country)}$`, 'i');
  if (tag) filter.tags = { $in: [new RegExp(`^${escapeRegExp(tag)}$`, 'i')] };
  if (search) {
    const expression = new RegExp(escapeRegExp(search), 'i');
    filter.$or = [
      { title: expression },
      { description: expression },
      { location: expression },
      { tags: { $in: [expression] } },
    ];
  }

  const Photo = await getPhotoModel();
  let photos;
  let total;
  try {
    [photos, total] = await Promise.all([
      Photo.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Photo.countDocuments(filter),
    ]);
  } catch (cause) {
    throw databaseError(cause, 'Photos could not be fetched because the database operation failed.');
  }

  return {
    photos,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getPhotoById(photoId) {
  assertPhotoId(photoId);
  const Photo = await getPhotoModel();
  let photo;
  try {
    photo = await findPhotoById(Photo, photoId);
  } catch (cause) {
    throw databaseError(cause, 'Photo could not be fetched because the database operation failed.');
  }
  if (!photo) {
    throw createError('Photo not found.', 404);
  }
  return photo.toObject ? photo.toObject() : photo;
}

export async function updatePhoto({ photoId, user, updates }) {
  assertAuthenticatedUser(user);
  assertPhotoId(photoId);
  const rawUpdates = requirePlainObject(updates, 'Photo updates');
  if (Object.keys(rawUpdates).length === 0) {
    throw createError('At least one editable photo field is required.', 400);
  }
  const cleanUpdates = normalizeMetadata(rawUpdates);
  const Photo = await getPhotoModel();
  let photo;
  try {
    photo = await Photo.findById(photoId);
  } catch (cause) {
    throw databaseError(cause, 'Photo could not be fetched because the database operation failed.');
  }
  if (!photo) {
    throw createError('Photo not found.', 404);
  }

  const ownerId = userId(photo.photographer);
  if (ownerId !== userId(user)) {
    if (isAdmin(user)) {
      throw createError('Admins cannot edit another user’s photo metadata.', 403);
    }
    throw createError('You do not have permission to update this photo.', 403);
  }

  Object.assign(photo, cleanUpdates);
  try {
    await photo.save();
  } catch (cause) {
    throw databaseError(cause, 'Photo could not be updated because the database operation failed.');
  }
  return photo.toObject ? photo.toObject() : photo;
}

export async function deletePhoto({ photoId, user }) {
  assertAuthenticatedUser(user);
  assertPhotoId(photoId);
  const Photo = await getPhotoModel();
  let photo;
  try {
    photo = await Photo.findById(photoId);
  } catch (cause) {
    throw databaseError(cause, 'Photo could not be fetched because the database operation failed.');
  }
  if (!photo) {
    throw createError('Photo not found.', 404);
  }

  const ownerId = userId(photo.photographer);
  if (ownerId !== userId(user) && !isAdmin(user)) {
    throw createError('You do not have permission to delete this photo.', 403);
  }
  if (!photo.cloudinaryPublicId) {
    throw createError('Photo is missing its Cloudinary public ID; deletion was not started.', 503);
  }

  const cleanupService = await getCleanupService();
  try {
    await cleanupService.cleanupPhotoRelations(String(photo._id));
  } catch (cause) {
    const error = createError('Related comments and likes could not be removed; the photo was not deleted.', 503);
    error.cause = cause;
    throw error;
  }

  await cloudinaryService.deleteImage(photo.cloudinaryPublicId);
  let result;
  try {
    result = await Photo.deleteOne({ _id: photo._id });
  } catch (cause) {
    throw databaseError(cause, 'Photo could not be deleted because the database operation failed.');
  }
  if (result.deletedCount !== 1) {
    throw createError('Photo database deletion was not confirmed after external cleanup.', 503);
  }

  return {
    deletedPhotoId: String(photo._id),
    cloudinaryDeleted: true,
    relatedRecordsCleanup: 'completed',
  };
}
