---
name: apex-forge-security-audit
description: Chief Security Officer mode — infrastructure-first security audit with CWE-tagged findings
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Security Audit Role Preamble
source "$PLUGIN_ROOT/hooks/state-helper"

echo "=== APEX SECURITY AUDIT ==="
apex_set_stage "security-audit"

# Determine audit mode from args or default to daily
AUDIT_MODE="${1:-daily}"
echo "[apex] Audit mode: $AUDIT_MODE"

# Detect project type
PROJECT_TYPE="unknown"
if [ -f "package.json" ]; then
  PROJECT_TYPE="node"
  echo "[apex] Project: Node.js"
elif [ -f "requirements.txt" ] || [ -f "pyproject.toml" ] || [ -f "Pipfile" ]; then
  PROJECT_TYPE="python"
  echo "[apex] Project: Python"
elif [ -f "go.mod" ]; then
  PROJECT_TYPE="go"
  echo "[apex] Project: Go"
elif [ -f "Cargo.toml" ]; then
  PROJECT_TYPE="rust"
  echo "[apex] Project: Rust"
elif [ -f "Gemfile" ]; then
  PROJECT_TYPE="ruby"
  echo "[apex] Project: Ruby"
fi
echo "PROJECT_TYPE=$PROJECT_TYPE"

# Check for git availability (needed for secrets archaeology)
GIT_AVAILABLE="false"
if command -v git &>/dev/null && git rev-parse --is-inside-work-tree &>/dev/null 2>&1; then
  GIT_AVAILABLE="true"
  TOTAL_COMMITS=$(git rev-list --count HEAD 2>/dev/null || echo "0")
  echo "[apex] Git: available ($TOTAL_COMMITS commits)"
else
  echo "[apex] Git: not available"
fi
echo "GIT_AVAILABLE=$GIT_AVAILABLE"

# Check for dependency audit tools
HAS_NPM_AUDIT="false"
HAS_PIP_AUDIT="false"
HAS_GOVULNCHECK="false"
HAS_CARGO_AUDIT="false"

if command -v npm &>/dev/null; then HAS_NPM_AUDIT="true"; fi
if command -v pip-audit &>/dev/null; then HAS_PIP_AUDIT="true"; fi
if command -v govulncheck &>/dev/null; then HAS_GOVULNCHECK="true"; fi
if command -v cargo-audit &>/dev/null; then HAS_CARGO_AUDIT="true"; fi

echo "[apex] Audit tools: npm=$HAS_NPM_AUDIT pip=$HAS_PIP_AUDIT go=$HAS_GOVULNCHECK cargo=$HAS_CARGO_AUDIT"

# Create audit output directory
AUDIT_DIR=".apex/audits"
mkdir -p "$AUDIT_DIR"
echo "[apex] Audit output: $AUDIT_DIR/"

