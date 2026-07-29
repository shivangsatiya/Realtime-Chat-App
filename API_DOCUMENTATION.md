# Wire — API Documentation

All REST endpoints are prefixed with the backend's base URL (e.g.
`https://your-backend.onrender.com/api`). All Socket.IO events connect at
the backend's root URL.

## Authentication

Every protected REST route requires:
```
Authorization: Bearer <jwt>
```

Every Socket.IO connection requires the same JWT passed at handshake time:
```js
io(API_URL, { auth: { token: jwt } })
```
A missing or invalid token rejects the connection entirely (`connect_error`)
— no socket event handlers are reachable without it.

## Error response shape

Every error response, from every route, follows one shape:
```json
{ "message": "Human-readable summary" }
```
Validation errors additionally include field-level detail:
```json
{
  "message": "Invalid request",
  "details": [{ "field": "email", "message": "Enter a valid email address" }]
}
```
Unexpected server errors always return exactly `{"message": "Internal server error"}` — no stack traces, no internal error text, ever.

---

# REST Endpoints

## Auth

### `POST /api/auth/register`
Create a new account.

- **Auth:** None
- **Rate limit:** 10 requests / 15 min per IP
- **Body:**
  ```json
  { "username": "shivang", "email": "shivang@example.com", "password": "abcdef" }
  ```
- **Validation:** `username` 3–24 chars · `email` valid format (normalized to lowercase, trimmed) · `password` ≥6 chars
- **Success — `201`:**
  ```json
  {
    "token": "<jwt>",
    "user": { "id": "...", "username": "shivang", "email": "shivang@example.com", "avatarColor": "#22D3EE", "isOnline": false, "lastSeen": "..." }
  }
  ```
- **Errors:** `400` invalid input · `409` username/email already in use · `429` rate limited

### `POST /api/auth/login`
- **Auth:** None
- **Rate limit:** 10 requests / 15 min per IP
- **Body:** `{ "email": "...", "password": "..." }`
- **Validation:** both required; email normalized to lowercase before lookup
- **Success — `200`:** same shape as register's response
- **Errors:** `400` missing fields · `401` invalid credentials · `429` rate limited

### `GET /api/auth/me`
Returns the current authenticated user (used to restore a session on page load).
- **Auth:** Required
- **Success — `200`:** `{ "user": { ... } }`
- **Errors:** `401` missing/invalid token

---

## Users

### `GET /api/users?search=`
Search for other users to start a conversation with (excludes yourself).
- **Auth:** Required
- **Query:** `search` (optional, string, trimmed, max 100 chars) — matches username or email, case-insensitive
- **Success — `200`:** `{ "users": [ { "id", "username", "email", "avatarColor", "isOnline", "lastSeen" }, ... ] }` (max 50)

---

## Conversations

### `GET /api/conversations?cursor=&cursorId=&limit=`
Cursor-paginated list of the current user's conversations, most-recent-activity-first.
- **Auth:** Required
- **Query:**
  - `cursor` (optional, ISO datetime) — the `updatedAt` of the last conversation already loaded
  - `cursorId` (optional, ObjectId) — that conversation's `_id`, used as a tiebreaker
  - `limit` (optional, 1–50, default 20)
- **Success — `200`:**
  ```json
  {
    "conversations": [ { "_id", "isGroup", "name", "participants": [...], "lastMessage": {...}, "updatedAt" }, ... ],
    "nextCursor": { "cursor": "2026-07-29T12:00:00.000Z", "cursorId": "..." } // or null if no more pages
  }
  ```
- **Pagination pattern:** omit `cursor`/`cursorId` for the first page; pass back the previous response's `nextCursor` fields to fetch the next page. `nextCursor: null` means you've reached the end.

### `POST /api/conversations/private`
Finds or creates a 1-on-1 conversation with another user (idempotent — calling this twice with the same `userId` returns the same conversation).
- **Auth:** Required
- **Body:** `{ "userId": "<ObjectId>" }`
- **Validation:** `userId` must be a valid ObjectId shape
- **Success — `200`:** `{ "conversation": { ... } }`
- **Errors:** `400` invalid userId

### `POST /api/conversations/group`
- **Auth:** Required
- **Body:** `{ "name": "Team", "participantIds": ["<ObjectId>", "<ObjectId>", ...] }`
- **Validation:** `name` 1–80 chars · `participantIds` array of valid ObjectIds, ≥2 entries (the creator is added automatically as a third+)
- **Success — `201`:** `{ "conversation": { ... } }`
- **Errors:** `400` invalid input

---

## Messages

### `GET /api/messages/:conversationId?cursor=&limit=`
Cursor-paginated message history for a conversation, returned in chronological order (oldest-to-newest within the page) ready to render directly.
- **Auth:** Required (must be a participant of the conversation)
- **Params:** `conversationId` (ObjectId)
- **Query:**
  - `cursor` (optional, ObjectId) — the `_id` of the oldest message already loaded; fetches the page *before* it
  - `limit` (optional, 1–100, default 30)
