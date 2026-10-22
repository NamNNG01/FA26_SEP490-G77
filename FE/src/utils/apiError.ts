type ApiErrorShape = {
  message?: string;
  response?: {
    data?: {
      message?: string;
      error?: string;
    };
  };
};

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const apiError = error as ApiErrorShape;
    const serverMessage =
      apiError.response?.data?.message || apiError.response?.data?.error;
    if (typeof serverMessage === 'string' && serverMessage.trim()) {
      return serverMessage;
    }
    if (typeof apiError.message === 'string' && apiError.message.trim()) {
      return apiError.message;
    }
  }
  return fallback;
}
