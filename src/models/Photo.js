import mongoose from "mongoose";

const photoCategories = [
  "Culture",
  "People",
  "Fashion",
  "Nature",
  "Architecture",
  "Events",
  "Traditional Life",
  "Street Photography",
  "Food",
  "Wildlife",
];

const photoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Photo title is required"],
      trim: true,
      minlength: [2, "Title must be at least 2 characters"],
      maxlength: [120, "Title cannot exceed 120 characters"],
    },

    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },

    imageUrl: {
      type: String,
      required: [true, "Image URL is required"],
      trim: true,
    },

    cloudinaryPublicId: {
      type: String,
      required: [true, "Cloudinary public ID is required"],
      trim: true,
    },

    photographer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Photographer is required"],
    },

    category: {
      type: String,
      required: [true, "Photo category is required"],
      enum: {
        values: photoCategories,
        message: "Invalid photo category",
      },
    },

    country: {
      type: String,
      required: [true, "Country is required"],
      trim: true,
      maxlength: [100, "Country cannot exceed 100 characters"],
    },

    location: {
      type: String,
      default: "",
      trim: true,
      maxlength: [200, "Location cannot exceed 200 characters"],
    },

    tags: {
      type: [
        {
          type: String,
          trim: true,
          lowercase: true,
          maxlength: [30, "Each tag cannot exceed 30 characters"],
        },
      ],
      default: [],
      validate: {
        validator: (tags) =>
          tags.length <= 20 &&
          tags.every((tag) => tag.length > 0),
        message: "Provide up to 20 non-empty tags",
      },
    },
  },
  {
    timestamps: true,
  }
);

// Helpful indexes for common gallery queries.
photoSchema.index({ createdAt: -1 });
photoSchema.index({ category: 1, createdAt: -1 });
photoSchema.index({ country: 1, createdAt: -1 });
photoSchema.index({ photographer: 1, createdAt: -1 });
photoSchema.index({ tags: 1 });

const Photo = mongoose.model("Photo", photoSchema);

export { photoCategories };
export default Photo;
