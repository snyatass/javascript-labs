import path from "node:path";
import { fileURLToPath } from "node:url";

function positiveInteger(value, fallback, name) {
  const text = value?.trim();
  if (!text) return fallback;
  if (!/^\d+$/.test(text)) throw new TypeError(`${name} must be a positive integer`);
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return number;
}

export function loadConfig(env = process.env) {
  const port = positiveInteger(env.PORT, 3000, "PORT");
  if (port > 65535) throw new TypeError("PORT must not exceed 65535");
  const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const logDir = path.resolve(env.LOG_DIR ? env.LOG_DIR : path.join(projectDir, "logs"));
  const clientDir = path.resolve(
    env.CLIENT_DIR ? env.CLIENT_DIR : path.join(projectDir, "client/dist"),
  );
  return { port, logDir, clientDir };
}
