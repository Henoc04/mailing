import type { SmtpAccount } from "@prisma/client";
import nodemailer from "nodemailer";
import { prisma } from "../lib/prisma";
import { encrypt, decrypt } from "../lib/crypto";
import { NotFoundError, SmtpAccountUnusableError } from "../errors/errors";
import type { CreateSmtpAccountInput, UpdateSmtpAccountInput } from "../dto/smtpAccount.dto";

export type SafeSmtpAccount = Omit<SmtpAccount, "encryptedPassword">;

/** Strips the encrypted password before returning an SmtpAccount to a caller/controller. */
function toSafeSmtpAccount(account: SmtpAccount): SafeSmtpAccount {
  const { encryptedPassword, ...safe } = account;
  return safe;
}

/**
 * Decrypts the stored SMTP password. Fails when ENCRYPTION_KEY changed since
 * the account was saved (e.g. database copied from another environment).
 */
function decryptPassword(account: SmtpAccount): string {
  try {
    return decrypt(account.encryptedPassword);
  } catch {
    throw new SmtpAccountUnusableError(
      `Mot de passe du compte SMTP « ${account.fromEmail} » illisible : la clé ENCRYPTION_KEY a changé depuis son enregistrement. Ressaisissez le mot de passe dans le compte SMTP.`,
    );
  }
}

export async function create(ownerId: string, input: CreateSmtpAccountInput): Promise<SafeSmtpAccount> {
  const encryptedPassword = encrypt(input.password);

  const created = await prisma.smtpAccount.create({
    data: {
      ownerId,
      label: input.label,
      host: input.host,
      port: input.port,
      security: input.security,
      username: input.username,
      encryptedPassword,
      fromEmail: input.fromEmail,
      fromName: input.fromName,
      rotationGroup: input.rotationGroup ?? null,
      isActive: input.isActive,
      dailyQuota: input.dailyQuota ?? null,
    },
  });

  return toSafeSmtpAccount(created);
}

export async function update(ownerId: string, id: string, input: UpdateSmtpAccountInput): Promise<SafeSmtpAccount> {
  const existing = await prisma.smtpAccount.findFirst({ where: { id, ownerId } });
  if (!existing) {
    throw new NotFoundError("Compte SMTP introuvable");
  }

  const { password, ...rest } = input;

  const updated = await prisma.smtpAccount.update({
    where: { id },
    data: {
      ...rest,
      ...(password ? { encryptedPassword: encrypt(password) } : {}),
    },
  });

  return toSafeSmtpAccount(updated);
}

export async function remove(ownerId: string, id: string): Promise<void> {
  const existing = await prisma.smtpAccount.findFirst({ where: { id, ownerId } });
  if (!existing) {
    throw new NotFoundError("Compte SMTP introuvable");
  }

  await prisma.smtpAccount.delete({ where: { id } });
}

export async function list(ownerId: string): Promise<SafeSmtpAccount[]> {
  const accounts = await prisma.smtpAccount.findMany({
    where: { ownerId },
    orderBy: { createdAt: "desc" },
  });
  return accounts.map(toSafeSmtpAccount);
}

export async function getById(ownerId: string, id: string): Promise<SafeSmtpAccount> {
  const account = await prisma.smtpAccount.findFirst({ where: { id, ownerId } });
  if (!account) {
    throw new NotFoundError("Compte SMTP introuvable");
  }
  return toSafeSmtpAccount(account);
}

export interface TestConnectionResult {
  ok: boolean;
  error?: string;
}

/**
 * Diagnostic endpoint: verifies SMTP credentials by opening a connection.
 * Never throws — failures are reported as data (`{ ok: false, error }`) so
 * the controller can surface them without a 5xx response.
 */
export async function testConnection(ownerId: string, id: string): Promise<TestConnectionResult> {
  const account = await prisma.smtpAccount.findFirst({ where: { id, ownerId } });
  if (!account) {
    throw new NotFoundError("Compte SMTP introuvable");
  }

  let decryptedPassword: string;
  try {
    decryptedPassword = decryptPassword(account);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const transporter = nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.security === "SSL",
    auth: {
      user: account.username,
      pass: decryptedPassword,
    },
    ...(account.security === "STARTTLS" ? { requireTLS: true } : {}),
  });

  try {
    await transporter.verify();

    await prisma.smtpAccount.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        lastTestOk: true,
        lastTestError: null,
      },
    });

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur de connexion SMTP inconnue";

    await prisma.smtpAccount.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        lastTestOk: false,
        lastTestError: message,
      },
    });

    return { ok: false, error: message };
  }
}

export interface DecryptedSmtpCredentials {
  host: string;
  port: number;
  security: SmtpAccount["security"];
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
}

/**
 * INTERNAL HELPER — no ownerId check by design. This is only ever called
 * from the trusted internal sending pipeline (smtpTransport.service.ts,
 * built in a later pass), never directly from a controller, since a
 * controller-exposed path here would let one user read another user's
 * decrypted SMTP credentials.
 */
export async function getDecryptedCredentials(id: string): Promise<DecryptedSmtpCredentials> {
  const account = await prisma.smtpAccount.findUnique({ where: { id } });
  if (!account) {
    throw new NotFoundError("Compte SMTP introuvable");
  }

  return {
    host: account.host,
    port: account.port,
    security: account.security,
    username: account.username,
    password: decryptPassword(account),
    fromEmail: account.fromEmail,
    fromName: account.fromName,
  };
}

export interface RotationPick {
  accountId: string;
  nextIndex: number;
}

/**
 * Pure function, no DB access. Picks which SMTP account id to use next for
 * a campaign send.
 *
 * Statelessness contract: this function does NOT persist `nextIndex`
 * anywhere. The caller (the future sending pipeline) is responsible for
 * keeping track of "where we are in the rotation" across calls — e.g. by
 * holding `nextIndex` in memory for the lifetime of a single campaign run
 * and passing it back in as `lastUsedIndex` on the next call. There is no
 * persistence of rotation state in the database.
 */
export function pickForRotation(
  campaignAccountIds: string[],
  useRotation: boolean,
  lastUsedIndex?: number
): RotationPick {
  if (campaignAccountIds.length === 0) {
    throw new NotFoundError("Aucun compte SMTP disponible pour cette campagne");
  }

  if (!useRotation || campaignAccountIds.length === 1) {
    return { accountId: campaignAccountIds[0], nextIndex: 0 };
  }

  const nextIndex = ((lastUsedIndex ?? -1) + 1) % campaignAccountIds.length;
  return { accountId: campaignAccountIds[nextIndex], nextIndex };
}
