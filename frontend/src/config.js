// Keep frontend and backend under one browser origin by default.
// Vite dev server proxies /api -> Flask, so users only need one URL.
const ENV_API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = ENV_API_BASE_URL || "/api";
