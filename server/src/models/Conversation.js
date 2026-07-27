import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    isGroup: {
      type: Boolean,
      default: false,
    },
    name: {
      // required only for group rooms
      type: String,
      trim: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    admin: {
      // only relevant for group rooms
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
  },
  { timestamps: true }
);

// Prevent duplicate 1-on-1 conversations between the same two users
conversationSchema.index(
  { participants: 1 },
  { partialFilterExpression: { isGroup: false } }
);

export default mongoose.model("Conversation", conversationSchema);
