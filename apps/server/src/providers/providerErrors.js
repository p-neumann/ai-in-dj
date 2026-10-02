// Shared provider-error typing (CLAUDE.md Section 6.3's error contract:
// "Never trust model output" + the documented error code enum). Without
// this, every provider/engine failure collapsed into a generic
// PROVIDER_ERROR regardless of whether it was a 429, a 529, or the model
// returning unparseable text - losing exactly the distinction Section
// 6.3's RATE_LIMITED/PROVIDER_OVERLOADED/MODEL_OUTPUT_INVALID codes exist
// to preserve (a client needs to know "wait and retry" vs "the model's
// output was bad" vs "something else broke").

export class ProviderError extends Error {
  constructor(message, code, { retryAfterMs = null, status = null } = {}) {
    super(message);
    this.code = code;
    this.retryAfterMs = retryAfterMs;
    this.status = status;
  }
}

const HTTP_STATUS_FOR_CODE = {
  RATE_LIMITED: 429,
  PROVIDER_OVERLOADED: 503,
  TIMEOUT: 504,
  MODEL_OUTPUT_INVALID: 502,
  PROVIDER_ERROR: 502
};

// Maps any thrown error to the documented {code, httpStatus, retryAfterMs}
// shape. A plain (non-ProviderError) Error - e.g. a bug, not a provider/
// model failure - still maps to PROVIDER_ERROR/502, matching the
// pre-existing fallback behavior exactly; this only ADDS finer-grained
// codes for errors that are explicitly tagged as such.
export function mapProviderError(err) {
  if (err instanceof ProviderError) {
    return { code: err.code, retryAfterMs: err.retryAfterMs, httpStatus: HTTP_STATUS_FOR_CODE[err.code] || 502 };
  }
  return { code: "PROVIDER_ERROR", retryAfterMs: null, httpStatus: 502 };
}
