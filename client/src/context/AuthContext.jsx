import React, { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [staff, setStaff] = useState(() => {
    const raw = localStorage.getItem("staff");
    return raw ? JSON.parse(raw) : null;
  });
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem("isAdmin") === "true");
  const [authType, setAuthType] = useState(() => localStorage.getItem("authType") || "staff");

  function login(token, staffData, adminFlag = false, type = adminFlag ? "admin" : "staff") {
    localStorage.setItem("token", token);
    localStorage.setItem("isAdmin", String(adminFlag));
    localStorage.setItem("authType", type);
    if (staffData) localStorage.setItem("staff", JSON.stringify(staffData));
    setStaff(staffData);
    setIsAdmin(adminFlag);
    setAuthType(type);
  }

  function logout() {
    localStorage.clear();
    setStaff(null);
    setIsAdmin(false);
    setAuthType("staff");
  }

  return (
    <AuthContext.Provider value={{ staff, isAdmin, authType, isDepartment: authType === "department", login, logout, isAuthenticated: !!localStorage.getItem("token") }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
