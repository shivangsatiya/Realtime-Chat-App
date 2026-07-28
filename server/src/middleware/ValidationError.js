// A validation failure is a normal, expected outcome (bad input) rather than
// an unexpected server fault — but we still route it through next(err) and
// the shared central handler so there's exactly one place that shapes every
// error response, instead of validation building its own separate response
// format. The .statusCode is what index.js's error handler reads to decide
// the status/message instead of defaulting to 500.
export class ValidationError extends Error {
  constructor(details) {
    super("Invalid request");
    this.statusCode = 400;
    this.details = details;
  }
}
