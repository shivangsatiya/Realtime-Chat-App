# Wire — Interview Guide

This document turns the engineering work behind this project into talking
points you can actually use in an interview — not a feature list, but the
reasoning and the stories behind it.

---

## Architecture, end to end

A React SPA talks to an Express + Socket.IO backend over two channels: REST
for anything request/response shaped (auth, history, search, uploads), and
WebSockets for anything that needs to be live (sending a message, presence,
typing, reactions). Both channels share **one JWT** — issued once at
login, verified via an Express middleware for REST and via a Socket.IO
`io.use()` middleware for the socket handshake. That's a deliberate choice:
one identity system, not two, even though the transport differs.

MongoDB holds three collections — `User`, `Conversation`, `Message` — with
`Conversation.isGroup` as a boolean discriminator rather than separate
collections for DMs and group rooms, since the access pattern (list of
participants, list of messages) is identical either way.

---

## Why these specific technology choices

**Why MongoDB, not a relational database?**
A conversation and its messages are naturally hierarchical, one-to-many,
always queried together — "give me this conversation's messages" is the
core query shape of the whole app. That maps directly onto a document
model without needing joins. A relational schema would work too (and would
be the better call if this needed complex cross-entity reporting or strict
transactional guarantees across many tables) — but for a chat app's actual
access patterns, the document model is a better fit for the problem, not
just a default choice.

