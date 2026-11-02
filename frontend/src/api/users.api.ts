import { client } from "./client";
import type { Role, User } from "./types";

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  role?: Role;
}

export async function list(): Promise<User[]> {
  const { data } = await client.get<User[]>("/users");
  return data;
}

export async function create(input: CreateUserInput): Promise<User> {
  const { data } = await client.post<User>("/users", input);
  return data;
}

export async function setActive(id: string, isActive: boolean): Promise<User> {
  const { data } = await client.patch<User>(`/users/${id}`, { isActive });
  return data;
}
