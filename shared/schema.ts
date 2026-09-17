import { z } from "zod";
import { kinds, convertibleKinds } from "./model";
export const operationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("convert"), id: z.string(), expectedVersion: z.number().int().positive(), kind: z.enum(convertibleKinds), patch: z.record(z.string(), z.any()) }),
  z.object({
    op: z.literal("create"),
    id: z.string().min(1),
    kind: z.enum(kinds),
    canvasId: z.string().nullable(),
    data: z.record(z.string(), z.any()),
  }),
  z.object({
    op: z.literal("update"),
    id: z.string(),
    expectedVersion: z.number().int().positive(),
    patch: z.record(z.string(), z.any()),
  }),
  z.object({
    op: z.literal("delete"),
    id: z.string(),
    expectedVersion: z.number().int().positive(),
  }),
  z.object({
    op: z.literal("restore"),
    id: z.string(),
    expectedVersion: z.number().int().positive(),
  }),
]);
export const batchSchema = z.object({
  projectId: z.string(),
  requestId: z.string().min(1),
  summary: z.string().max(300),
  operations: z.array(operationSchema).min(1).max(300),
});
