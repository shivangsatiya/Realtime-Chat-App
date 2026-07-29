import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    text: {
      type: String,
      trim: true,
      maxlength: 4000,
      default: "",
    },
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    reactions: [
      {
        emoji: { type: String, required: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      },
    ],
    editedAt: {
      type: Date,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    attachment: {
      url: { type: String, default: null },
      type: { type: String, enum: ["image", "file", null], default: null },
      name: { type: String, default: null },
    },
  },
  { timestamps: true }
);

messageSchema.index({ text: "text" });

// Every message-history and search query filters by `conversation` and
// sorts/cursors on `_id` — this compound index lets MongoDB satisfy both in
// a single index scan instead of filtering conversation then sorting
// separately. Replaces the old single-field index on `conversation` alone.
messageSchema.index({ conversation: 1, _id: -1 });

export default mongoose.model("Message", messageSchema);
