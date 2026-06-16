#!/usr/bin/env python3
"""
Load test — DataAutomated.io backend (CLAUDE.md §16 Phase 12).

Hits key endpoints at configurable concurrency levels, measures p50/p95 latency,
and asserts against the §16 performance targets:
  GET  /api/dashboard/summary   p95 < 300 ms
  POST /insights/analyze        p95 < 100 ms  (async trigger — returns immediately)

Usage (run from project root or backend/):
    python backend/tests/load/run_load_test.py

Environment:
    LOAD_TEST_BASE_URL       Backend origin         (default: http://localhost:8000)
    LOAD_TEST_EMAIL          Login email            (default: empty — skips auth endpoints)
    LOAD_TEST_PASSWORD       Login password         (default: empty)
    LOAD_TEST_SAMPLES        Requests per endpoint per level  (default: 100)
    LOAD_TEST_CONCURRENCY    Comma-separated levels (default: 10,50,100)
    LOAD_TEST_TIMEOUT_S      Per-request timeout s  (default: 10)

Exit codes:
    0 — server reachable; all p95 targets met
    1 — server unreachable, auth failed, or one or more p95 targets missed
"""
from __future__ import annotations

import asyncio
import os
import statistics
import sys
import time
from dataclasses import dataclass, field

import httpx

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BASE_URL    = os.environ.get("LOAD_TEST_BASE_URL", "http://localhost:8000").rstrip("/")
EMAIL       = os.environ.get("LOAD_TEST_EMAIL", "")
PASSWORD    = os.environ.get("LOAD_TEST_PASSWORD", "")
SAMPLE_SIZE = int(os.environ.get("LOAD_TEST_SAMPLES", "100"))
CONCURRENCY = [int(x) for x in os.environ.get("LOAD_TEST_CONCURRENCY", "10,50,100").split(",")]
TIMEOUT     = float(os.environ.get("LOAD_TEST_TIMEOUT_S", "10"))

# p95 targets from CLAUDE.md §16 (ms). None = no official target (measured but not asserted).
P95_TARGETS: dict[str, float | None] = {
    "GET /health":                     50.0,
    "POST /auth/token":              None,    # bcrypt; no official ms target
    "GET /api/dashboard/summary":     300.0,  # §16 hard target
    "GET /insights/latest":           300.0,  # use dashboard ceiling
    "GET /signals/overview":          300.0,  # use dashboard ceiling
    "POST /insights/analyze":         100.0,  # §16 hard target (async trigger)
}


# ---------------------------------------------------------------------------
# Data types
# ---------------------------------------------------------------------------

@dataclass
class EndpointSpec:
    label: str
    method: str        # "GET" | "POST"
    path: str
    form_data: dict[str, str] | None = None
    needs_auth: bool = True


@dataclass
class Sample:
    latency_ms: float
    status: int


@dataclass
class LevelResult:
    label: str
    concurrency: int
    samples: list[Sample] = field(default_factory=list)
    total: int = 0

    @property
    def ok_count(self) -> int:
        return len(self.samples)

    @property
    def error_count(self) -> int:
        return self.total - self.ok_count

    @property
    def latencies(self) -> list[float]:
        return [s.latency_ms for s in self.samples]

    def p(self, pct: float) -> float | None:
        """Return the pct-th percentile latency, or None if no data."""
        lat = sorted(self.latencies)
        if not lat:
            return None
        idx = max(0, int(pct / 100.0 * len(lat)) - 1)
        return lat[idx]

    def p50(self) -> float | None:
        return statistics.median(self.latencies) if self.latencies else None

    def p95(self) -> float | None:
        return self.p(95)

    def min_ms(self) -> float | None:
        return min(self.latencies) if self.latencies else None

    def max_ms(self) -> float | None:
        return max(self.latencies) if self.latencies else None


# ---------------------------------------------------------------------------
# HTTP execution
# ---------------------------------------------------------------------------

async def _one_request(
    client: httpx.AsyncClient,
    spec: EndpointSpec,
    token: str | None,
) -> Sample | None:
    """Execute a single request; return a Sample, or None on network/timeout error."""
    headers: dict[str, str] = {}
    if spec.needs_auth and token:
        headers["Authorization"] = f"Bearer {token}"

    url = BASE_URL + spec.path
    t0 = time.perf_counter()
    try:
        if spec.method == "GET":
            resp = await client.get(url, headers=headers, timeout=TIMEOUT)
        else:
            if spec.form_data:
                resp = await client.post(url, data=spec.form_data, timeout=TIMEOUT)
            else:
                resp = await client.post(url, headers=headers, timeout=TIMEOUT)
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        return Sample(latency_ms=elapsed_ms, status=resp.status_code)
    except Exception:
        return None


async def benchmark(
    spec: EndpointSpec,
    token: str | None,
    n: int,
    concurrency: int,
) -> LevelResult:
    """Run `n` requests with at most `concurrency` in-flight; return a LevelResult."""
    result = LevelResult(label=spec.label, concurrency=concurrency, total=n)
    sem = asyncio.Semaphore(concurrency)

    async def guarded() -> Sample | None:
        async with sem:
            return await _one_request(client, spec, token)

    async with httpx.AsyncClient() as client:
        raw = await asyncio.gather(*[guarded() for _ in range(n)])

    result.samples = [s for s in raw if s is not None]
    return result


