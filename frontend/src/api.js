/**
 * api.js — single source of truth for all HTTP calls.
 *
 * Why centralise here?
 *   - Base URL comes from import.meta.env.VITE_API_URL (constraint #5).
 *     Vite replaces import.meta.env at build time, so the production bundle
 *     is baked with the correct Render URL without runtime window.ENV hacks.
 *   - Both functions throw on non-2xx so callers can catch uniformly.
 *   - No axios: the native fetch API keeps the bundle smaller and has no
 *     extra maintenance surface for a project this size.
 */

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

/**
 * Fetch expenses, optionally filtered by category and sorted.
 *
 * @param {{ category?: string, sort?: string }} filters
 * @returns {Promise<{ expenses: Expense[], total: number }>}
 *   `total` is in PAISE — convert to rupees in the component.
 */
export async function getExpenses({ category = "", sort = "date_desc" } = {}) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (sort) params.set("sort", sort);

  const url = `${BASE_URL}/expenses${params.size ? "?" + params.toString() : ""}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `GET /expenses failed: ${res.status}`);
  }

  return res.json(); // { expenses: [...], total: <paise integer> }
}

/**
 * Create a new expense.
 *
 * @param {{
 *   id: string,        // client UUID (idempotency key)
 *   amount: number,    // PAISE integer
 *   category: string,
 *   description: string,
 *   date: string,      // ISO-8601 "YYYY-MM-DD"
 * }} payload
 * @returns {Promise<{ status: "created" | "duplicate", id: string }>}
 */
export async function createExpense(payload) {
  const res = await fetch(`${BASE_URL}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // 201 = new, 200 = duplicate (idempotent retry) — both are success
  if (res.status !== 201 && res.status !== 200) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `POST /expenses failed: ${res.status}`);
  }

  return res.json();
}