- **Success — `200`:**
  ```json
  {
    "messages": [ { "_id", "conversation", "sender", "text", "replyTo", "reactions", "attachment", "editedAt", "isDeleted", "createdAt" }, ... ],
    "nextCursor": "<oldest message's _id in this page>" // or null
  }
  ```
- **Errors:** `400` malformed conversationId/cursor · `403` not a participant

### `GET /api/messages/:conversationId/search?q=&cursor=&limit=`
Full-text search within one conversation's messages (MongoDB text index — matches whole words, not substrings).
- **Auth:** Required (must be a participant)
- **Query:** `q` (required, 1–200 chars) · `cursor` (optional, ObjectId) · `limit` (optional, 1–50, default 30)
- **Success — `200`:** same `{ messages, nextCursor }` shape as message history, sorted newest-first, excludes deleted messages
- **Errors:** `400` missing/invalid `q` or malformed cursor · `403` not a participant

---

## Uploads

### `POST /api/uploads`
Uploads a file to Cloudinary; returns a URL to attach to a message via the `message:send` socket event (this endpoint does not itself send a message).
- **Auth:** Required
- **Body:** `multipart/form-data`, field name `file`
- **Limits:** 10MB max file size
- **Success — `201`:** `{ "url": "https://res.cloudinary.com/...", "type": "image" | "file", "name": "original-filename.png" }`
- **Errors:** `400` no file provided, or file too large

---

## Health

### `GET /api/health`
- **Auth:** None
- **Success — `200`:** `{ "status": "ok", "database": "connected", "timestamp": "..." }`
- **Degraded — `503`:** `{ "status": "degraded", "database": "disconnected", "timestamp": "..." }` — reflects the actual `mongoose.connection.readyState`, not just "the process is running"

---

# Socket.IO Events

## Client → Server

### `conversation:join`
Joins the socket to a specific conversation's room — used right after creating a new conversation (existing conversations are auto-joined on connect).
- **Payload:** `conversationId` (string)
- **Ack/Response:** none
- **Authorization:** silently ignored if the connecting user isn't a participant

### `message:send`
- **Payload:** `{ conversationId, text?, replyTo?, attachment? }` — at least one of `text` or `attachment.url` is required
  - `replyTo` (optional): the `_id` of the message being replied to
  - `attachment` (optional): `{ url, type: "image"|"file", name }` — from a prior `POST /api/uploads` call
- **Ack:** `{ message: {...} }` on success, `{ error: "..." }` on failure
- **Broadcast:** `message:new` to everyone in the conversation's room (including the sender)
- **Authorization:** rejects with an error ack if the sender isn't a participant, or if `replyTo` references a message from a different conversation

### `message:react`
Toggles a reaction — reacting twice with the same emoji removes it.
- **Payload:** `{ conversationId, messageId, emoji }` (emoji ≤8 chars)
- **Ack:** `{ reactions: [...] }` or `{ error: "..." }`
- **Broadcast:** `message:reaction-update` to the conversation's room
- **Authorization:** requires participant membership; `messageId` must belong to `conversationId`

### `message:edit`
Sender-only.
- **Payload:** `{ conversationId, messageId, text }`
- **Ack:** `{ message: {...} }` or `{ error: "..." }`
- **Broadcast:** `message:edited` to the conversation's room
- **Errors:** rejects if not the sender, if the message was already deleted, or if `text` is empty

### `message:delete`
Sender-only, soft-delete (message stays in the database with `isDeleted: true` and blanked `text`).
- **Payload:** `{ conversationId, messageId }`
- **Ack:** `{ success: true }` or `{ error: "..." }`
- **Broadcast:** `message:deleted` to the conversation's room

### `typing:start` / `typing:stop`
- **Payload:** `{ conversationId }`
- **Ack:** none
- **Broadcast:** `typing:update` to everyone else in the room
- **Authorization:** silently ignored if not a participant
- **Note:** the server tracks active typing sessions per socket and automatically emits a `typing:update(isTyping: false)` on disconnect if the socket was mid-typing when it dropped

### `message:read`
Marks all unread messages in a conversation as read by the current user.
- **Payload:** `{ conversationId }`
- **Ack:** none
- **Broadcast:** `message:read-update` to everyone else in the room

## Server → Client

### `presence:update`
Broadcast globally (to every connected socket, not room-scoped) whenever any user's online status changes.
- **Payload:** `{ userId, isOnline, lastSeen? }`

### `message:new`
- **Payload:** the full populated message object (same shape as in `GET /api/messages/:conversationId`)

### `message:reaction-update`
- **Payload:** `{ messageId, reactions: [{ emoji, user: { _id, username } }, ...] }`

### `message:edited`
- **Payload:** `{ messageId, text, editedAt }`

### `message:deleted`
- **Payload:** `{ messageId }`

### `typing:update`
- **Payload:** `{ conversationId, userId, username, isTyping }`

### `message:read-update`
- **Payload:** `{ conversationId, userId }` — "this user has read up to now" (the client's UI currently shows this as a "Seen" tag on the sender's most recent message in a DM)
