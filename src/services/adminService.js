import mongoose from 'mongoose';
import User from '../models/User.js';
import { deletePhoto } from './photoService.js';
import { deleteComment } from './commentService.js';

function createError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateObjectId(id, label = 'User ID') {
  if (
    typeof id !== 'string' ||
    !mongoose.Types.ObjectId.isValid(id)
  ) {
    throw createError(`${label} is invalid.`, 400);
  }
}

function parsePositiveInteger(value, field, fallback, maximum) {
  if (value === undefined || value === '') {
    return fallback;
  }

  if (
    typeof value !== 'string' ||
    !/^[1-9]\d*$/.test(value)
  ) {
    throw createError(`${field} must be a positive integer.`, 400);
  }

  const number = Number(value);

  if (!Number.isSafeInteger(number) || number > maximum) {
    throw createError(
      `${field} must be between 1 and ${maximum}.`,
      400,
    );
  }

  return number;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const safeUserFields =
  '_id name email profilePicture bio role accountStatus createdAt updatedAt';

export async function listUsers(query = {}) {
  const allowedQueryFields = ['page', 'limit', 'search', 'status'];
  const unsupported = Object.keys(query).filter(
    (field) => !allowedQueryFields.includes(field),
  );

  if (unsupported.length) {
    throw createError(
      `Unsupported query parameters: ${unsupported.join(', ')}.`,
      400,
    );
  }

  const page = parsePositiveInteger(query.page, 'page', 1, 1000000);
  const limit = parsePositiveInteger(query.limit, 'limit', 10, 100);

  let search = '';

  if (query.search !== undefined) {
    if (typeof query.search !== 'string') {
      throw createError('Search must be a string.', 400);
    }

    search = query.search.trim();

    if (search.length > 100) {
      throw createError('Search cannot exceed 100 characters.', 400);
    }
  }

  const filter = {};

  if (query.status !== undefined && query.status !== '') {
    if (!['active', 'suspended'].includes(query.status)) {
      throw createError(
        'Status must be either active or suspended.',
        400,
      );
    }

    filter.accountStatus = query.status;
  }

  if (search) {
    const expression = new RegExp(escapeRegExp(search), 'i');

    filter.$or = [
      { name: expression },
      { email: expression },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select(safeUserFields)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return {
    users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

async function findTargetUser(userId) {
  validateObjectId(userId);

  const user = await User.findById(userId);

  if (!user) {
    throw createError('User not found.', 404);
  }

  return user;
}

async function ensureAnotherActiveAdminRemains(targetUser, change) {
  const isActiveAdmin =
    targetUser.role === 'admin' &&
    targetUser.accountStatus === 'active';

  if (!isActiveAdmin) {
    return;
  }

  const wouldRemoveActiveAdmin =
    (change.role !== undefined && change.role !== 'admin') ||
    (change.accountStatus !== undefined &&
      change.accountStatus !== 'active');

  if (!wouldRemoveActiveAdmin) {
    return;
  }

  const activeAdminCount = await User.countDocuments({
    role: 'admin',
    accountStatus: 'active',
  });

  if (activeAdminCount <= 1) {
    throw createError(
      'This action is not allowed because the system must retain at least one active admin.',
      409,
    );
  }
}

export async function updateUserAccountStatus(userId, accountStatus) {
  if (!['active', 'suspended'].includes(accountStatus)) {
    throw createError(
      'accountStatus must be either active or suspended.',
      400,
    );
  }

  const user = await findTargetUser(userId);

  await ensureAnotherActiveAdminRemains(user, { accountStatus });

  user.accountStatus = accountStatus;
  await user.save();

  return User.findById(user._id)
    .select(safeUserFields)
    .lean();
}

export async function updateUserRole(userId, role) {
  if (!['user', 'admin'].includes(role)) {
    throw createError('role must be either user or admin.', 400);
  }

  const user = await findTargetUser(userId);

  await ensureAnotherActiveAdminRemains(user, { role });

  user.role = role;
  await user.save();

  return User.findById(user._id)
    .select(safeUserFields)
    .lean();
}

export async function deleteAnyPhoto(photoId, adminUser) {
  return deletePhoto({
    photoId,
    user: adminUser,
  });
}

export async function deleteAnyComment(commentId, adminUser) {
  validateObjectId(commentId, 'Comment ID');

  return deleteComment({
    commentId,
    user: adminUser,
  });
}
