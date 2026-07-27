import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import AdminLogin from "./pages/AdminLogin";
import Overview from "./pages/Overview";
import Dashboard from "./pages/Dashboard";
import AdminDashboard from "./pages/AdminDashboard";

function Protected({ children, admin }) {
  const { isAdmin } = useAuth();
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to={admin ? "/admin-login" : "/login"} />;
  if (admin && !isAdmin) return <Navigate to="/admin-login" />;
  if (!admin && isAdmin) return <Navigate to="/admin" />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/admin-login" element={<AdminLogin />} />
      <Route path="/overview" element={<Protected><Overview /></Protected>} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/admin" element={<Protected admin><AdminDashboard /></Protected>} />
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}
