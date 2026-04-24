"""
main.py — FastAPI application entry point.

Key decisions:
- Lifespan (not deprecated @app.on_event) initialises the DB once on startup.
- CORSMiddleware reads the allowed origin from CORS_ORIGIN env var so the
  same binary can serve different front-end deployments without a rebuild.
- No auth middleware: intentional single-user design (see README § "No Auth").
- INSERT OR IGNORE implements idempotency: a duplicate UUID is silently
  swallowed and returns 200 so the client can distinguish new vs duplicate.
- SUM(amount) is done inside the SQL query (server-side total, constraint #7)
  to avoid pulling all rows into Python memory when paginating later.
"""

import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware

from database import get_db, init_db
from models import ExpenseCreate, ExpenseListResponse, ExpenseOut
from logger import logger
logger.info("Fenmo backend started")

# ---------------------------------------------------------------------------
# Configuration — all from environment (constraint #5)
# ---------------------------------------------------------------------------
CORS_ORIGIN: str = os.environ.get("CORS_ORIGIN", "http://localhost:5173")
logger.info("CORS_ORIGIN:----- %s", CORS_ORIGIN)

# ---------------------------------------------------------------------------
# Lifespan: replaces deprecated @app.on_event("startup")
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()          # create tables + indexes if they don't exist
    yield
    # nothing to teardown for SQLite


app = FastAPI(
    title="Fenmo — Personal Expense Tracker",
    description="Single-user expense tracker. No auth by design.",
    version="1.0.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS — constraint #6
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[CORS_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# POST /expenses
# ---------------------------------------------------------------------------
@app.post("/expenses", status_code=201)
def create_expense(payload: ExpenseCreate, response: Response):
    """
    Insert a new expense.

    Idempotency (constraint #2):
      INSERT OR IGNORE means a retry with the same UUID is a no-op.
      We detect this by checking rowcount and return 200 for duplicates.
    """
    created_at = datetime.now(timezone.utc).isoformat()

    with get_db() as db:
        cursor = db.execute(
            """
            INSERT OR IGNORE INTO expenses (id, amount, category, description, date, created_at)
            VALUES (:id, :amount, :category, :description, :date, :created_at)
            """,
            {
                "id": payload.id,
                "amount": payload.amount,          # paise integer
                "category": payload.category,
                "description": payload.description,
                "date": payload.date,
                "created_at": created_at,
            },
        )

    if cursor.rowcount == 0:
        # Duplicate UUID — override to 200 so the client distinguishes new vs retry.
        # FastAPI won't downgrade status_code automatically from a plain dict return;
        # injecting Response and setting .status_code is the correct override pattern.
        response.status_code = 200
        return {"status": "duplicate", "id": payload.id}

    # New row inserted → 201 (set by status_code above)
    return {"status": "created", "id": payload.id}


# ---------------------------------------------------------------------------
# GET /expenses
# ---------------------------------------------------------------------------
@app.get("/expenses", response_model=ExpenseListResponse)
def list_expenses(
    category: str | None = Query(default=None, description="Filter by category"),
    sort: str | None = Query(default="date_desc", description="date_desc | date_asc"),
):
    """
    Return expenses with optional filters plus server-side total (constraint #7).

    The total is computed in SQL with SUM(amount) in a single pass so no
    Python-level loop is needed and the number stays correct regardless of
    future pagination.
    """
    # Build WHERE clause dynamically to avoid SQL injection via parameterisation
    conditions: list[str] = []
    params: dict = {}

    if category:
        conditions.append("category = :category")
        params["category"] = category

    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    order_clause = "ORDER BY date ASC"
    if sort == "date_desc" or sort is None:
        order_clause = "ORDER BY date DESC, created_at DESC"
    elif sort == "date_asc":
        order_clause = "ORDER BY date ASC, created_at ASC"

    with get_db() as db:
        # Fetch filtered rows
        rows = db.execute(
            f"SELECT * FROM expenses {where_clause} {order_clause}",
            params,
        ).fetchall()

        # Server-side total in paise — single SQL aggregation (constraint #7)
        total_row = db.execute(
            f"SELECT COALESCE(SUM(amount), 0) AS total FROM expenses {where_clause}",
            params,
        ).fetchone()

    expenses = [ExpenseOut(**dict(row)) for row in rows]
    total: int = total_row["total"]

    return ExpenseListResponse(expenses=expenses, total=total)


# ---------------------------------------------------------------------------
# Health check (useful for Render zero-downtime deploys)
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    return {"status": "ok"}
