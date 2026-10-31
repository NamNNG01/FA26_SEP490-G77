type ApiErrorBody = {
  message?: string;
  error?: string;
  data?: unknown;
};

type ApiErrorShape = {
  message?: string;
  response?: {
    data?: ApiErrorBody;
  };
};

/** GlobalExceptionHandler's message for @Valid failures; the real reasons are in `data`. */
export const GENERIC_VALIDATION_MESSAGE = 'Validation failed for request parameters';

/**
 * Turns the field errors of a 400 body into one readable line. Handles both shapes the
 * backend sends: `{ field: message }` (@Valid) and `[{ field, message }]` (contest, question).
 * Returns null when `data` holds no field errors.
 */
export function fieldErrorSummary(data: unknown): string | null {
  let pairs: [string, string][] = [];
  if (Array.isArray(data)) {
    pairs = data
      .filter((e): e is { field?: unknown; message: string } =>
        !!e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string')
      .map(e => [typeof e.field === 'string' ? e.field : '', e.message]);
  } else if (data && typeof data === 'object') {
    pairs = Object.entries(data).filter((e): e is [string, string] => typeof e[1] === 'string');
  }
  if (pairs.length === 0) return null;
  // "Email is required" and "endTime is required" read fine alone; "must not be blank" needs its field name.
  return pairs
    .map(([field, message]) => (field && /^[a-z]/.test(message) && !message.startsWith(field) ? `${field} ${message}` : message))
    .join('; ');
}

/** The backend message, with the generic @Valid text replaced by the actual field errors. */
export function serverErrorMessage(body: ApiErrorBody | undefined): string | undefined {
  const message = body?.message;
  if (message === GENERIC_VALIDATION_MESSAGE) return fieldErrorSummary(body?.data) ?? message;
  return message;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const apiError = error as ApiErrorShape;
    const serverMessage = serverErrorMessage(apiError.response?.data) || apiError.response?.data?.error;
    if (typeof serverMessage === 'string' && serverMessage.trim()) {
      return serverMessage;
    }
    if (typeof apiError.message === 'string' && apiError.message.trim()) {
      return apiError.message;
    }
  }
  return fallback;
}
