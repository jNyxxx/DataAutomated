# DataAutomated.io backend — FastAPI on Python 3.11 (CLAUDE.md §15, ADR-008).
# One container per service; stateless; serves on :8000.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# WeasyPrint (PDF reports) needs Pango/HarfBuzz native libs + fonts (CLAUDE.md §13 W3).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpango-1.0-0 \
        libpangoft2-1.0-0 \
        libharfbuzz-subset0 \
        fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first for layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code.
COPY app ./app
COPY pytest.ini .
COPY tests ./tests

EXPOSE 8000

# Local dev overrides this with --reload via docker-compose; prod uses --workers.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
