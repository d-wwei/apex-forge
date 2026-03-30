---
name: apex-forge-benchmark
description: Performance baseline tracking — measure, store, compare, and flag regressions
user-invocable: true
---

```bash
#!/usr/bin/env bash
# Apex Forge — Benchmark Role Preamble
source "${APEX_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}/hooks/state-helper"

echo "=== APEX BENCHMARK ROLE ==="
apex_set_stage "benchmark"

# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------
_bench_start_ts=$(date +%s)
apex_telemetry_start "benchmark"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BENCH_DIR=".apex/benchmarks"
BENCH_BASELINE="${BENCH_DIR}/baseline.json"
BENCH_CURRENT="${BENCH_DIR}/current.json"
BENCH_HISTORY="${BENCH_DIR}/history/"

mkdir -p "$BENCH_DIR" "$BENCH_HISTORY"

echo "[benchmark] Baseline file: ${BENCH_BASELINE}"
echo "[benchmark] Has baseline: $([ -f "$BENCH_BASELINE" ] && echo 'yes' || echo 'no')"

# Detect measurement tools
LIGHTHOUSE_AVAILABLE=false
if command -v lighthouse &>/dev/null; then
  LIGHTHOUSE_AVAILABLE=true
  echo "[benchmark] Lighthouse CLI: available"
elif command -v npx &>/dev/null && npx --no-install lighthouse --version &>/dev/null 2>&1; then
  LIGHTHOUSE_AVAILABLE=true
  echo "[benchmark] Lighthouse CLI: available via npx"
else
  echo "[benchmark] Lighthouse CLI: not available"
fi

# Browser detection
eval "$(apex_browse_detect)"
echo "[benchmark] Browser: ${APEX_BROWSE_TYPE:-none}"

# Detect build tools for bundle size
BUILD_CMD=""
if [ -f "package.json" ]; then
  BUILD_CMD=$(python3 -c "
import json
d=json.load(open('package.json'))
print(d.get('scripts',{}).get('build',''))
" 2>/dev/null || echo "")
fi
echo "[benchmark] Build command: ${BUILD_CMD:-'(none detected)'}"

apex_ensure_dirs
```

# Benchmark Role

> apex-forge / workflow / roles / benchmark
>
> Performance baseline tracking. Measure, store baselines,
> compare against them, and flag regressions.

---

## WHAT WE MEASURE

| Metric | Category | Source |
|--------|----------|--------|
| **LCP** (Largest Contentful Paint) | Core Web Vital | Browser / Lighthouse |
| **FID** (First Input Delay) | Core Web Vital | Lighthouse |
| **CLS** (Cumulative Layout Shift) | Core Web Vital | Browser / Lighthouse |
| **TTFB** (Time to First Byte) | Performance | curl / Browser |
| **Page Load Time** | Performance | Browser |
| **Bundle Size** (JS + CSS) | Build | Filesystem |
| **Total Asset Size** | Build | Filesystem |

---

## STEP 1: DETERMINE MEASUREMENT MODE

Based on available tooling, choose a mode:

| Mode | Requirements | Metrics Available |
|------|-------------|-------------------|
| **Full** | Lighthouse + Browser | All metrics |
| **Browser** | Browser only (no Lighthouse) | LCP, CLS, page load, TTFB |
| **Headless** | curl + filesystem only | TTFB, bundle sizes |

Select the highest available mode. Report which mode is active.

---

## STEP 2: COLLECT MEASUREMENTS

### 2a. Bundle Size (all modes)

Scan the build output directory for JS and CSS files:

```
Locations to check (in order):
1. dist/          — Vite, Rollup
2. build/         — Create React App, Next.js
3. .next/         — Next.js
4. out/           — Next.js static export
5. public/build/  — Remix, SvelteKit
```

For each directory found:
- Sum all `.js` file sizes → `js_bundle_bytes`
- Sum all `.css` file sizes → `css_bundle_bytes`
- Sum all assets → `total_asset_bytes`
- Count the number of chunks → `chunk_count`

If no build output exists and `BUILD_CMD` is available, ask the user if they want to run a build first.

### 2b. TTFB (all modes)

If a URL is available (from `.apex/config.yaml` or user):
```
curl -o /dev/null -s -w '%{time_starttransfer}' {URL}
```
Run 3 times, take the median.

