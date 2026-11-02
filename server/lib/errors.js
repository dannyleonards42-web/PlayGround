/**
 * Error types shared by the execution bridge, HTTP client and API layer.
 * Public errors are deliberately boring: they never include credentials,
 * request headers, or raw provider payloads.
 */
export class AppError extends Error {
  constructor(code, message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? 500;
    this.recoverable = options.recoverable ?? false;
    this.detail = options.detail ?? null;
  }
}

export class ValidationError extends AppError {
  constructor(message, detail = null) {
    super('VALIDATION_FAILED', message, { status: 400, recoverable: true, detail });
    this.name = 'ValidationError';
  }
}

export class ExecutionError extends AppError {
  constructor(code, message, options = {}) {
    super(code, message, {
      status: options.status ?? 502,
      recoverable: options.recoverable ?? true,
      detail: options.detail ?? null,
      cause: options.cause
    });
    this.name = 'ExecutionError';
  }
}

export function toPublicError(error) {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      recoverable: Boolean(error.recoverable),
      ...(error.detail ? { detail: error.detail } : {})
    };
  }
  return {
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error interrupted the operation.',
    recoverable: true
  };
}

export function statusForError(error) {
  return error instanceof AppError ? error.status : 500;
}
