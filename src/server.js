import "dotenv/config";
import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import photoRoutes from "./routes/photoRoutes.mjs";
import { errorHandler } from "./middleware/errorMiddleware.mjs";
import { notFoundHandler } from "./middleware/notFoundMiddleware.mjs";

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

app.use("/api/auth", authRoutes);
app.use("/api/photos", photoRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

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