### 2c. Core Web Vitals (Full mode)

Run Lighthouse:
```
lighthouse {URL} --output=json --quiet --chrome-flags="--headless"
```

Extract:
- `audits.largest-contentful-paint.numericValue` → LCP (ms)
- `audits.max-potential-fid.numericValue` → FID (ms)
- `audits.cumulative-layout-shift.numericValue` → CLS
- `categories.performance.score` → Overall score (0-1)

### 2d. Browser Metrics (Full or Browser mode)

If browser available, navigate to key pages and measure:
- `performance.timing.loadEventEnd - performance.timing.navigationStart` → Page load time
- PerformanceObserver entries for LCP and CLS

---

## STEP 3: STORE / COMPARE

### Baseline format (`.apex/benchmarks/baseline.json`):

```json
{
  "created_at": "ISO-timestamp",
  "mode": "full | browser | headless",
  "metrics": {
    "lcp_ms": 1200,
    "fid_ms": 50,
    "cls": 0.05,
    "ttfb_ms": 180,
    "page_load_ms": 2100,
    "js_bundle_bytes": 245000,
    "css_bundle_bytes": 38000,
    "total_asset_bytes": 520000,
    "chunk_count": 12,
    "lighthouse_score": 0.92
  },
  "pages": {
    "/": { "lcp_ms": 1200, "cls": 0.05, "load_ms": 2100 },
    "/dashboard": { "lcp_ms": 1800, "cls": 0.1, "load_ms": 3200 }
  }
}
```

### If NO baseline exists:
- Save current measurements as the baseline
- Report: "Baseline established. Run /apex-benchmark again after changes to compare."

### If baseline EXISTS:
- Save current measurements to `current.json`
- Archive to `history/YYYY-MM-DD-HHMMSS.json`
- Compute delta for every metric

---

## STEP 4: REGRESSION DETECTION

Flag regressions using these thresholds:

| Metric | Warning (>10%) | Critical (>25%) |
|--------|---------------|-----------------|
| LCP | +10% slower | +25% slower |
| FID | +10% slower | +25% slower |
| CLS | +0.05 increase | +0.1 increase |
| TTFB | +10% slower | +25% slower |
| Page Load | +10% slower | +25% slower |
| JS Bundle | +10% larger | +25% larger |
| Total Assets | +10% larger | +25% larger |

Improvements (metrics getting better) are noted but not flagged.

---

## STEP 5: OUTPUT REPORT

Print a comparison table:

```
Performance Benchmark — {date}
Mode: {full | browser | headless}

| Metric            | Baseline  | Current   | Delta     | Status   |
|-------------------|-----------|-----------|-----------|----------|
| LCP               | 1200 ms   | 1450 ms   | +20.8%    | WARNING  |
| FID               | 50 ms     | 48 ms     | -4.0%     | OK       |
| CLS               | 0.05      | 0.06      | +0.01     | OK       |
| TTFB              | 180 ms    | 175 ms    | -2.8%     | OK       |
| Page Load         | 2100 ms   | 2300 ms   | +9.5%     | OK       |
| JS Bundle         | 245 KB    | 280 KB    | +14.3%    | WARNING  |
| CSS Bundle        | 38 KB     | 38 KB     | +0.0%     | OK       |
| Total Assets      | 520 KB    | 560 KB    | +7.7%     | OK       |
| Lighthouse Score  | 92        | 88        | -4 pts    | WARNING  |

Regressions: 3 warnings, 0 critical
```

If regressions are found, include recommendations:
- Large JS bundle → suggest code splitting, tree shaking, lazy loading
- Slow LCP → suggest image optimization, preloading critical assets
- High CLS → suggest explicit dimensions for images/embeds
- Slow TTFB → suggest caching, CDN, server-side optimization

---

## COMPLETION STATUS

| Status | When |
|--------|------|
| **DONE** | Measurements collected. No critical regressions. |
| **DONE_WITH_CONCERNS** | Warning-level regressions detected. |
| **BLOCKED** | Cannot measure (no build output, no URL, no tools). |
| **NEEDS_CONTEXT** | Need production URL or build directory from user. |

```bash
# End telemetry
apex_telemetry_end "${STATUS}"
```
