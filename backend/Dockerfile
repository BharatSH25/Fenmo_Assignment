# ── Dockerfile (backend) ────────────────────────────────────────────────────
#
# Why multi-stage? The builder stage installs wheel deps into /install;
# the runtime stage copies only the compiled wheels — no pip, no build tools,
# smaller final image (~120 MB vs ~350 MB).
#
# Why python:3.12-slim? Slim strips docs + locales. Alpine would be smaller
# but causes cryptic glibc issues with some compiled Python wheels.
# ────────────────────────────────────────────────────────────────────────────

# ── Stage 1: build dependencies ─────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build
COPY requirements.txt .

RUN pip install --upgrade pip \
 && pip install --prefix=/install --no-cache-dir -r requirements.txt


# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

# Create a non-root user for security
RUN addgroup --system app && adduser --system --ingroup app app

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application source
COPY . .

# /data is the mount point for the Render persistent disk.
# DB_PATH should be set to /data/fenmo.db in production.
RUN mkdir -p /data && chown app:app /data

USER app

# Uvicorn listens on 0.0.0.0:8000 inside the container.
# Render maps its own PORT to this — no nginx needed for a single process.
EXPOSE 8000

# --workers 1 is intentional: SQLite is file-locked; multiple workers would
# fight over the WAL file. For higher traffic, swap SQLite for Postgres and
# increase workers.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