# ---------------------------------------------------------------------------
# Auth helper
# ---------------------------------------------------------------------------

async def acquire_token() -> str | None:
    """Login once and return the JWT; returns None if credentials are absent or auth fails."""
    if not EMAIL or not PASSWORD:
        return None
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{BASE_URL}/auth/token",
                data={"username": EMAIL, "password": PASSWORD},
                timeout=15.0,
            )
            if resp.status_code == 200:
                return resp.json().get("access_token")
            print(f"  [auth] login returned HTTP {resp.status_code} — authenticated endpoints skipped.")
        except Exception as exc:
            print(f"  [auth] login failed: {exc} — authenticated endpoints skipped.")
    return None


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

_COL = {
    "ok":   "ok  ",
    "fail": "FAIL",
    "skip": "n/a ",
}

def _fmt(ms: float | None, width: int = 7) -> str:
    return f"{ms:>{width}.1f}" if ms is not None else f"{'—':>{width}}"


def print_table(results: list[LevelResult]) -> list[str]:
    """Print a result table; return list of failed target labels."""
    failed: list[str] = []

    # Group by concurrency level
    levels: dict[int, list[LevelResult]] = {}
    for r in results:
        levels.setdefault(r.concurrency, []).append(r)

    header = f"  {'Endpoint':<35} {'p50':>7} {'p95':>7} {'min':>7} {'max':>7}  {'Target':>8}  {'Pass':>4}  {'Err':>5}"
    sep = "  " + "-" * (len(header) - 2)

    for c in sorted(levels.keys()):
        print(f"\nConcurrency: {c} users | {SAMPLE_SIZE} samples per endpoint")
        print(sep)
        print(header)
        print(sep)
        for r in levels[c]:
            p50 = r.p50()
            p95 = r.p95()
            target = P95_TARGETS.get(r.label)
            if target is None:
                status_icon = _COL["skip"]
                target_str = "—"
            elif p95 is not None and p95 <= target:
                status_icon = _COL["ok"]
                target_str = f"{target:.0f}ms"
            else:
                status_icon = _COL["fail"]
                target_str = f"{target:.0f}ms"
                if p95 is not None:
                    failed.append(f"{r.label} @c={c}: p95={p95:.1f}ms > {target:.0f}ms")

            err_str = f"{r.error_count}/{r.total}" if r.error_count > 0 else f"0/{r.total}"
            print(
                f"  {r.label:<35}"
                f"{_fmt(p50)}"
                f"{_fmt(p95)}"
                f"{_fmt(r.min_ms())}"
                f"{_fmt(r.max_ms())}"
                f"  {target_str:>8}"
                f"  {status_icon}"
                f"  {err_str:>7}"
            )
        print(sep)

    return failed


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main() -> int:
    print("=" * 70)
    print("  DataAutomated.io  Backend Load Test  (CLAUDE.md s16)")
    print(f"  Server: {BASE_URL}")

    # Verify server is reachable before running the full suite
    try:
        async with httpx.AsyncClient() as c:
            resp = await c.get(f"{BASE_URL}/health", timeout=5.0)
        print(f"  Health: HTTP {resp.status_code}  server reachable")
    except Exception as exc:
        print(f"  ERROR: server not reachable at {BASE_URL}: {exc}")
        return 1

    # Authenticate
    token = await acquire_token()
    auth_status = f"ok ({EMAIL})" if token else "none  (set LOAD_TEST_EMAIL + LOAD_TEST_PASSWORD)"
    print(f"  Auth:   {auth_status}")
    print("=" * 70)

    # Build endpoint list
    specs: list[EndpointSpec] = [
        EndpointSpec("GET /health",                "GET",  "/health",               needs_auth=False),
        EndpointSpec("GET /api/dashboard/summary", "GET",  "/api/dashboard/summary"),
        EndpointSpec("GET /insights/latest",       "GET",  "/insights/latest"),
        EndpointSpec("GET /signals/overview",      "GET",  "/signals/overview?period=last_7_days"),
        EndpointSpec("POST /insights/analyze",     "POST", "/insights/analyze"),
    ]
    if EMAIL and PASSWORD:
        specs.insert(1, EndpointSpec(
            "POST /auth/token", "POST", "/auth/token",
            form_data={"username": EMAIL, "password": PASSWORD},
            needs_auth=False,
        ))

    # Run benchmarks
    all_results: list[LevelResult] = []
    total_runs = len(specs) * len(CONCURRENCY)
    run_num = 0
    for c in CONCURRENCY:
        for spec in specs:
            run_num += 1
            skip = spec.needs_auth and not token
            if skip:
                print(f"  [{run_num}/{total_runs}] SKIP {spec.label} (no token)", flush=True)
                continue
            print(f"  [{run_num}/{total_runs}] {spec.label}  c={c}  n={SAMPLE_SIZE}...", end="", flush=True)
            result = await benchmark(spec, token, SAMPLE_SIZE, c)
            all_results.append(result)
            p95 = result.p95()
            print(f"  p95={p95:.1f}ms  errors={result.error_count}" if p95 else "  no data")

    # Print summary table
    if not all_results:
        print("\n  No results collected.")
        return 1

    print()
    failed = print_table(all_results)

    # Print failures
    if failed:
        print(f"\n  TARGETS MISSED ({len(failed)}):")
        for msg in failed:
            print(f"    FAIL  {msg}")
        return 1

    print(f"\n  All p95 targets met.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
