import path from "node:path";
import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_DIR: z.string().trim().min(1).default("logs"),
  CLIENT_DIR: z.string().trim().min(1).default("client/dist"),
});

export type ServerConfig = {
  readonly port: number;
  readonly logDir: string;
  readonly clientDir: string;
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
  };
}

export function loadConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ServerConfig {
  return loadTypeScriptConfig(env);
}
