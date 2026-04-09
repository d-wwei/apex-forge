---
name: security-audit
description: Infrastructure-first security audit with CWE-tagged findings across 5 domains
---

# Security Audit

Chief Security Officer mode. Infrastructure-first audit.
Two modes: daily quick scan and comprehensive deep audit.

---

## AUDIT MODES

### Daily Mode (default)

- **Confidence gate**: 8/10 — only report findings you are highly confident about.
- **Scope**: secrets in recent changes, dependency vulnerabilities, obvious OWASP violations.
- **Noise tolerance**: ZERO. Every finding must be actionable.

### Comprehensive Mode

- **Confidence gate**: 2/10 — report anything suspicious, even low-confidence.
- **Scope**: full codebase scan across all 5 audit domains.
- **Noise tolerance**: acceptable. Tag low-confidence findings as `[NEEDS VERIFICATION]`.

---

## AUDIT SEQUENCE

Execute in this exact order. Each domain builds on the previous.

### Domain 1: Secrets Archaeology

**Goal**: find secrets that should not be in the codebase.

**Source code scan** — search for patterns matching:

| Pattern | What It Catches |
|---------|----------------|
| `api_key`, `secret`, `token`, `password` in assignments | Hardcoded secrets |
| Cloud provider / SaaS key patterns (AWS, GCP, Stripe, etc.) | Cloud credentials |
| `Bearer` tokens in source | Leaked auth tokens |
| `-----BEGIN PRIVATE KEY-----` | Private keys |
| Database connection strings with credentials | DB passwords |

Exclude: `node_modules/`, `vendor/`, `.git/`, lock files, test fixtures with fake values.

**Git history scan** — search the last 100 commits for secrets that were added then removed.

**Environment file check**:
- Is `.env` in `.gitignore`?
- Does `.env.example` exist with placeholder values?
- Are `.env.local` / `.env.production` files committed?

### Domain 2: Dependency Supply Chain

**Goal**: identify known vulnerabilities and outdated packages.

- Run the appropriate audit tool for the project type (npm audit, pip-audit, govulncheck, cargo audit).
- Check for packages more than 2 major versions behind.
- Check for dependency confusion: internal packages that could be squatted on public registries.

### Domain 3: CI/CD Pipeline

**Goal**: ensure build/deploy pipelines are not exploitable.

| Check | CWE | What to Look For |
|-------|-----|-----------------|
| **Expression injection** | CWE-94 | User-controlled values in `run:` blocks |
| **Excessive permissions** | CWE-250 | `permissions: write-all` or missing permissions block |
| **Untrusted checkout** | CWE-829 | `actions/checkout` without pinned SHA |
| **Secret exposure** | CWE-200 | Secrets passed to steps that don't need them |

Also check: Dockerfiles running as root, secrets in build args, script injection in Makefiles.

### Domain 4: OWASP Top 10

| # | Vulnerability | CWE | What to Search For |
|---|-------------|-----|-------------------|
| A01 | Broken Access Control | CWE-639 | Missing auth middleware, IDOR |
| A02 | Cryptographic Failures | CWE-327 | MD5/SHA1 for passwords, hardcoded encryption keys |
| A03 | Injection | CWE-89 | String concatenation in SQL, unsanitized shell commands |
| A04 | Insecure Design | CWE-840 | No rate limiting, unlimited file upload |
| A05 | Security Misconfiguration | CWE-16 | Debug mode in prod, CORS wildcard |
| A07 | Auth Failures | CWE-287 | Weak passwords, session tokens in URLs |
| A08 | Data Integrity Failures | CWE-502 | Deserialization of untrusted data |
| A09 | Logging Failures | CWE-778 | PII in logs, no auth event logging |
| A10 | SSRF | CWE-918 | User-supplied URLs fetched server-side without allowlist |

Daily mode: focus on A01, A03, A05, A07. Comprehensive: cover all.

### Domain 5: Authentication & Authorization

| Check | What to Look For |
|-------|-----------------|
| **Session management** | Secure cookie flags, session timeout, token rotation |
| **Token handling** | JWT signature verification, expiry enforcement |
| **Password storage** | bcrypt/scrypt/argon2, no plain-text |
| **RBAC/ABAC** | Role checks on every protected route, no client-only auth |
| **OAuth flows** | State parameter for CSRF, PKCE for public clients |

---

## FINDING FORMAT

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

| Severity | Definition | SLA |
|----------|-----------|-----|
| **Critical** | Active exploit path, data breach risk | Fix immediately |
| **High** | Exploitable with moderate effort | Fix within 24 hours |
| **Medium** | Requires specific conditions to exploit | Fix within 1 week |
| **Low** | Hardening improvement, defense-in-depth | Fix when convenient |

---

## CONFIDENCE GATE

Before reporting a finding, self-check:
1. Did I read the actual file, or am I guessing from the filename?
2. Is this a real vulnerability, or a pattern handled elsewhere?
3. Is the suggested fix actually correct, or would it break functionality?

---

## COMPLETION STATUS

| Status | Condition |
|--------|-----------|
| **DONE** | All domains scanned. No Critical/High findings. |
| **DONE_WITH_CONCERNS** | All domains scanned. High findings documented. No Critical. |
| **BLOCKED** | Critical findings discovered. Must fix before any other work. |
| **NEEDS_CONTEXT** | Cannot assess without more info (e.g., deployment config not in repo). |
