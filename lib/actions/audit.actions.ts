"use server";

import { prisma } from "@/lib/prisma";

export async function recordAudit(event: string, entity: string, entityId?: string, metadata?: unknown) {
  await prisma.auditLog.create({
    data: {
      event,
      entity,
      entityId,
      metadata: metadata ? JSON.stringify(metadata) : null
    }
  });
}
