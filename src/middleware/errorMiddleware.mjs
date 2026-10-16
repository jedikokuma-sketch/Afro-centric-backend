import { MAX_PHOTOS_PER_REQUEST } from '../services/cloudinaryService.mjs';

function getStatusCode(error) {
  if (error?.code === 'LIMIT_FILE_SIZE') return 413;
  if (error?.code === 'LIMIT_FILE_COUNT' || error?.code === 'LIMIT_UNEXPECTED_FILE') return 400;
  if (error?.code === 11000) return 409;
  if (Number.isInteger(error?.statusCode)) return error.statusCode;
  if (Number.isInteger(error?.status)) return error.status;
  if (error?.name === 'ValidationError' || error?.name === 'CastError') return 400;
  return 500;
}

function getPublicMessage(error, statusCode) {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return 'Uploaded file exceeds the allowed size.';
  }
  if (error?.code === 'LIMIT_FILE_COUNT' || error?.code === 'LIMIT_UNEXPECTED_FILE') {
    return `Too many files or unexpected file field. Upload no more than ${MAX_PHOTOS_PER_REQUEST} files using the "image" field.`;
  }
  if (statusCode >= 500 && process.env.NODE_ENV === 'production') {
    return 'Internal server error.';
  }
  return typeof error?.message === 'string' && error.message
    ? error.message
    : 'An unexpected error occurred.';
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = getStatusCode(error);
  const message = getPublicMessage(error, statusCode);

  if (statusCode >= 500) {
    console.error(error);
  }

  const errors = Array.isArray(error?.errors)
    ? error.errors
    : error?.name === 'ValidationError' && error.errors
      ? Object.values(error.errors).map((item) => item.message)
      : [message];

  return res.status(statusCode).json({
    success: false,
    message,
    errors: statusCode >= 500 && process.env.NODE_ENV === 'production'
      ? [message]
      : errors,
  });
}
