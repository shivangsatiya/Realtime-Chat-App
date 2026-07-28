// Wraps an async route handler so any rejected promise (i.e. a thrown error
// inside an awaited call) is automatically forwarded to Express's error
// middleware via next(err), instead of every route needing its own
// try/catch that duplicates the same "respond with 500" logic.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
