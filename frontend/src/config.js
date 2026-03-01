const API_HOST = window.location.hostname || "localhost";

// Allow explicit override from Vite env when needed (staging/prod/custom ports)
const ENV_API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

// Match the page protocol by default to avoid mixed-content/network errors.
const protocol = window.location.protocol === "https:" ? "https:" : "http:";

export const API_BASE_URL = ENV_API_BASE_URL?.trim() || `${protocol}//${API_HOST}:5000/api`;
