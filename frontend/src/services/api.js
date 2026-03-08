import { API_BASE_URL } from "../config";

async function request(path, options = {}, token = null) {
  const isFormDataBody = options.body instanceof FormData;
  const headers = {
    ...(isFormDataBody ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  console.log(`[API] ${options.method || "GET"} ${path}`);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (error) {
    console.error("[API] Network error", error);
    throw new Error("Unable to connect to server. Please check backend and try again.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    console.error("[API] Request failed", data);
    throw new Error(data?.message || "Request failed");
  }

  return data || {};
}

export const api = {
  login: (username, password) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  getMe: (token) => request("/auth/me", {}, token),
  logout: (token) => request("/auth/logout", { method: "POST" }, token),
  uploadProfilePicture: (token, file) => {
    const formData = new FormData();
    formData.append("profile_picture", file);

    return request(
      "/auth/profile-picture",
      {
        method: "POST",
        body: formData,
      },
      token
    );
  },

  listUsers: (token) => request("/admin/users", {}, token),
  createUser: (token, payload) =>
    request(
      "/admin/users",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      token
    ),
  updateUser: (token, userId, payload) =>
    request(
      `/admin/users/${userId}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
      token
    ),
  deleteUser: (token, userId) =>
    request(
      `/admin/users/${userId}`,
      {
        method: "DELETE",
      },
      token
    ),

  listInvestments: (token) => request("/investments", {}, token),
  createInvestment: (token, payload) =>
    request(
      "/investments",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      token
    ),
  updateInvestment: (token, investmentId, payload) =>
    request(
      `/investments/${investmentId}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
      token
    ),
  deleteInvestment: (token, investmentId) =>
    request(
      `/investments/${investmentId}`,
      {
        method: "DELETE",
      },
      token
    ),
  getNetWorthHistory: (token) => request("/investments/net-worth-history", {}, token),
  getCombinedInvestmentSummary: (token) => request("/investments/combined-summary", {}, token),
  getCombinedNetWorthHistory: (token) =>
    request("/investments/combined-net-worth-history", {}, token),
  getCombinedAssetTimeline: (token) =>
    request("/investments/combined-asset-timeline", {}, token),

  listBitcoinHoldings: (token) => request("/bitcoin-holdings", {}, token),
  createBitcoinHolding: (token, payload) =>
    request(
      "/bitcoin-holdings",
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      token
    ),
  getBitcoinHistory: (token) => request("/bitcoin-holdings/history", {}, token),
  getBitcoinTopPercentHistory: (token, worldPopulation) => {
    const query =
      worldPopulation === undefined || worldPopulation === null
        ? ""
        : `?world_population=${encodeURIComponent(worldPopulation)}`;
    return request(`/bitcoin-holdings/top-percent-history${query}`, {}, token);
  },
  getCombinedBitcoinSummary: (token) =>
    request("/bitcoin-holdings/combined-summary", {}, token),
  getCombinedBitcoinHistory: (token) =>
    request("/bitcoin-holdings/combined-history", {}, token),
  getCombinedBitcoinTopPercentHistory: (token, worldPopulation) => {
    const query =
      worldPopulation === undefined || worldPopulation === null
        ? ""
        : `?world_population=${encodeURIComponent(worldPopulation)}`;
    return request(`/bitcoin-holdings/combined-top-percent-history${query}`, {}, token);
  },

};
