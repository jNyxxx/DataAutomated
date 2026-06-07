# DataAutomated.io backend — FastAPI on Python 3.11 (CLAUDE.md §15, ADR-008).
# One container per service; stateless; serves on :8000.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

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
