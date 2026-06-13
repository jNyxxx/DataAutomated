# Load Testing Plan

> **Status:** AUTHORED — UNVERIFIED (no live AWS access). Plans are based on CLAUDE.md §16 performance targets. Validate against actual deployed infrastructure.

---

## Performance Targets (CLAUDE.md §16)

| Endpoint / Process | Target | Test Scenario |
|---|---|---|
| `GET /api/dashboard/summary` | < 300 ms p99 | 50 concurrent authenticated users |
| `POST /api/agents/voc/run` (trigger, not the run itself) | < 100 ms | 20 concurrent triggers |
| `GET /insights/latest` | < 500 ms | 50 concurrent users |
| VoC agent full run (500 items) | < 60 s | 10 concurrent runs across clients |
| CompSig agent full run | < 45 s | 10 concurrent runs |
| Next.js dashboard page load | < 1.5 s | 50 concurrent users |

---

## Tooling

- **k6** (recommended): open-source, JS scripting, native HTTP/2, good CI integration
- **Locust** (alternative): Python, useful for agent-run tests with variable think-time
- **Artillery**: good for SSE streaming tests

Install k6: https://k6.io/docs/get-started/installation/

---

## Test Scenarios

### 1. Authentication Load

```javascript
// k6/auth-load.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 20,
  duration: '2m',
  thresholds: { http_req_duration: ['p(99)<500'] },
};

const BASE = __ENV.BASE_URL || 'http://localhost:8000';

export default function () {
  const res = http.post(`${BASE}/auth/token`,
    'username=demo%40dataautomated.io&password=demopw2025',
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  check(res, { 'login 200': (r) => r.status === 200 });
  sleep(1);
}
```

**Target:** 0 rate-limit hits at 20 VUs (rate limiter allows 10/min per IP — run from multiple source IPs in production load test to avoid hitting per-IP limit from a single k6 runner).

---

### 2. Dashboard Summary Load (core latency test)

```javascript
// k6/dashboard-load.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '2m',  target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<300', 'p(99)<500'],
    http_req_failed:   ['rate<0.01'],
  },
};

const BASE = __ENV.BASE_URL || 'http://localhost:8000';
const TOKEN = __ENV.JWT_TOKEN;  // pre-issued admin token

export default function () {
  const res = http.get(`${BASE}/api/dashboard/summary`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  check(res, {
    'status 200': (r) => r.status === 200,
    '< 300ms':   (r) => r.timings.duration < 300,
  });
  sleep(0.5);
}
```

---

### 3. Agent Trigger Throughput

```javascript
// k6/agent-trigger.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 20,
  iterations: 100,
  thresholds: { http_req_duration: ['p(99)<100'] },
};

const BASE  = __ENV.BASE_URL || 'http://localhost:8000';
const TOKEN = __ENV.JWT_TOKEN;

export default function () {
  const res = http.post(`${BASE}/api/agents/voc/run`, null, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  check(res, {
    'status 202': (r) => r.status === 202,
    'queued':     (r) => JSON.parse(r.body).status === 'analysis_queued',
    '< 100ms':   (r) => r.timings.duration < 100,
  });
}
```

---

### 4. SSE Streaming Connections

```javascript
// k6/sse-connections.js — tests the SSE ticket + stream connection
// k6 doesn't support SSE natively; use Artillery or a custom script
// UNVERIFIED: requires artillery + artillery-engine-sse
```

Test plan:
- 100 concurrent SSE connections, each holding for 30 s
- Each connection first POSTs to `/api/sse-ticket` (via backend proxy) then connects to `/stream/insights?ticket=...`
- Verify the backend handles 100 open connections without memory leak

---

### 5. Webhook Ingestion Burst

```javascript
// k6/webhook-burst.js
import http from 'k6/http';
import { check } from 'k6';
import crypto from 'k6/crypto';
import encoding from 'k6/encoding';

export const options = {
  vus: 10,
  duration: '1m',
  thresholds: { http_req_duration: ['p(99)<500'], http_req_failed: ['rate<0.01'] },
};

const BASE   = __ENV.BASE_URL || 'http://localhost:8000';
const SECRET = __ENV.ZENDESK_SECRET;
const CLIENT = __ENV.TEST_CLIENT_ID;

export default function () {
  const ts   = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ ticket: { id: `load-${Date.now()}`, description: 'Load test feedback', status: 'open' } });
  const raw  = crypto.hmac('sha256', `${ts}${body}`, SECRET, 'binary');
  const sig  = encoding.b64encode(raw);

  const res = http.post(`${BASE}/webhook/zendesk?client_id=${CLIENT}`, body, {
    headers: {
      'Content-Type': 'application/json',
      'x-zendesk-webhook-signature': sig,
      'x-zendesk-webhook-signature-timestamp': ts,
    },
  });
  check(res, { 'accepted': (r) => r.status === 200 });
}
```

**Expected:** all requests < 500 ms; rate limiter (60/min/IP) fires only if a single IP exceeds burst.

---

## Running Tests

```bash
# Install k6
winget install k6 --source winget   # Windows
# OR: brew install k6               # macOS

# Set env vars
export BASE_URL="http://localhost:8000"
export JWT_TOKEN="your-admin-token-here"
export TEST_CLIENT_ID="your-test-client-uuid"

# Run dashboard load test
k6 run k6/dashboard-load.js

# Run against production (use a dedicated test client)
k6 run -e BASE_URL=http://dataautomated-alb.ap-southeast-2.elb.amazonaws.com:8000 \
       -e JWT_TOKEN="$PROD_ADMIN_TOKEN" \
       k6/dashboard-load.js
```

---

## AWS WAF Rate-Based Rules (deferred — no AWS WAF configured)

Once WAF is added to the ALB, configure:
- `/auth/token`: 100 req / 5 min / IP (distributed rate limiting — replaces in-process limiter)
- `/webhook/*`: 500 req / 1 min / IP
- `/api/agents/*/run`: 60 req / 1 min / IP

The current in-process rate limiter (`SecurityMiddleware` in `main.py`) is per-ECS-task. At 10 tasks, up to 10× the configured limit can actually pass. AWS WAF solves this for production.

---

## Scale Readiness Test (CLAUDE.md Prime Directive — 100/500 clients)

**100-client simulation:**
- 100 unique client JWTs, each making 10 req/s to `/api/dashboard/summary`
- Total: 1,000 req/s
- ECS auto-scale should trigger at ~3–4 backend tasks
- RDS connections should stay < 80% of max (db.t4g.medium: 171 max connections)

**500-client simulation:**
- Requires 5,000 req/s steady state
- ECS: 10 tasks maximum (current auto-scale ceiling)
- RDS: likely needs upgrade to `db.t4g.large` (342 connections) + PgBouncer connection pooler
- This simulation requires coordinating with the AWS team — tag as pre-launch milestone
