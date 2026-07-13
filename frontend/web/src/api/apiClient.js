// src/api/apiClient.js
import axios from "axios";

const BASE =
  import.meta.env.VITE_API_GATEWAY_URL ||
  import.meta.env.VITE_GATEWAY_URL ||
  "http://localhost:8000";

// Luôn prefix api/v1
const api_prefix = "/api/v1";

const apiClient = axios.create({
  baseURL: BASE + api_prefix,
  headers: {
    Accept: "application/json",
  },
});

// === REQUEST INTERCEPTOR ===
apiClient.interceptors.request.use(
  (config) => {
    config.headers = config.headers || {};
    const token = localStorage.getItem("access_token");

    if (token) config.headers.Authorization = `Bearer ${token}`;

    // Nếu gửi FormData -> để browser tự set Content-Type
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    } else if (
      config.data &&
      typeof config.data !== "string"
    ) {
      config.headers["Content-Type"] =
        config.headers["Content-Type"] || "application/json";
    }

    return config;
  },
  (err) => Promise.reject(err)
);

// === RESPONSE INTERCEPTOR: REFRESH TOKEN ===
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem("refresh_token");
        if (!refreshToken) throw new Error("No refresh token");

        // IMPORTANT: refresh không dùng apiClient để tránh loop
        const refreshRes = await axios.post(
          `${BASE}${api_prefix}/auth/refresh`,
          { refresh_token: refreshToken }
        );

        const newAccess = refreshRes.data?.access_token;
        const newRefresh = refreshRes.data?.refresh_token;

        if (newAccess) {
          localStorage.setItem("access_token", newAccess);
          if (newRefresh)
            localStorage.setItem("refresh_token", newRefresh);

          originalRequest.headers.Authorization = `Bearer ${newAccess}`;

          return apiClient(originalRequest);
        }
      } catch (err2) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
