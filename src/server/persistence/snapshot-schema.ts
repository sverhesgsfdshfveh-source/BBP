import { z } from 'zod';

export const clientSchema = z.object({
  clientId: z.string(),
  status: z.enum(['online', 'offline_grace', 'offline_expired']),
  lastSeen: z.number(),
  graceDeadline: z.number().optional(),
  connId: z.string().optional(),
  connectedAt: z.number().optional(),
  meta: z.record(z.unknown()).optional(),
  expiredAt: z.number().optional()
});

export const tabSchema = z.object({
  clientId: z.string(),
  tabId: z.string(),
  status: z.enum(['active', 'stale', 'closed', 'stale_expired']),
  url: z.string(),
  title: z.string(),
  windowId: z.number().optional(),
  lastSeen: z.number(),
  updatedAt: z.number()
});

export const relaySnapshotSchema = z.object({
  version: z.number(),
  savedAt: z.number(),
  clients: z.array(clientSchema),
  tabs: z.array(tabSchema)
});
