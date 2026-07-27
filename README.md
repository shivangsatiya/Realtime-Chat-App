# Wire — Real-Time Chat Application

A production-style real-time messaging platform: private 1-on-1 chats, group rooms,
persistent message history, live online/offline presence, typing indicators, and
JWT-based auth — built on an event-driven WebSocket architecture.

## Stack

**Backend:** Node.js · Express · Socket.IO · MongoDB (Mongoose) · JWT · bcrypt
**Frontend:** React 18 · Vite · React Router v6 · Bootstrap 5 + Bootstrap Icons ·
Axios · React Context API (Auth + Socket)

## Features

- JWT authentication (register / login), token stored in `localStorage`, attached
  as a `Bearer` header on every request via an Axios interceptor
- Private 1-on-1 conversations and group rooms, backed by a single `Conversation`
  model (`isGroup` flag distinguishes the two)
- Persistent message history in MongoDB, fetched over REST and then kept live
  over a WebSocket
- Real-time delivery via Socket.IO, authenticated with the same JWT issued by
  `/api/auth`
- Online/offline presence tracking (supports multiple tabs/devices per user)
- Typing indicators, debounced on the client
- Basic read receipts ("Seen" tag on your last message in a DM)
- Unread badges on background conversations, cleared on open
- A self-generated notification "blip" (Web Audio API oscillator — no audio
  file to host), with a mute toggle in the sidebar
- Responsive UI: single-pane view with a back button on mobile, two-pane on
  desktop

## Design system

Dark charcoal base (`#0f1216`) rather than navy or pure black — kinder on the
eyes across long chat sessions, and it doesn't fight with avatar or bubble
colors. Two accent colors carry distinct meaning rather than decorating:

- **Amber (`#ffb020`)** — the brand/"signal" color: buttons, your own sent
  bubbles, the active-conversation marker. A nod to "Wire" as in
  telegraph/transmission.
- **Green (`#34d399`)** — reserved *only* for online presence, since
  green-means-online is a convention users already trust. It's never reused
  for anything else in the UI.

Every interactive surface has a matching motion: messages slide in from the
side they were sent from, the new-conversation modal's mode toggle is a
sliding segmented control, the sidebar list staggers in on load, message
history shows shimmering skeleton placeholders while loading, and the auth
screens have a slow-drifting ambient glow behind the card. All animations
respect `prefers-reduced-motion`.

## Project structure

```
realtime-chat-app/
├── server/
│   ├── src/
│   │   ├── config/db.js            # Mongoose connection
│   │   ├── models/                 # User, Conversation, Message
│   │   ├── middleware/auth.js      # JWT-protect REST routes
│   │   ├── routes/                 # auth, users, conversations, messages
│   │   ├── sockets/socketHandler.js# Socket.IO auth + all real-time events
│   │   ├── utils/generateToken.js
│   │   └── index.js                # Express + HTTP + Socket.IO bootstrap
│   └── .env.example
└── client/
    ├── src/
    │   ├── api/axios.js            # Axios instance + auth header injection
    │   ├── context/                # AuthContext, SocketContext
    │   ├── pages/                  # Login, Register, Chat
    │   ├── components/             # Sidebar, ChatWindow, MessageInput, ...
    │   ├── index.css               # dark navy + cyan theme (CSS variables)
    │   └── main.jsx
    └── .env.example
```

## Setup

### 1. Backend

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env`:

```
PORT=5000
MONGO_URI=<your MongoDB Atlas connection string>
JWT_SECRET=<a long random string>
CLIENT_URL=http://localhost:5173
```

Run it:

```bash
npm run dev      # nodemon, auto-restarts on changes
# or
npm start
```

You should see `MongoDB connected: ...` and `Server running on port 5000`.

### 2. Frontend

```bash
cd client
npm install
cp .env.example .env
```

`client/.env` just needs:

```
VITE_API_URL=http://localhost:5000
```

Run it:

```bash
npm run dev
```

Open `http://localhost:5173`. Register two different accounts (e.g. in a
normal window and an incognito window) to test real-time messaging, presence,
and typing indicators between them.

## Architecture notes

- **Auth flow:** REST issues a JWT on register/login. The same token is sent
  as `socket.handshake.auth.token` when the client opens its WebSocket
  connection; a Socket.IO middleware (`io.use(...)`) verifies it before any
  event handlers run, so every socket on the server is already tied to a
  known `User` document.
- **Presence:** the server keeps an in-memory `Map<userId, Set<socketId>>`.
  A user only flips to "offline" once their *last* open socket disconnects,
  so having the app open in two tabs doesn't cause flickering presence.
- **Rooms:** every conversation ID doubles as a Socket.IO room name. On
  connect, a user's socket auto-joins every conversation they're already a
  participant of; newly created conversations are joined explicitly via a
  `conversation:join` event right after the REST call that creates them.
- **Messages:** sent purely over the socket (`message:send`), persisted to
  MongoDB, then broadcast to the whole room (including the sender) with
  `message:new` — so there's a single code path for "my message appeared"
  and no optimistic-UI/duplicate-message bookkeeping needed.

## Possible extensions

- Message editing/deletion
- File and image attachments
- Per-message read receipts in group rooms (not just DMs)
- Push notifications when the tab isn't focused
- Pagination for very long message histories (currently loads full history
  per conversation)
