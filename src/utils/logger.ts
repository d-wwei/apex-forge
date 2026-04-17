import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function appendJSONL(
  path: string,
  record: Record<string, unknown>,
): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  appendFileSync(path, `${JSON.stringify(record)}\n`);
}
