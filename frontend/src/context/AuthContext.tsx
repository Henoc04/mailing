import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as authApi from "../api/auth.api";
import { clearToken, getToken, setToken } from "../api/client";
import type { User } from "../api/types";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const existingToken = getToken();
    if (!existingToken) {
      setIsLoading(false);
      return;
    }

    authApi
      .me()
      .then((fetchedUser) => {
        setUser(fetchedUser);
        setTokenState(existingToken);
      })
      .catch(() => {
        clearToken();
        setUser(null);
        setTokenState(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string): Promise<void> {
    const result = await authApi.login(email, password);
    setToken(result.token);
    setTokenState(result.token);
    setUser({
      id: result.user.id,
      email: result.user.email,
      fullName: result.user.fullName,
      role: result.user.role as User["role"],
      isActive: true,
      createdAt: new Date().toISOString(),
    });
  }

  function logout(): void {
    clearToken();
    setTokenState(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
