/**
 * Minimal semver utilities for Apex Forge binding version checks.
 * Supports constraints: >=X.Y.Z, >X.Y.Z, =X.Y.Z, ^X.Y.Z, ~X.Y.Z
 */

interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

function parse(version: string): SemVer | null {
  const m = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function compare(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

/**
 * Check if `actual` version satisfies a `constraint` string.
 *
 * Supported constraint formats:
 *   ">=1.0.0"  — greater than or equal
 *   ">1.0.0"   — strictly greater
 *   "=1.0.0"   — exact match
 *   "^1.2.3"   — compatible (same major, >= minor.patch)
 *   "~1.2.3"   — approximate (same major.minor, >= patch)
 *   "1.0.0"    — treated as >=
 */
export function satisfies(actual: string, constraint: string): boolean {
  const c = constraint.trim();

  // Parse the operator and version from the constraint
  const opMatch = c.match(/^(>=|>|=|~|\^)?v?(\d+\.\d+\.\d+.*)$/);
  if (!opMatch) return false;

  const op = opMatch[1] || ">=";
  const target = parse(opMatch[2]);
  const ver = parse(actual);
  if (!target || !ver) return false;

  switch (op) {
    case ">=":
      return compare(ver, target) >= 0;
    case ">":
      return compare(ver, target) > 0;
    case "=":
      return compare(ver, target) === 0;
    case "^":
      // Same major, and >= target
      return ver.major === target.major && compare(ver, target) >= 0;
    case "~":
      // Same major.minor, and >= target
      return ver.major === target.major && ver.minor === target.minor && ver.patch >= target.patch;
    default:
      return compare(ver, target) >= 0;
  }
}
