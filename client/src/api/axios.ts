import axios from "axios";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("staff");
      localStorage.removeItem("isAdmin");
      const authType = localStorage.getItem("authType");
      localStorage.removeItem("authType");
      window.location.href = authType === "admin" ? "/admin-login" : authType === "department" ? "/department-login" : "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
