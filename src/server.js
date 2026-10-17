import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import photoRoutes from "./routes/photoRoutes.js";

import notFoundMiddleware from "./middleware/notFoundMiddleware.js";
import errorMiddleware from "./middleware/errorMiddleware.js";


dotenv.config();

const app = express();

// Global middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to Afro-centric API",
  });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/photos", photoRoutes);

// Handle unknown routes (must come after API routes)
app.use(notFoundMiddleware);

// Handle errors (must come after all routes and the 404 middleware)
app.use(errorMiddleware);

// Start server after connecting to MongoDB
const startServer = async () => {
  try {
    await connectDB();

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`Afro-centric server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start Afro-centric server:", error.message);
    process.exit(1);
  }
};

startServer();