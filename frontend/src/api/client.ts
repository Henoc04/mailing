import axios from "axios";

const TOKEN_KEY = "auth_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export const TOKEN_STORAGE_KEY = TOKEN_KEY;

// NOTE on storage: the JWT is kept in localStorage rather than an httpOnly
// cookie. This is readable by any script on the page (XSS risk), but the
// backend exposes no refresh-cookie/CSRF flow to pair with a cookie-based
// approach, so localStorage is the simplest viable option for this SPA.
export const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

client.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearToken();
      // Outside React Router context at the axios layer, so a hard redirect
      // is used instead of a router navigation.
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);