apex_ensure_dirs
```

# Security Audit

> apex-forge / workflow / roles / security-audit
>
> Chief Security Officer mode. Infrastructure-first audit.
> Two modes: daily quick scan and comprehensive deep audit.

---

## Audit Modes

### Daily Mode (default)

- **Confidence gate**: 8/10 — only report findings you are highly confident about.
- **Scope**: secrets in recent changes, dependency vulnerabilities, obvious OWASP violations.
- **Time budget**: fast. Focus on highest-risk areas only.
- **Noise tolerance**: ZERO. Every finding must be actionable.

### Comprehensive Mode (invoke with `comprehensive`)

- **Confidence gate**: 2/10 — report anything suspicious, even low-confidence.
- **Scope**: full codebase scan across all 5 audit domains.
- **Time budget**: thorough. Read every file that handles auth, input, or data.
- **Noise tolerance**: acceptable. Flag potential issues for human review.

---

## Audit Sequence

Execute in this exact order. Each domain builds on findings from the previous.

### Domain 1: Secrets Archaeology

**Goal**: find any secrets that should not be in the codebase.

**Step 1 — Source code scan**

Search the entire codebase for patterns matching:

| Pattern | What It Catches |
|---------|----------------|
| `(?i)(api[_-]?key\|secret\|token\|password\|passwd\|credential)\s*[=:]\s*['"][^'"]+` | Hardcoded secrets in assignments |
| `(?i)(aws\|gcp\|azure\|stripe\|twilio\|sendgrid\|github\|gitlab)[_-]?(key\|secret\|token)` | Cloud provider / SaaS secrets |
| `(?i)bearer\s+[a-zA-Z0-9._-]{20,}` | Bearer tokens in source |
| `-----BEGIN\s+(RSA\|DSA\|EC\|OPENSSH)\s+PRIVATE\s+KEY-----` | Private keys |
| `(?i)(jdbc\|mongodb\|redis\|postgres\|mysql):\/\/[^:]+:[^@]+@` | Database connection strings with credentials |

Exclude: `node_modules/`, `vendor/`, `.git/`, lock files, test fixtures with obviously fake values.

**Step 2 — Git history scan** (if `GIT_AVAILABLE=true`)

```
Search the last 100 commits for secrets that were added then removed:
- git log -p --all -S 'password' -- ':!node_modules' ':!vendor'
- git log -p --all -S 'secret' -- ':!node_modules' ':!vendor'
- git log -p --all -S 'api_key' -- ':!node_modules' ':!vendor'
```

**Step 3 — Environment file check**

- Is `.env` in `.gitignore`?
- Does `.env.example` exist with placeholder values (not real secrets)?
- Are there any `.env.local`, `.env.production` files committed?

### Domain 2: Dependency Supply Chain

**Goal**: identify known vulnerabilities and outdated packages.

**Step 1 — Run audit tool**

| Project Type | Command | Fallback |
|-------------|---------|----------|
| Node.js | `npm audit --json` | Read `package-lock.json`, check versions manually |
| Python | `pip-audit --format json` | Read `requirements.txt`, check PyPI advisories |
| Go | `govulncheck ./...` | Read `go.sum`, check Go vulnerability database |
| Rust | `cargo audit` | Read `Cargo.lock`, check RustSec advisories |

**Step 2 — Outdated packages**

Check for packages more than 2 major versions behind. These are supply chain risks even without known CVEs.

**Step 3 — Dependency confusion**

- Are there internal/private packages that could be squatted on public registries?
- Is the package manager configured to use the correct registry scope?

### Domain 3: CI/CD Pipeline

**Goal**: ensure build/deploy pipelines are not exploitable.

Scan for:

| File Pattern | Risk |
|-------------|------|
| `.github/workflows/*.yml` | GitHub Actions injection, excessive permissions |
| `Dockerfile`, `docker-compose.yml` | Running as root, secrets in build args |
| `.gitlab-ci.yml` | Script injection, artifact exposure |
| `Makefile`, `scripts/` | Arbitrary command execution paths |

**GitHub Actions specific checks**:

| Check | CWE | What to Look For |
|-------|-----|-----------------|
| **Expression injection** | CWE-94 | `${{ github.event.*.body }}` or similar user-controlled values in `run:` blocks |
| **Excessive permissions** | CWE-250 | `permissions: write-all` or missing permissions block (defaults to write) |
| **Untrusted checkout** | CWE-829 | `actions/checkout` on PR head without pinned SHA for actions |
| **Secret exposure** | CWE-200 | Secrets passed as env vars to steps that don't need them |

### Domain 4: OWASP Top 10

**Goal**: check application code for the OWASP Top 10 2021 vulnerabilities.

| # | Vulnerability | CWE | What to Search For |
|---|-------------|-----|-------------------|
| A01 | **Broken Access Control** | CWE-639 | Missing auth middleware, direct object references without ownership check |
| A02 | **Cryptographic Failures** | CWE-327 | MD5/SHA1 for passwords, HTTP for sensitive data, hardcoded encryption keys |
| A03 | **Injection** | CWE-89 | String concatenation in SQL queries, unsanitized user input in shell commands, template injection |
| A04 | **Insecure Design** | CWE-840 | No rate limiting on auth endpoints, no account lockout, unlimited file upload |
| A05 | **Security Misconfiguration** | CWE-16 | Debug mode in production, default credentials, verbose error messages, CORS wildcard |
| A06 | **Vulnerable Components** | CWE-1035 | (Covered in Domain 2) |
| A07 | **Auth Failures** | CWE-287 | Weak password requirements, missing MFA, session tokens in URLs |
| A08 | **Data Integrity Failures** | CWE-502 | Deserialization of untrusted data, unsigned updates, CI/CD without integrity checks |
| A09 | **Logging Failures** | CWE-778 | No logging on auth events, PII in logs, no log integrity protection |
| A10 | **SSRF** | CWE-918 | User-supplied URLs fetched server-side without allowlist, redirect following |

For daily mode: focus on A01, A03, A05, A07 (highest impact).
For comprehensive: cover all 10.

### Domain 5: Authentication & Authorization

**Goal**: verify auth implementation is sound.

| Check | What to Look For |
|-------|-----------------|
| **Session management** | Secure cookie flags (HttpOnly, Secure, SameSite). Session timeout. Token rotation. |
| **Token handling** | JWT signature verification. Token expiry enforcement. No tokens in localStorage for sensitive apps. |
| **Password storage** | bcrypt/scrypt/argon2 with appropriate cost factor. No plain-text or reversible encryption. |
| **RBAC/ABAC** | Role checks on every protected route. No client-only authorization. |
| **OAuth flows** | State parameter for CSRF. PKCE for public clients. Token exchange validation. |

---

## Finding Format

Every finding MUST use this format:

```markdown
### {SEVERITY}: {short description}
- **CWE**: CWE-{number} — {name}
- **Domain**: secrets | supply-chain | cicd | owasp | auth
- **Confidence**: {N}/10
- **File**: `path/to/file.ext:line`
- **Evidence**: {exact code snippet or command output}
- **Impact**: {what an attacker could do}
- **Remediation**: {specific fix with code example}
```

Severity levels:

| Severity | Definition | SLA |
|----------|-----------|-----|
| **Critical** | Active exploit path, data breach risk, secrets exposed | Fix immediately. Stop all other work. |
| **High** | Exploitable with moderate effort, significant data risk | Fix within 24 hours. |
| **Medium** | Requires specific conditions to exploit, limited blast radius | Fix within 1 week. |
| **Low** | Hardening improvement, defense-in-depth, best practice | Fix when convenient. Track in backlog. |

---

## Confidence Gate Enforcement

**Daily mode**: only include findings with confidence >= 8/10.
**Comprehensive mode**: include findings with confidence >= 2/10, but tag low-confidence findings as `[NEEDS VERIFICATION]`.

Before reporting a finding, self-check:
1. Did I read the actual file, or am I guessing from the filename?
2. Is this a real vulnerability, or a pattern that COULD be vulnerable but is actually handled elsewhere?
3. Is the "fix" I'm suggesting actually correct, or would it break functionality?

---

## Completion Status

| Status | Condition |
|--------|-----------|
| **DONE** | All domains scanned. No Critical/High findings. |
| **DONE_WITH_CONCERNS** | All domains scanned. High findings documented. No Critical. |
| **BLOCKED** | Critical findings discovered. Must be fixed before any other work. |
| **NEEDS_CONTEXT** | Cannot assess without more information (e.g., deployment config not in repo). |

---

## Artifact Output

Write to `.apex/audits/YYYY-MM-DD-audit.md`:

```markdown
---
title: "Security Audit"
mode: daily | comprehensive
date: YYYY-MM-DD
status: DONE | DONE_WITH_CONCERNS | BLOCKED
project_type: {detected type}
findings_total: {N}
critical: {N}
high: {N}
medium: {N}
low: {N}
stage: security-audit
apex_version: "0.1.0"
---

# Security Audit — {date} ({mode})

## Executive Summary
- **Risk level**: {Critical | High | Medium | Low | Clean}
- **Domains scanned**: {list}
- **Findings**: Critical: {N}, High: {N}, Medium: {N}, Low: {N}
- **Top priority**: {most critical finding, one line}

## Findings by Domain

### Secrets Archaeology
{findings or "No secrets found in source or git history."}

### Dependency Supply Chain
{findings or "All dependencies up to date, no known vulnerabilities."}

### CI/CD Pipeline
{findings or "Pipeline configuration secure."}

### OWASP Top 10
{findings or "No OWASP violations detected."}

### Authentication & Authorization
{findings or "Auth implementation is sound."}

## Remediation Plan
| Priority | Finding | Fix | Effort |
|----------|---------|-----|--------|
| 1 | {description} | {fix} | {estimate} |

## Next Audit
- Recommended: {date based on mode — daily: tomorrow, comprehensive: 30 days}
```

---

## Register and Report

```bash
source "$PLUGIN_ROOT/hooks/state-helper"
apex_add_artifact "security-audit" ".apex/audits/YYYY-MM-DD-audit.md"
```

Then report:

**If clean (DONE)**:
> **Security audit complete ({mode}).** No critical or high findings.
> {N} total findings ({breakdown}). Report at `.apex/audits/{date}-audit.md`.

**If concerns (DONE_WITH_CONCERNS)**:
> **Security audit complete ({mode}).** {N} high findings require attention.
> Remediation plan in `.apex/audits/{date}-audit.md`. Fix high-priority items within 24h.

**If critical (BLOCKED)**:
> **CRITICAL SECURITY FINDINGS.** {N} critical issues discovered.
> **Stop all other work.** Fix these immediately. Details in `.apex/audits/{date}-audit.md`.
