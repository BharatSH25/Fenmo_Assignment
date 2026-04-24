"""
database.py — SQLite connection factory.

Design decisions:
- load_dotenv() is called at module import time so that a local .env file is
  picked up before any os.environ.get() calls resolve. In Docker/production
  the env vars are injected directly and load_dotenv() is a harmless no-op.
- WAL (Write-Ahead Logging) is enabled so reads never block writes and
  vice-versa. Critical for a web server that may handle concurrent requests
  even in single-user mode (constraint #3).
- DB_PATH comes from the environment so the same image works locally
  (./fenmo.db) and in production (a Render persistent disk mount).
  Constraint #5: never hardcode paths.
- No auth / user table: this is intentionally a single-user tool.
  See README § "No Auth" for rationale.
"""

import os
import sqlite3
from contextlib import contextmanager

from dotenv import load_dotenv

# Load .env file in local dev; no-op in Docker where vars are injected.
load_dotenv()

# ---------------------------------------------------------------------------
# Configuration — never hardcode paths (constraint #5)
# ---------------------------------------------------------------------------
DB_PATH: str = os.environ.get("DB_PATH", "./fenmo.db")


def get_raw_connection() -> sqlite3.Connection:
    """Open a SQLite connection and immediately enable WAL mode."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row          # rows behave like dicts
    conn.execute("PRAGMA journal_mode=WAL") # constraint #3
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_db():
    """
    Context manager — yields a connection, commits on success, rolls back on
    exception, always closes.

    Usage in a route:
        with get_db() as db:
            db.execute(...)
    """
    conn = get_raw_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    """
    Create tables and indexes on startup if they don't exist.
    Called once from main.py lifespan handler.
    """
    with get_db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS expenses (
                id          TEXT    PRIMARY KEY,   -- client-generated UUID (idempotency key)
                amount      INTEGER NOT NULL,       -- stored in PAISE (rupees × 100), never float
                category    TEXT    NOT NULL,
                description TEXT    NOT NULL,
                date        TEXT    NOT NULL,       -- ISO-8601 date string e.g. "2024-05-15"
                created_at  TEXT    NOT NULL        -- ISO-8601 datetime, server-assigned
            )
            """
        )
        # Index for the common filter + sort query
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date DESC)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)"
        )
