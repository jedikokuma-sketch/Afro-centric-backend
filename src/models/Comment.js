import mongoose from "mongoose";

const commentSchema = new mongoose.Schema(
  {
    photo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Photo",
      required: [true, "Photo reference is required"],
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Comment author is required"],
      index: true,
    },

    text: {
      type: String,
      required: [true, "Comment text is required"],
      trim: true,
      minlength: [1, "Comment cannot be empty"],
      maxlength: [1000, "Comment cannot exceed 1000 characters"],
    },
  },
  {
    timestamps: true,
  }
);

// Supports fetching a photo's comments newest-first.
commentSchema.index({ photo: 1, createdAt: -1 });

const Comment = mongoose.model("Comment", commentSchema);

export default Comment;