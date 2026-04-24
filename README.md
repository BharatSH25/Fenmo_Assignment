# Fenmo — Personal Expense Tracker

A production-quality personal finance tool built with **React + Vite** (frontend), **FastAPI** (backend), and **SQLite** (persistence). Designed for a single user — fast, private, no login required.

---

## Table of Contents

1. [Local Setup](#1-local-setup)
2. [Project Structure](#2-project-structure)
3. [Design Decisions](#3-design-decisions)
4. [API Reference](#4-api-reference)
5. [Deployment](#5-deployment)
6. [Trade-offs & Future Work](#6-trade-offs--future-work)

---

## 1. Local Setup

### Prerequisites

| Tool | Minimum version |
|------|----------------|
| Python | 3.12 |
| Node.js | 20 LTS |
| npm | 10 |

### Backend

```bash
cd backend

# Copy env template
cp .env.example .env          # edit DB_PATH and CORS_ORIGIN if needed

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate     # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the dev server (auto-reloads on file save)
uvicorn main:app --reload --port 8000
```

The API is now live at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`.

### Frontend

```bash
cd frontend

# Copy env template
cp .env.example .env          # set VITE_API_URL=http://localhost:8000

# Install and run
npm install
npm run dev
```

The app is now live at `http://localhost:5173`.

---

## 2. Project Structure

```
fenmo/
├── backend/
│   ├── database.py       # SQLite connection factory + WAL setup + init_db()
│   ├── models.py         # Pydantic request/response schemas
│   ├── main.py           # FastAPI app, routes, CORS, lifespan
│   ├── Dockerfile        # Multi-stage build for Render deployment
│   ├── requirements.txt  # Pinned Python dependencies
│   └── .env.example      # Environment variable template
│
├── frontend/
│   ├── src/
│   │   ├── api.js                        # getExpenses / createExpense
│   │   ├── App.jsx                       # Root — owns all shared state
│   │   ├── index.css                     # Design system (CSS custom properties)
│   │   ├── main.jsx                      # Vite entry point
│   │   └── components/
│   │       ├── ExpenseForm.jsx           # Add expense form (UUID idempotency)
│   │       ├── FilterBar.jsx             # Category + sort controls
│   │       └── ExpenseTable.jsx          # Expense list + total row
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── .env.example
│
├── .gitignore
└── README.md
```

---

## 3. Design Decisions

### 3.1 Money as Integer Paise (never float)

**Problem:** Floating-point arithmetic is fundamentally unsuitable for money.
`0.1 + 0.2 === 0.30000000000000004` in IEEE 754. Accumulate enough of these
and totals drift.

**Solution:** The database stores amounts as `INTEGER` paise (`rupees × 100`).
The backend never performs arithmetic on floats. The frontend converts:

- **Input → wire:** `Math.round(parseFloat(rupees) * 100)` — integer paise sent to API
- **Wire → display:** `(paise / 100).toLocaleString("en-IN", { style: "currency", currency: "INR" })` — formatting only, never stored

SQLite's `SUM()` on integers is exact. No rounding errors ever accumulate.

### 3.2 UUID Idempotency (safe retries & double-submits)

**Problem:** Network blips can cause a form submission to time out *after* the
server has already persisted the row. A naive retry would create a duplicate.

**Solution:**

1. `ExpenseForm` generates a UUID via `crypto.randomUUID()` when it mounts.
   The UUID lives in a `useRef` so it is stable across re-renders.
2. The UUID is sent as the row's primary key (`id` field) on every POST.
3. The backend uses `INSERT OR IGNORE` — a duplicate UUID is silently dropped.
4. The server returns `200` for duplicates and `201` for new rows so the
   frontend can distinguish them.
5. The UUID is **only regenerated after a confirmed `201`**. On error the
   same UUID is kept — the next retry is therefore always safe.

### 3.3 SQLite WAL Mode

```sql
PRAGMA journal_mode=WAL;
```

Default SQLite uses a *rollback journal* that locks the entire file for every
write, blocking all readers. WAL (Write-Ahead Logging) allows:

- **Concurrent reads** during a write — no blocking
- **Faster commits** — writers append to the WAL file, not the main DB
- **Crash safety** — WAL is an append-only log; recovery is trivial

For a single-user tool this matters less, but FastAPI's async worker can
still issue reads and writes "at the same time" from different coroutines.
WAL prevents spurious `database is locked` errors.

> **Important:** We intentionally run with `--workers 1` in the Dockerfile.
> SQLite's WAL handles read concurrency well, but multiple *processes* writing
> the same file simultaneously is unsafe. If you ever need more throughput,
> swap SQLite for PostgreSQL and remove the worker limit.

### 3.4 Server-Side Total

`GET /expenses` returns `{ expenses, total }` where `total` is computed in SQL:

```sql
SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE ...
```

**Why not sum in JavaScript?**

- The total must match the *filtered* set, not the full dataset
- A future pagination feature would break a client-side sum (you'd only total
  the current page, not all matching rows)
- One SQL pass is faster than shipping all rows to the client just to sum them

### 3.5 No Authentication

This is an **intentional** design choice documented in every relevant file.

Adding auth (JWT, sessions, OAuth) for a single-user local tool would:
- Add ~500 lines of boilerplate (token refresh, middleware, user table)
- Create a new attack surface (token theft, CSRF)
- Provide zero security benefit if the tool never leaves your machine

If you later want to expose this to the internet, add auth at that point.
The recommended approach would be to add an API key header checked in a
FastAPI dependency, or put Nginx + htpasswd in front.

### 3.6 Environment Variables for Config

All deployment-specific values — `DB_PATH` and `CORS_ORIGIN` on the backend,
`VITE_API_URL` on the frontend — come exclusively from environment variables.
This means the same Docker image can serve development, staging, and production
without a rebuild (12-factor app principle).

---

## 4. API Reference

### `POST /expenses`

Create an expense. Idempotent — retrying with the same `id` is safe.

**Request body**

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | UUID generated by the client |
| `amount` | integer | **Paise** (rupees × 100). Must be > 0 |
| `category` | string | Non-empty |
| `description` | string | Non-empty |
| `date` | string | ISO-8601 `"YYYY-MM-DD"` |

**Responses**

| Status | Meaning |
|--------|---------|
| `201` | New expense created |
| `200` | Duplicate UUID — already saved, safe to ignore |
| `422` | Validation error (see `detail` field) |

---

### `GET /expenses`

Fetch expenses with optional filters and the filtered total.

**Query params**

| Param | Type | Default | Notes |
|-------|------|---------|-------|
| `category` | string | — | Filter to a single category |
| `sort` | string | `date_desc` | `date_desc` or `date_asc` |

**Response**

```jsonc
{
  "expenses": [
    {
      "id": "uuid",
      "amount": 25050,        // paise
      "category": "Food & Drink",
      "description": "Lunch",
      "date": "2024-05-15",
      "created_at": "2024-05-15T08:23:11.456Z"
    }
  ],
  "total": 25050             // paise — sum of filtered rows, server-computed
}
```

---

### `GET /health`

Returns `{ "status": "ok" }`. Used by Render for zero-downtime deploy checks.

---

## 5. Deployment

### Frontend → Vercel

1. Push the repo to GitHub.
2. Import the project in Vercel. Set **Root Directory** to `frontend`.
3. Add environment variable:
   ```
   VITE_API_URL = https://your-app.onrender.com
   ```
4. Vercel auto-detects Vite — no build command changes needed.

### Backend → Render

1. Create a new **Web Service** in Render. Point it at the `backend/` directory
   and select **Docker** as the runtime.
2. Add environment variables:
   ```
   DB_PATH     = /data/fenmo.db
   CORS_ORIGIN = https://fenmo.vercel.app
   ```
3. Attach a **Persistent Disk** and mount it at `/data`.
   This ensures the SQLite file survives redeploys (Render's ephemeral
   filesystem is wiped on every deploy).
4. Render will build the Dockerfile and run the container automatically.

> **Why a persistent disk for SQLite?**  
> Render (and most PaaS platforms) use ephemeral file systems — the disk is
> reset on every deploy. Your SQLite file would be deleted on every push
> without a persistent disk mounted at a stable path.

### CORS checklist

After deployment, make sure:
- `CORS_ORIGIN` on Render = exact Vercel URL (`https://fenmo.vercel.app`)
- `VITE_API_URL` on Vercel = exact Render URL (`https://fenmo.onrender.com`)
- Both URLs have **no trailing slash**

---

## 6. Trade-offs & Future Work

| Topic | Current choice | When to change |
|-------|---------------|----------------|
| **Database** | SQLite (single file) | Swap for PostgreSQL when you need multiple users or horizontal scaling |
| **Workers** | 1 uvicorn worker | Increase only after switching to Postgres |
| **Auth** | None (intentional) | Add API key or OAuth when exposing to the internet |
| **Pagination** | All rows returned | Add `?limit=&offset=` params once you have hundreds of expenses |
| **Categories** | Hardcoded list in form | Move to a `categories` table with a CRUD endpoint |
| **Sorting** | Date only | Add amount and category sort options |
| **Charts** | Not implemented | Add a recharts / Chart.js summary bar chart per category |
| **Export** | Not implemented | Add `GET /expenses/export.csv` endpoint |
| **Tests** | Not included | Add pytest + httpx for backend, Vitest + Testing Library for frontend |
