import mongoose from "mongoose";

const likeSchema = new mongoose.Schema(
  {
    photo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Photo",
      required: [true, "Photo reference is required"],
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User reference is required"],
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

// A user can like a particular photo only once.
likeSchema.index(
  { photo: 1, user: 1 },
  { unique: true }
);

const Like = mongoose.model("Like", likeSchema);

export default Like;