**Why Socket.IO, not raw WebSockets?**
Three concrete things raw WebSockets don't give you for free: automatic
reconnection with backoff, a room abstraction (used directly here — every
conversation ID doubles as a room name, so broadcasting to "everyone in
this conversation" is one line, not manual connection tracking), and
transport fallback for networks that block raw WebSocket upgrades. The
trade-off is a slightly heavier client library and Socket.IO-specific
protocol framing — worth it here since the room abstraction alone maps so
directly onto the domain model.

**Why JWT, not sessions?**
Stateless auth that works identically across two different transport
mechanisms (REST headers, socket handshake auth) without needing a shared
session store. The trade-off, and it's a real one: a JWT can't be revoked
server-side before it expires. That's a legitimate, named limitation of
this design — see "Trade-offs made" below, not something glossed over.

**Why Cloudinary for uploads, not S3 or local storage?**
Local disk storage was ruled out specifically because Render's free tier
filesystem is ephemeral — anything written to disk vanishes on every
redeploy. Cloudinary's free tier is generous and the SDK does the
image/file distinction and transformation handling that would otherwise be
manual work. S3 (or S3-compatible options like Cloudflare R2) would be the
more "industry standard" choice and a reasonable alternative — Cloudinary
won here on setup speed for a project at this stage, not because S3 is
worse.

---

## Security improvements — the real story

The most interesting security story in this project isn't "I avoided a
bug" — it's **finding the same bug twice**, in two different forms, and
recognizing the pattern both times.

### STAR: The socket authorization gap

**Situation:** During a planned architecture review (not a bug report — a
deliberate audit), I noticed `message:send` correctly checked that the
sender was a participant of the conversation before acting. `conversation:
join` and `message:read` did not.

**Task:** Determine whether this was actually exploitable, and fix it
without introducing a new authorization pattern.

**Action:** Confirmed the exploit: Socket.IO rooms are just strings, and
`socket.join(conversationId)` doesn't check the ID belongs to a real
conversation the caller has access to — meaning a user could join *any*
conversation's room just by guessing/observing its ID, and from there
silently receive every future live message. I extracted the exact
participant-check logic already proven correct in `message:send` into a
shared `isParticipant(conversation, userId)` helper, and applied it to
both vulnerable handlers.

**Result:** Gap closed, using the app's own existing correct logic rather
than inventing something new — the minimal, most defensible fix.

### STAR: Finding my own fix's blind spot, later

**Situation:** Weeks later, during a full "would this pass review at a
company like Stripe" audit, I re-read every socket handler fresh rather
than trusting my memory of what I'd already fixed.

**Task:** Actually verify the fix held up as the codebase grew — reactions,
edit, delete, and typing indicators had all been added *after* the
original fix.

**Action:** Found that `typing:start`/`typing:stop` — added after the
Milestone 1 fix — had the exact same missing check. Separately, found that
four *newer* handlers (`message:send`, `react`, `edit`, `delete`) were
leaking raw internal error text (`err.message`) straight back to the
client in their catch blocks — the same class of problem the centralized
REST error handler had already solved, just never extended to sockets.

**Result:** Fixed both, and — more importantly — this is a genuinely good
interview story: not "I never had a bug," and not "I found one bug once,"
but "I built a fix, then later caught myself *not* propagating that fix to
new code, and closed the loop." That's a realistic, honest account of how
security actually degrades in a growing codebase, and how catching it
requires deliberate re-review, not just remembering to be careful once.

### STAR: Discovering (and fixing) a login bug as a side effect

**Situation:** While adding Zod validation to the auth routes for
Milestone 1's request-validation item, I normalized the email field with
`.trim().toLowerCase()` in the schema — a small, unremarkable-looking
change.

**Task:** Verify this didn't change behavior for valid requests, since
that was an explicit constraint on the milestone.

**Action:** Traced through the login flow and realized this actually
*fixed* a real, previously-unnoticed bug: the User schema already
lowercased email on save, but the login route's `User.findOne({ email })`
never normalized the *incoming* login email before querying — so a user
who registered as `foo@bar.com` and later typed `Foo@Bar.com` at login
would silently fail to match, since Mongo string comparison is
case-sensitive.

**Result:** Flagged this explicitly to the person I was working with
rather than letting a scope-expanding side effect pass silently — "this
technically changes behavior, here's why it's a fix not a regression."

---

## The centralized error handling story

Before Milestone 1, `index.js` had a correctly-written Express error
handler that was **never invoked** — every route caught its own errors
internally and responded directly, so nothing ever called `next(err)`.
This is a good interview example of *why code review of your own
architecture matters*, not just line-level review: the handler wasn't
buggy, it was just disconnected from the rest of the app. The fix
(`asyncHandler` wrapping every route, `ValidationError` giving Zod
failures a `.statusCode` the same handler understands) turned two parallel,
inconsistent error paths into one.

---

## Rate limiting

`express-rate-limit` on `/register` and `/login` specifically — not
applied globally. The reasoning: rate limiting is a targeted mitigation
for a specific threat (credential stuffing, brute force, registration
spam) concentrated on exactly two routes, not a blanket policy every
endpoint needs identically.

---

## Validation strategy

Every REST route validates input via Zod at the route boundary, before any
database call — `validate(schema, source)` is a small middleware factory
reused across every route, parsing `req.body`/`params`/`query` and either
replacing it with the parsed/coerced value or calling `next()` with a
`ValidationError`. The deliberate trade-off: socket events still use
lighter, hand-written validation (`if (!emoji || emoji.length > 8)`)
rather than Zod schemas — named explicitly as a known inconsistency in the
production readiness review, not fixed, because the actual risk it poses
is low and fixing it wasn't judged worth displacing higher-value work at
the time.

---

## Pagination design

**The problem:** message history, the conversation list, and search
results all originally loaded everything, unbounded, on every request.

**The design:** cursor-based, not offset-based, everywhere. Offset
pagination (`?page=3`) breaks under concurrent writes — if new messages
arrive while you're paginating backward through history, an offset shifts
under you and you can skip or duplicate rows. A cursor ("give me
everything before this specific `_id`") doesn't have that problem, because
it's anchored to a real, stable document rather than a position that can
move.

**Message history specifically:** cursors on `_id`, not `createdAt`. Mongo
ObjectIds are roughly time-ordered by construction, so sorting/cursoring
on `_id` gives the same effective ordering as `createdAt` while needing
only one index instead of a compound one — and it sidesteps timestamp
collision entirely (two messages created in the same millisecond still
have distinct, orderable `_id`s).

**Conversation list specifically:** cursors on `(updatedAt, _id)` as a
compound pair, not `updatedAt` alone — because conversations are sorted by
*last activity*, not creation order, and two conversations can plausibly
share the same `updatedAt` millisecond. The `_id` tiebreaker makes the
cursor unambiguous even in that collision case.

**Indexes:** added `{conversation:1, _id:-1}` on `Message` and
`{participants:1, updatedAt:-1, _id:-1}` on `Conversation` — each matching
its query's filter+sort shape exactly, so MongoDB can satisfy the whole
query from one index scan instead of filtering then sorting separately.

**Frontend:** infinite scroll in both directions — scrolling *up* loads
older messages (with explicit scroll-position preservation, since naively
prepending older messages above the current viewport would otherwise yank
the screen down); scrolling *down* in search results loads more matches,
no position-preservation needed since results only grow downward.

---

## Scalability considerations (named, not all solved)

- **Presence** lives in a process-local `Map<userId, Set<socketId>>` —
  correct and simple, but breaks the moment there's more than one server
  instance, since instance A has no way to know about instance B's
  connected sockets. The documented fix is `@socket.io/redis-adapter` plus
  moving presence state into Redis — deliberately not done yet, because it
  only matters once horizontal scaling is actually needed, and doing it
  early would be solving a problem the app doesn't have.
- **`io.emit("presence:update", ...)`** broadcasts to every connected
  socket globally, not just people who share a conversation with that
  user — an O(n) cost that's fine at this scale and a named, not silent,
  scaling limitation.
- **Read receipts** use `$addToSet` to only touch changed rows, but still
  scan the conversation's unread tail on every read rather than tracking a
  "last read pointer" — a smaller, cheaper optimization than pagination
  that was judged lower priority.

---

## Deployment architecture

Two independently deployed Render services (a Web Service for the
Socket.IO-capable backend, a Static Site for the built React bundle) plus
MongoDB Atlas, connected over the public internet — Render's free tier
doesn't provide a static outbound IP, so Atlas's network access is opened
to all IPs, with the actual security boundary being the database
credentials, not network-level IP restriction.

Two non-obvious details that caused real debugging sessions during this
project, worth being able to explain:
- `VITE_API_URL` is a **build-time** constant in Vite — baked into the
  static JS bundle when `vite build` runs, not read at runtime. Changing
  it in Render's dashboard does nothing until a fresh build actually runs.
- CORS is locked to the backend's `CLIENT_URL` env var matching the
  frontend's *exact* deployed origin. A mismatch here (including Render
  assigning a random suffix to a service name that was already taken) was
  the single most common real deployment failure encountered while
  building this.

---

## Docker setup

Multi-stage build for the frontend (`node:20-alpine` to build, `nginx:
alpine` to serve — the final image never contains Node or the source
files, just the static output and nginx), single-stage for the backend
(`npm ci --omit=dev` keeps dev/test tooling out of the production image).
`docker-compose.yml` orchestrates the whole stack locally (Mongo + backend
+ frontend) using the *same* production Dockerfiles rather than a separate
hot-reload dev configuration — a deliberate simplicity trade-off: `npm run
dev` is still faster for actual day-to-day development, Docker Compose
here is for onboarding and testing the real production images locally,
not for daily iteration.

---

## CI/CD pipeline

GitHub Actions, two independent jobs (backend test, frontend build) rather
than one combined job — so a frontend build failure doesn't obscure
whether the backend's tests passed, and vice versa. `npm ci` (not `npm
install`) in CI specifically, for the reproducibility guarantee: `npm ci`
fails loudly on any package.json/package-lock.json mismatch instead of
silently patching around it, which is exactly the failure mode you want
caught in CI rather than discovered in production.

---

## Trade-offs made (say these out loud, don't wait to be asked)

- JWTs can't be revoked before expiry — accepted for the simplicity of
  stateless auth across two transports; the mitigation is a relatively
  short expiry window, not a token blacklist.
- Presence and rate-limiting state are both in-memory, not distributed —
  correct at current scale, a known and documented limitation beyond it.
- No TypeScript — a real gap at a larger company's bar, deliberately not
  undertaken given the size/risk of migrating an existing codebase versus
  the actual value at this project's current scale.
- Socket event payloads use lighter validation than REST — consistency
  was sacrificed for not displacing higher-value work.

---

## Future scalability roadmap

In priority order, if this needed to actually scale:
1. Redis + Socket.IO adapter for presence — the literal blocker to running
   more than one server instance correctly.
2. A "last read pointer" per user per conversation, to bound read-receipt
   writes instead of scanning the unread tail.
3. Optimistic UI for sent messages — currently waits for the round trip;
   not a scale issue, but the most noticeable latency-perception gap.
4. Scoping `presence:update` broadcasts to actual conversation partners
   instead of every connected socket.
