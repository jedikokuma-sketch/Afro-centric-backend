const errorMiddleware = (err, req, res, next) => {
  const statusCode =
    Number.isInteger(err.statusCode) &&
    err.statusCode >= 400 &&
    err.statusCode <= 599
      ? err.statusCode
      : 500;

  const message =
    statusCode === 500
      ? "Internal server error"
      : err.message || "Something went wrong";

  if (statusCode === 500) {
    console.error("Server error:", err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors: [],
  });
};

export default errorMiddleware;