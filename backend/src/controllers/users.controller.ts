import type { Request, Response } from "express";
import { Role } from "@prisma/client";
import { asyncHandler } from "./asyncHandler";
import { prisma } from "../lib/prisma";
import * as userService from "../services/user.service";
import { ValidationError } from "../errors/errors";

export const list = asyncHandler(async (_req: Request, res: Response) => {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.status(200).json(users);
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, fullName, role } = req.body as {
    email?: string;
    password?: string;
    fullName?: string;
    role?: string;
  };

  if (!email || typeof email !== "string") {
    throw new ValidationError("email est requis");
  }
  if (!password || typeof password !== "string") {
    throw new ValidationError("password est requis");
  }
  if (!fullName || typeof fullName !== "string") {
    throw new ValidationError("fullName est requis");
  }
  const validRoles: string[] = Object.values(Role);
  if (role !== undefined && !validRoles.includes(role)) {
    throw new ValidationError(`role doit être l'un de: ${validRoles.join(", ")}`);
  }

  const user = await userService.createUser({
    email,
    password,
    fullName,
    ...(role ? { role: role as Role } : {}),
  });

  const { passwordHash, ...safeUser } = user;
  res.status(201).json(safeUser);
});

export const setActive = asyncHandler(async (req: Request, res: Response) => {
  const { isActive } = req.body as { isActive?: boolean };

  if (typeof isActive !== "boolean") {
    throw new ValidationError("isActive doit être un booléen");
  }

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { isActive },
    select: { id: true, email: true, fullName: true, role: true, isActive: true, createdAt: true },
  });

  res.status(200).json(user);
});
