// src/config.ts

const DEFAULT_API_URL = "http://localhost:4000/api";

/**
 * Backend API base URL, set at build time with VITE_API_URL (Vercel / Render
 * env var). Accepts a full URL with path ("https://api.example.com/api"), a
 * bare origin or host ("biography-api.onrender.com" — "/api" is appended),
 * or a relative path ("/api" behind a proxy).
 */
const resolveApiUrl = (raw: string | undefined): string => {
  let value = (raw || DEFAULT_API_URL).trim().replace(/\/+$/, "");
  // A bare host (what Render's service references provide) means HTTPS
  if (!/^https?:\/\//i.test(value) && !value.startsWith("/")) {
    value = `https://${value}`;
  }
  if (/^https?:\/\/[^/]+$/i.test(value)) return `${value}/api`;
  return value;
};

export const API_URL = resolveApiUrl(import.meta.env.VITE_API_URL);
