import path from "node:path";
import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_DIR: z.string().trim().min(1).default("logs"),
  CLIENT_DIR: z.string().trim().min(1).default("client/dist"),
  ALLOWED_ORIGINS: z
    .string()
    .trim()
    .default("http://localhost:5173,http://127.0.0.1:5173")
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  MAX_CONNECTIONS_PER_IP: z.coerce.number().int().min(1).default(8),
  MAX_ROOMS: z.coerce.number().int().min(1).default(20),
  MAX_PLAYERS_PER_ROOM: z.coerce.number().int().min(1).default(32),
  GIT_SHA: z.string().trim().default("dev"),
  HOST: z.string().trim().min(1).default("0.0.0.0"),
});

export type ServerConfig = {
  readonly port: number;
  readonly logDir: string;
  readonly clientDir: string;
  readonly allowedOrigins: readonly string[];
  readonly maxConnectionsPerIp: number;
  readonly maxRooms: number;
  readonly maxPlayersPerRoom: number;
  readonly gitSha: string;
  readonly host: string;
};

export function loadTypeScriptConfig(
  env: Readonly<Record<string, string | undefined>>,
): ServerConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) throw new Error(`Invalid server config: ${result.error.message}`);
  return {
    port: result.data.PORT,
    logDir: path.resolve(result.data.LOG_DIR),
    clientDir: path.resolve(result.data.CLIENT_DIR),
    allowedOrigins: result.data.ALLOWED_ORIGINS,
    maxConnectionsPerIp: result.data.MAX_CONNECTIONS_PER_IP,
    maxRooms: result.data.MAX_ROOMS,
    maxPlayersPerRoom: result.data.MAX_PLAYERS_PER_ROOM,
    gitSha: result.data.GIT_SHA,
    host: result.data.HOST,
  };
}

export function loadConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ServerConfig {
  return loadTypeScriptConfig(env);
}
