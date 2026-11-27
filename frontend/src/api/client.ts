import axios, { AxiosError } from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ message?: string }>) => {
    // Preserve the original response so callers can inspect API error details.
    const message =
      error.response?.data?.message || error.message || 'An unexpected error occurred';
    const enhancedError = new Error(message) as Error & { response: typeof error.response };
    enhancedError.response = error.response;
    return Promise.reject(enhancedError);
  }
);
