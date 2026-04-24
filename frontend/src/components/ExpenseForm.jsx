/**
 * ExpenseForm.jsx
 *
 * Key behaviours:
 *
 * 1. UUID on mount (constraint #2)
 *    useRef holds the UUID so it survives re-renders without triggering them.
 *    crypto.randomUUID() is available in all modern browsers and Node ≥ 14.
 *
 * 2. Paise conversion
 *    The user types rupees (e.g. "250.50"). We multiply × 100 and round to
 *    an integer before sending — never send a float to the API.
 *
 * 3. Idempotent retry
 *    On error the button re-enables and the UUID stays the same.
 *    The server will INSERT OR IGNORE the same UUID so retrying is always safe.
 *    Only after a 201 success do we call regenerateId() to mint a fresh UUID.
 *
 * 4. No optimistic update
 *    We refetch from the server after success so the computed total (which
 *    the server owns) is always authoritative.
 */

import { useRef, useState } from "react";
import { createExpense } from "../api";

const CATEGORIES = [
  "Food & Drink",
  "Transport",
  "Utilities",
  "Shopping",
  "Health",
  "Entertainment",
  "Rent",
  "Other",
];

function generateId() {
  return crypto.randomUUID();
}

export default function ExpenseForm({ onSuccess }) {
  // ── UUID: lives in a ref — stable across renders, reset only on success ──
  const idRef = useRef(generateId());

  const [form, setForm] = useState({
    amount: "",
    category: CATEGORIES[0],
    description: "",
    date: new Date().toISOString().slice(0, 10), // default today
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    // ── Paise conversion: multiply rupees × 100, strip floating point noise ──
    const rupees = parseFloat(form.amount);
    if (isNaN(rupees) || rupees <= 0) {
      setError("Enter a valid amount greater than ₹0");
      return;
    }
    const amountPaise = Math.round(rupees * 100); // integer paise

    const payload = {
      id: idRef.current, // same UUID until success
      amount: amountPaise,
      category: form.category,
      description: form.description.trim(),
      date: form.date,
    };

    setSubmitting(true); // disable button — constraint #2

    try {
      const result = await createExpense(payload);

      if (result.status === "created" || result.status === "duplicate") {
        // ── Success: reset form + regenerate UUID + refetch ──────────────────
        idRef.current = generateId(); // fresh UUID for the next expense
        setForm({
          amount: "",
          category: CATEGORIES[0],
          description: "",
          date: new Date().toISOString().slice(0, 10),
        });
        onSuccess(); // triggers refetch in App.jsx
      }
    } catch (err) {
      // ── Error: re-enable button; same UUID = safe to retry ───────────────
      setError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card form-card">
      <h2 className="section-title">Add Expense</h2>

      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="expense-form" noValidate>
        {/* Amount */}
        <div className="field-group">
          <label htmlFor="amount" className="field-label">
            Amount (₹)
          </label>
          <div className="input-prefix-wrap">
            <span className="input-prefix">₹</span>
            <input
              id="amount"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={handleChange}
              className="field-input input-with-prefix"
              required
              disabled={submitting}
            />
          </div>
        </div>

        {/* Category */}
        <div className="field-group">
          <label htmlFor="category" className="field-label">
            Category
          </label>
          <select
            id="category"
            name="category"
            value={form.category}
            onChange={handleChange}
            className="field-input field-select"
            disabled={submitting}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div className="field-group">
          <label htmlFor="description" className="field-label">
            Description
          </label>
          <input
            id="description"
            name="description"
            type="text"
            placeholder="e.g. Lunch at Saravana Bhavan"
            value={form.description}
            onChange={handleChange}
            className="field-input"
            required
            disabled={submitting}
          />
        </div>

        {/* Date */}
        <div className="field-group">
          <label htmlFor="date" className="field-label">
            Date
          </label>
          <input
            id="date"
            name="date"
            type="date"
            value={form.date}
            onChange={handleChange}
            className="field-input"
            required
            disabled={submitting}
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting}
          id="submit-expense-btn"
        >
          {submitting ? (
            <span className="btn-spinner" aria-label="Saving…" />
          ) : (
            "Add Expense"
          )}
        </button>
      </form>
    </div>
  );
}
