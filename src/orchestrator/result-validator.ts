import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ValidationResult {
  valid: boolean;
  status: "success" | "partial" | "failure";
  verdict?: string;
  reason?: string;
}

/**
 * Validate an agent's output by checking exit code and result.json structure.
 */
export function validateResult(
  workspacePath: string,
  exitCode: number,
): ValidationResult {
  if (exitCode !== 0) {
    return {
      valid: false,
      status: "failure",
      reason: `Non-zero exit code: ${exitCode}`,
    };
  }

  const resultPath = join(workspacePath, "output", "result.json");

  if (!existsSync(resultPath)) {
    return { valid: false, status: "partial", reason: "result.json not found" };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(readFileSync(resultPath, "utf-8"));
  } catch {
    return {
      valid: false,
      status: "partial",
      reason: "result.json is not valid JSON",
    };
  }

  if (!parsed.verdict) {
    return {
      valid: false,
      status: "partial",
      reason: "result.json missing 'verdict' field",
    };
  }

  return { valid: true, status: "success", verdict: parsed.verdict };
}
