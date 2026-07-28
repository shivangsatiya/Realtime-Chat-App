import { ValidationError } from "./ValidationError.js";

// validate(schema) checks req.body (or req.params / req.query if a second
// argument is given) against a Zod schema. On success, the parsed/coerced
// value replaces the original (e.g. a trimmed, lowercased email) and the
// route handler runs exactly as before. On failure, it hands a
// ValidationError to next() instead of the route ever running.
const validate = (schema, source = "body") => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    return next(new ValidationError(details));
  }

  req[source] = result.data;
  next();
};

export default validate;
