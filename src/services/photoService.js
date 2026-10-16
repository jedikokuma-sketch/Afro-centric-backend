import { Types } from 'mongoose';
import cloudinaryService, { MAX_PHOTOS_PER_REQUEST } from './cloudinaryService.js';

export const ALLOWED_CATEGORIES = Object.freeze([
 "culture",
  "fashion",
  "people",
  "places",
  "traditions",
  "nature",
  "architecture",
  "events",
  "daily life",
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

function normalizeCategory(value) {
  const category = normalizeString(value, 'category', {
    required: true,
    maxLength: fieldLimits.category,
  });
  const canonicalCategory = ALLOWED_CATEGORIES.find(
    (allowedCategory) => allowedCategory.toLowerCase() === category.toLowerCase(),
  );
  if (!canonicalCategory) {
    throw createError(`Category must be one of: ${ALLOWED_CATEGORIES.join(', ')}.`, 400);
  }
  return canonicalCategory;
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
    result.category = normalizeCategory(metadata.category);
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

export async function createPhotos({ user, files, metadataList }) {
  assertAuthenticatedUser(user);
  if (!Array.isArray(files) || files.length === 0) {
    throw createError('At least one image is required in the "image" field.', 400);
  }
  if (files.length > MAX_PHOTOS_PER_REQUEST) {
    throw createError(`No more than ${MAX_PHOTOS_PER_REQUEST} images may be uploaded per request.`, 400);
  }
  if (!Array.isArray(metadataList) || metadataList.length !== files.length) {
    throw createError('Provide exactly one metadata object for each image, in upload order.', 400);
  }

  files.forEach((file) => cloudinaryService.validateImageBuffer(file));
  const cleanMetadataList = metadataList.map((metadata) => normalizeMetadata(metadata, {
    requireCreationFields: true,
  }));
  const Photo = await getPhotoModel();
  const categoryPath = Photo.schema?.path('category');
  const schemaCategories = categoryPath?.enumValues;

  if (Array.isArray(schemaCategories) && schemaCategories.length > 0) {
    for (const metadata of cleanMetadataList) {
      const schemaCategory = schemaCategories.find(
        (value) => value.toLowerCase() === metadata.category.toLowerCase(),
      );
      if (!schemaCategory) {
        throw createError(
          `Category "${metadata.category}" is not supported by the current Photo schema.`,
          400,
        );
      }
      metadata.category = schemaCategory;
    }
  }

  const uploadedAssets = [];
  const createdPhotos = [];
  let operation = 'Cloudinary upload';
  try {
    for (let index = 0; index < files.length; index += 1) {
      const uploadedAsset = await cloudinaryService.uploadImage(files[index], {
        folder: 'Afro-centric/photos',
      });
      uploadedAssets.push(uploadedAsset);

      operation = 'MongoDB photo save';
      const photo = new Photo({
        ...cleanMetadataList[index],
        photographer: user._id,
        imageUrl: uploadedAsset.secure_url,
        cloudinaryPublicId: uploadedAsset.public_id,
      });
      await photo.save();
      createdPhotos.push(photo);
      operation = 'Cloudinary upload';
    }
    return createdPhotos.map((photo) => (photo.toObject ? photo.toObject() : photo));
  } catch (error) {
    for (const photo of createdPhotos.reverse()) {
      try {
        const result = await Photo.deleteOne({ _id: photo._id });
        if (result.deletedCount !== 1) {
          console.warn('Photo batch rollback could not confirm removal of a saved database record.');
        }
      } catch (cleanupError) {
        console.warn('Photo batch database rollback failed.', cleanupError.message);
      }
    }
    for (const asset of uploadedAssets.reverse()) {
      try {
        await cloudinaryService.deleteImage(asset.public_id);
      } catch (cleanupError) {
        console.warn('Photo batch Cloudinary rollback failed.', cleanupError.message);
      }
    }

    if (error?.name === 'ValidationError' || error?.name === 'CastError') {
      throw databaseError(error, 'Photo data does not satisfy the shared Photo schema.');
    }
    if (error?.statusCode) {
      throw error;
    }
    console.error('Photo batch operation failed.', {
      operation,
      errorName: error?.name,
      errorCode: error?.code,
      errorMessage: typeof error?.message === 'string'
        ? error.message.replace(/mongodb(?:\+srv)?:\/\/\S+/gi, '[redacted MongoDB URI]').slice(0, 300)
        : undefined,
    });
    throw databaseError(error, 'Photo batch could not be saved because a database operation failed.');
  }
}

export async function createPhoto({ user, file, metadata }) {
  const [photo] = await createPhotos({
    user,
    files: file ? [file] : [],
    metadataList: [metadata],
  });
  return photo;
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
  const rawCategory = queryString(query, 'category', 50);
  const category = rawCategory ? normalizeCategory(rawCategory) : '';
  const country = queryString(query, 'country');
  const tag = queryString(query, 'tag', fieldLimits.tag);

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
