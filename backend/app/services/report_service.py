"""
Report service — Phase 6. Fetches client insights, renders HTML via Jinja2,
converts to PDF with WeasyPrint, uploads to S3, records a `reports` row.
n8n delivers the S3 download link to the client via Resend.
"""
import io
import logging
import uuid
from datetime import datetime, timezone

import asyncpg
import boto3
from botocore.exceptions import ClientError
from jinja2 import Environment, DictLoader

from app.config import settings

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# HTML template
# --------------------------------------------------------------------------- #

_REPORT_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         color: #111; margin: 40px; font-size: 14px; }
  h1   { font-size: 24px; color: #4f46e5; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
  h2   { font-size: 16px; color: #374151; margin-top: 32px; }
  .kpi { display: inline-block; background: #f9fafb; border: 1px solid #e5e7eb;
         border-radius: 8px; padding: 12px 20px; margin: 8px 8px 8px 0; }
  .kpi .val { font-size: 28px; font-weight: 700; color: #111; }
  .kpi .lbl { font-size: 11px; color: #6b7280; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th    { background: #f3f4f6; text-align: left; padding: 8px 12px; font-size: 12px; }
  td    { padding: 8px 12px; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px;
           font-size: 11px; font-weight: 600; }
  .badge-critical { background: #fee2e2; color: #991b1b; }
  .badge-high     { background: #fff7ed; color: #9a3412; }
  .badge-medium   { background: #fefce8; color: #92400e; }
  .badge-low      { background: #f3f4f6; color: #374151; }
  .narrative { background: #f9fafb; border-left: 3px solid #4f46e5;
               padding: 12px 16px; border-radius: 0 8px 8px 0; color: #374151; }
  footer { margin-top: 48px; font-size: 11px; color: #9ca3af;
           border-top: 1px solid #e5e7eb; padding-top: 12px; }
</style>
</head>
<body>
<h1>Weekly Intelligence Report — {{ client_name }}</h1>
<p style="color:#6b7280; font-size:12px;">
  Period: {{ period_start }} → {{ period_end }} &nbsp;|&nbsp; Generated: {{ generated_at }}
</p>

<h2>Voice-of-Customer Summary</h2>
{% if insight %}
<div>
  <div class="kpi"><div class="val">{{ "%.2f"|format(insight.sentiment_score|float) }}</div><div class="lbl">Sentiment Score</div></div>
  <div class="kpi"><div class="val">{{ "%.0f"|format(insight.urgency_score|float * 100) }}%</div><div class="lbl">Urgency</div></div>
  <div class="kpi"><div class="val" style="color:{% if insight.churn_risk|float > 0.25 %}#dc2626{% elif insight.churn_risk|float > 0.15 %}#d97706{% else %}#16a34a{% endif %};">
    {{ "%.0f"|format(insight.churn_risk|float * 100) }}%</div><div class="lbl">Churn Risk</div></div>
</div>
{% if insight.narrative %}
<p class="narrative">{{ insight.narrative }}</p>
{% endif %}
{% else %}
<p style="color:#9ca3af;">No VoC data for this period.</p>
{% endif %}

<h2>Competitive Signals ({{ signals|length }})</h2>
{% if signals %}
<table>
  <tr><th>Competitor</th><th>Type</th><th>Urgency</th><th>Source</th></tr>
  {% for s in signals %}
  <tr>
    <td>{{ s.competitor_name or '—' }}</td>
    <td>{{ s.signal_type or '—' }}</td>
    <td><span class="badge badge-{{ s.urgency or 'low' }}">{{ (s.urgency or 'low')|upper }}</span></td>
    <td style="font-size:11px;color:#6b7280;">{{ s.signal_source or '—' }}</td>
  </tr>
  {% endfor %}
</table>
{% else %}
<p style="color:#9ca3af;">No new competitive signals this week.</p>
{% endif %}

<h2>Journey Intelligence</h2>
{% if journeys %}
<table>
  <tr><th>Funnel Step</th><th>Drop-off</th><th>Friction</th><th>Recommendation</th></tr>
  {% for j in journeys %}
  <tr>
    <td>{{ j.funnel_step or '—' }}</td>
    <td>{{ "%.1f"|format(j.drop_off_rate|float * 100) }}%</td>
    <td>{{ j.friction_cause or '—' }}</td>
    <td style="font-size:12px;">{{ j.recommendation or '—' }}</td>
  </tr>
  {% endfor %}
</table>
{% else %}
<p style="color:#9ca3af;">No journey data for this period.</p>
{% endif %}

<footer>
  DataAutomated.io &nbsp;|&nbsp; Confidential — for authorized recipients only.
  This report was generated automatically. Unsubscribe or manage preferences at app.dataautomated.io/settings.
</footer>
</body>
</html>"""

_jinja_env = Environment(loader=DictLoader({"report": _REPORT_HTML}), autoescape=True)


# --------------------------------------------------------------------------- #
# Core generation function
# --------------------------------------------------------------------------- #

async def generate_report(
    conn: asyncpg.Connection,
    client_id: str,
    report_type: str = "weekly_intelligence",
    period: str = "last_7_days",
) -> dict:
    """
    Fetch client data, render PDF, upload to S3, insert reports row.
    Returns {"report_id": str, "s3_url": str, "status": "complete"}.
    """
    client_row = await conn.fetchrow(
        "SELECT id, name, email FROM clients WHERE id = $1 AND is_active = TRUE",
        uuid.UUID(client_id),
    )
    if not client_row:
        raise ValueError(f"Client {client_id} not found or inactive")

    now = datetime.now(timezone.utc)
    from datetime import timedelta
    if period == "last_7_days":
        period_start = now - timedelta(days=7)
    else:
        period_start = now - timedelta(days=30)
    period_end = now

    insight = await conn.fetchrow(
        """SELECT sentiment_score, urgency_score, churn_risk, narrative
           FROM feedback_insights
           WHERE client_id = $1 AND created_at >= $2
           ORDER BY created_at DESC LIMIT 1""",
        uuid.UUID(client_id),
        period_start,
    )

    signals = await conn.fetch(
        """SELECT competitor_name, signal_type, signal_source, urgency
           FROM competitive_signals
           WHERE client_id = $1 AND detected_at >= $2
           ORDER BY detected_at DESC LIMIT 20""",
        uuid.UUID(client_id),
        period_start,
    )

    journeys = await conn.fetch(
        """SELECT funnel_step, drop_off_rate, friction_cause, recommendation
           FROM journey_insights
           WHERE client_id = $1 AND created_at >= $2
           ORDER BY drop_off_rate DESC NULLS LAST LIMIT 10""",
        uuid.UUID(client_id),
        period_start,
    )

    html = _jinja_env.get_template("report").render(
        client_name=client_row["name"],
        period_start=period_start.date().isoformat(),
        period_end=period_end.date().isoformat(),
        generated_at=now.strftime("%Y-%m-%d %H:%M UTC"),
        insight=dict(insight) if insight else None,
        signals=[dict(r) for r in signals],
        journeys=[dict(r) for r in journeys],
    )

    pdf_bytes = _html_to_pdf(html)

    s3_key = f"{client_id}/{report_type}_{now.strftime('%Y%m%d')}.pdf"
    s3_url = _upload_to_s3(pdf_bytes, s3_key)

    report_id = str(uuid.uuid4())
    await conn.execute(
        """INSERT INTO reports (id, client_id, report_type, s3_key, period_start, period_end, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)""",
        uuid.UUID(report_id),
        uuid.UUID(client_id),
        report_type,
        s3_key,
        period_start,
        period_end,
        now,
    )

    logger.info("report generated client=%s id=%s", client_id, report_id)
    return {"report_id": report_id, "s3_url": s3_url, "status": "complete"}


# --------------------------------------------------------------------------- #
# PDF + S3 helpers
# --------------------------------------------------------------------------- #

def _html_to_pdf(html: str) -> bytes:
    try:
        from weasyprint import HTML
        return HTML(string=html).write_pdf()
    except ImportError:
        logger.warning("WeasyPrint not installed; returning HTML bytes as fallback")
        return html.encode("utf-8")


def _upload_to_s3(data: bytes, key: str) -> str:
    bucket = getattr(settings, "S3_REPORTS_BUCKET", "dataautomated-reports")
    region = getattr(settings, "AWS_REGION", "us-east-1")
    s3 = boto3.client("s3", region_name=region)
    content_type = "application/pdf" if data[:4] == b"%PDF" else "text/html"
    try:
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=io.BytesIO(data),
            ContentType=content_type,
            ContentDisposition=f'attachment; filename="{key.split("/")[-1]}"',
        )
        url = f"https://{bucket}.s3.{region}.amazonaws.com/{key}"
        return url
    except ClientError as exc:
        logger.error("S3 upload failed key=%s error=%s", key, exc)
        raise
