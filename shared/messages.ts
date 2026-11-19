import { z } from "zod";

export const joinMessageSchema = z.object({
  type: z.literal("join"),
  roomId: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(24),
  protocol: z.enum(["binary", "json"]).optional(),
});

export const chatMessageSchema = z.object({
  type: z.literal("chat"),
  text: z.string().trim().min(1).max(500),
});

export const inputMessageSchema = z.object({
  type: z.literal("input"),
  seq: z.number().int().nonnegative().max(0xffffffff),
  thrust: z.boolean(),
  left: z.boolean(),
  right: z.boolean(),
  fire: z.boolean(),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  joinMessageSchema,
  chatMessageSchema,
  inputMessageSchema,
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export function parseClientMessage(
  input: unknown,
): { ok: true; value: ClientMessage } | { ok: false; error: unknown } {
  const result = clientMessageSchema.safeParse(input);
  return result.success ? { ok: true, value: result.data } : { ok: false, error: result.error };
}
