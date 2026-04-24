/**
 * App.jsx — root component and single source of truth for all shared state.
 *
 * State owned here:
 *   expenses[]   — raw from API (amounts in PAISE)
 *   total        — paise integer, server-computed
 *   categories[] — derived from expense list for the FilterBar dropdown
 *   filters      — { category, sort } — passed down to FilterBar
 *   loading      — boolean for table skeleton
 *   error        — string | null for table error state
 *
 * Why does App own categories?
 *   categories is derived from the fetched expense list. Deriving it inside
 *   FilterBar would require passing the full expense array down just for
 *   the dropdown — leaking data concerns across component boundaries.
 *   Deriving in App keeps FilterBar's props minimal and focused.
 *
 * Data flow:
 *   App (fetch) → ExpenseTable (display)
 *   App (filters) ↔ FilterBar (user input)
 *   ExpenseForm → onSuccess → App (refetch)
 */

import { useCallback, useEffect, useState } from "react";
import { getExpenses } from "./api";
import ExpenseForm from "./components/ExpenseForm";
import FilterBar from "./components/FilterBar";
import ExpenseTable from "./components/ExpenseTable";
import "./index.css";

export default function App() {
  const [expenses, setExpenses] = useState([]);
  const [total, setTotal] = useState(0);       // paise
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ category: "", sort: "date_desc" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Fetch ──────────────────────────────────────────────────────────────
  const fetchExpenses = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getExpenses(filters);
      setExpenses(data.expenses);
      setTotal(data.total); // paise — server-computed (constraint #7)

      // Derive unique sorted categories for the filter dropdown
      const unique = [...new Set(data.expenses.map((e) => e.category))].sort();
      setCategories(unique);
    } catch (err) {
      setError(err.message ?? "Failed to load expenses.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Re-fetch whenever filters change
  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  // ── Handlers ───────────────────────────────────────────────────────────
  function handleFiltersChange(newFilters) {
    setFilters(newFilters);
  }

  // Called by ExpenseForm after a successful POST
  function handleExpenseAdded() {
    fetchExpenses();
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-inner">
          <div className="header-brand">
            <span className="brand-icon" aria-hidden="true">💸</span>
            <span className="brand-name">Fenmo</span>
          </div>
          <p className="header-tagline">Personal Expense Tracker</p>
        </div>
      </header>

      {/* ── Main layout ── */}
      <main className="main-layout">
        {/* Left column: form */}
        <aside className="sidebar">
          <ExpenseForm onSuccess={handleExpenseAdded} />
        </aside>

        {/* Right column: filters + table */}
        <section className="content-area" aria-label="Expense list">
          <FilterBar
            categories={categories}
            filters={filters}
            onChange={handleFiltersChange}
          />
          <ExpenseTable
            expenses={expenses}
            total={total}
            loading={loading}
            error={error}
          />
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="app-footer">
        <p>
          Fenmo — amounts stored as integer paise · WAL-enabled SQLite ·{" "}
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
          >
            Source
          </a>
        </p>
      </footer>
    </div>
  );
}
