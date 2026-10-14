function notFoundHandler(req, res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

function getStatusCode(error) {
  if (error && error.code === 'LIMIT_FILE_SIZE') {
    return 413;
  }

  if (error && error.code === 'LIMIT_UNEXPECTED_FILE') {
    return 400;
  }

  if (error && error.code === 11000) {
    return 409;
  }

  if (error && Number.isInteger(error.statusCode)) {
    return error.statusCode;
  }

  if (error && Number.isInteger(error.status)) {
    return error.status;
  }

  if (error && error.name === 'ValidationError') {
    return 400;
  }

  if (error && error.name === 'CastError') {
    return 400;
  }

  return 500;
}

function getErrorMessage(error, statusCode) {
  if (error && error.code === 'LIMIT_FILE_SIZE') {
    return 'Uploaded file exceeds the allowed size.';
  }

  if (error && error.code === 'LIMIT_UNEXPECTED_FILE') {
    return 'Unexpected file field or too many files.';
  }

  if (statusCode >= 500 && process.env.NODE_ENV === 'production') {
    return 'Internal server error.';
  }

  if (error && typeof error.message === 'string' && error.message) {
    return error.message;
  }

  return 'An unexpected error occurred.';
}

function getErrorDetails(error) {
  if (error && Array.isArray(error.errors)) {
    return error.errors;
  }

  if (error && error.name === 'ValidationError' && error.errors) {
    return Object.values(error.errors).map((item) => item.message);
  }

  return [error && error.message ? error.message : 'An unexpected error occurred.'];
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = getStatusCode(error);
  const message = getErrorMessage(error, statusCode);

  if (statusCode >= 500) {
    console.error(error);
  }

  return res.status(statusCode).json({
    success: false,
    message,
    errors: statusCode >= 500 && process.env.NODE_ENV === 'production'
      ? [message]
      : getErrorDetails(error),
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
