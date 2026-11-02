import { client } from "./client";
import type { User } from "./types";

export interface LoginResult {
  token: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const { data } = await client.post<LoginResult>("/auth/login", { email, password });
  return data;
}

export async function me(): Promise<User> {
  const { data } = await client.get<User>("/auth/me");
  return data;
}
