import type { LoginInput } from "../dto/auth.dto";
import { UnauthorizedError } from "../errors/errors";
import { signAccessToken } from "../lib/jwt";
import * as userService from "./user.service";

export interface LoginResult {
  token: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  };
}

/**
 * Authenticates a user by email/password. Always throws the same generic
 * UnauthorizedError on any failure (unknown email, inactive account, wrong
 * password) so we never leak which part of the credential pair was wrong.
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const genericError = () => new UnauthorizedError("Email ou mot de passe incorrect");

  const user = await userService.findByEmail(input.email);
  if (!user) {
    throw genericError();
  }

  if (!user.isActive) {
    throw genericError();
  }

  const passwordOk = await userService.verifyPassword(input.password, user.passwordHash);
  if (!passwordOk) {
    throw genericError();
  }

  const token = signAccessToken({ id: user.id, role: user.role });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    },
  };
}
