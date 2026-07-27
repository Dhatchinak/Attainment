import React, { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [staff, setStaff] = useState(() => {
    const raw = localStorage.getItem("staff");
    return raw ? JSON.parse(raw) : null;
  });
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem("isAdmin") === "true");

  function login(token, staffData, adminFlag = false) {
    localStorage.setItem("token", token);
    localStorage.setItem("isAdmin", String(adminFlag));
    if (staffData) localStorage.setItem("staff", JSON.stringify(staffData));
    setStaff(staffData);
    setIsAdmin(adminFlag);
  }

  function logout() {
    localStorage.clear();
    setStaff(null);
    setIsAdmin(false);
  }

  return (
    <AuthContext.Provider value={{ staff, isAdmin, login, logout, isAuthenticated: !!localStorage.getItem("token") }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
