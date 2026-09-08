import "server-only";
import postgres from "postgres";

export const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";
export const hasDatabase = Boolean(DATABASE_URL);

let client: postgres.Sql | null = null;

/**
 * Lazily opened so the app builds and renders a setup screen when no database
 * is configured yet, instead of crashing at import time.
 */
export function db(): postgres.Sql {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — add it to the environment before using the database.");
  }
  client ??= postgres(DATABASE_URL, {
    max: 3,
    idle_timeout: 20,
    ssl: DATABASE_URL.includes("localhost") ? false : "require",
    // Statement text can contain merchant names; never let the driver echo
    // parameter values into the logs.
    debug: false,
    onnotice: () => {},
  });
  return client;
}
