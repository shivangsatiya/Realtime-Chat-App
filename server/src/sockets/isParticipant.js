// Shared authorization check: is this user actually a participant of this
// conversation? Every socket handler that touches a conversationId must use
// this before acting on it — Socket.IO does not enforce this automatically.
export const isParticipant = (conversation, userId) =>
  !!conversation && conversation.participants.some((p) => String(p) === userId);
