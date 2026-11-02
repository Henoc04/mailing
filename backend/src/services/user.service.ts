import type { Prisma, User } from "@prisma/client";
import argon2 from "argon2";
import { prisma } from "../lib/prisma";
import { ConflictError, NotFoundError } from "../errors/errors";

export interface CreateUserInput {
  email: string;
  password: string;
  fullName: string;
  role?: Prisma.UserCreateInput["role"];
}

/**
 * Creates a new user, hashing the plaintext password with argon2 before
 * persisting it. Throws ConflictError if the email is already registered.
 */
export async function createUser(input: CreateUserInput): Promise<User> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new ConflictError("Un utilisateur avec cet email existe déjà");
  }

  const passwordHash = await argon2.hash(input.password);

  try {
    return await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        ...(input.role ? { role: input.role } : {}),
      },
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new ConflictError("Un utilisateur avec cet email existe déjà");
    }
    throw err;
  }
}

export async function findByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}

export async function findById(id: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw new NotFoundError("Utilisateur introuvable");
  }
  return user;
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

function isUniqueConstraintError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}
