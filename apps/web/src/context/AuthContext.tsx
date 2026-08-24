import React, { createContext, useContext, useState, useEffect } from "react";
import { api } from "../api";

interface User { id: string; email: string; firstName: string; lastName: string; role: string; }
interface AuthCtx { user: User | null; token: string | null; login: (email: string, password: string) => Promise<void>; register: (data: any) => Promise<void>; logout: () => void; }

const AuthContext = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));

  useEffect(() => {
    if (token) {
      api.get("/api/users/me", token).then((r) => { if (r.data) setUser(r.data); else logout(); }).catch(() => logout());
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await api.post("/api/auth/login", { email, password });
    if (res.data) { localStorage.setItem("token", res.data.token); setToken(res.data.token); setUser(res.data.user); }
    else {
      const details = res.error?.details;
      const msg = details?.length ? details.map((d: any) => d.message).join(". ") : (res.error?.message || "Login failed");
      throw new Error(msg);
    }
  };

  const register = async (data: any) => {
    const res = await api.post("/api/auth/register", data);
    if (res.data) { localStorage.setItem("token", res.data.token); setToken(res.data.token); setUser(res.data.user); }
    else {
      const details = res.error?.details;
      const msg = details?.length ? details.map((d: any) => d.message).join(". ") : (res.error?.message || "Registration failed");
      throw new Error(msg);
    }
  };

  const logout = () => { localStorage.removeItem("token"); setToken(null); setUser(null); };

  return <AuthContext.Provider value={{ user, token, login, register, logout }}>{children}</AuthContext.Provider>;
}
