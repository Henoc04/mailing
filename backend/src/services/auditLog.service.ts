import type { AuditLog, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

export interface RecordAuditLogInput {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metaJson?: unknown;
  ipAddress?: string | null;
}

/**
 * Inserts an audit log row. Never throws: audit logging is a side-effect of
 * the primary request flow and must never be the reason a request fails,
 * so any error here is caught and logged instead of propagated.
 */
export async function record(input: RecordAuditLogInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metaJson: (input.metaJson ?? null) as Prisma.InputJsonValue | undefined,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, action: input.action, entityType: input.entityType }, "Failed to record audit log");
  }
}

export interface AuditLogFilters {
  actorId?: string;
  entityType?: string;
}

export interface ListAuditLogsResult {
  items: AuditLog[];
  total: number;
}

export async function list(filters: AuditLogFilters = {}, page = 1, pageSize = 50): Promise<ListAuditLogsResult> {
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.actorId ? { actorId: filters.actorId } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { items, total };
}
