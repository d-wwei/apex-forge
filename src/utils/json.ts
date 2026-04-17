import { existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname } from "node:path";

export async function readJSON<T>(path: string, defaultValue: T): Promise<T> {
  try {
    const file = Bun.file(path);
    if (await file.exists()) {
      return (await file.json()) as T;
    }
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function writeJSON<T>(path: string, data: T): Promise<void> {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmp = `${path}.tmp.${Date.now()}`;
  await Bun.write(tmp, `${JSON.stringify(data, null, 2)}\n`);
  renameSync(tmp, path);
}
