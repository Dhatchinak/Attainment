import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./pages/Login";
import AdminLogin from "./pages/AdminLogin";
import DepartmentLogin from "./pages/DepartmentLogin";

const Overview = React.lazy(() => import("./pages/Overview"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const AdminDashboard = React.lazy(() => import("./pages/AdminDashboard"));
const DepartmentDashboard = React.lazy(() => import("./pages/DepartmentDashboard"));

type ProtectedProps = {
  children: React.ReactNode;
  admin?: boolean;
  department?: boolean;
};

function Protected({ children, admin = false, department = false }: ProtectedProps) {
  const { isAdmin, isDepartment } = useAuth();
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to={admin ? "/admin-login" : department ? "/department-login" : "/login"} />;
  if (admin && !isAdmin) return <Navigate to="/admin-login" />;
  if (department && !isDepartment) return <Navigate to="/department-login" />;
  if (!admin && !department && (isAdmin || isDepartment)) return <Navigate to={isAdmin ? "/admin" : "/department"} />;
  return children;
}

export default function App() {
  return (
    <React.Suspense fallback={<div className="loading-state min-h-screen">Loading attainment workspace…</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="/department-login" element={<DepartmentLogin />} />
        <Route path="/overview" element={<Protected><Overview /></Protected>} />
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/admin" element={<Protected admin><AdminDashboard /></Protected>} />
        <Route path="/department" element={<Protected department><DepartmentDashboard /></Protected>} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </React.Suspense>
  );
}
