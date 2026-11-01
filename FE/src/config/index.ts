export const config = {
  apiBaseUrl: import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1',
  appName: 'PrepExam',
  /** OAuth Web client ID for AUTH-09; must equal the backend's GOOGLE_CLIENT_ID. Blank hides Google Sign-In. */
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
};
