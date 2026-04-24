/**
 * ExpenseTable.jsx
 *
 * Receives pre-fetched data from App.jsx.  Responsibilities:
 *   - Render loading skeleton
 *   - Render error state
 *   - Render empty state
 *   - Render the data table with a total row
 *
 * Paise → rupees conversion happens here (display only).
 * The rule: divide by 100 and format with toLocaleString.
 * We do NOT mutate the raw data — amounts stay in paise inside the array.
 */

/** Convert integer paise to a formatted rupee string e.g. 25050 → "₹250.50" */
function formatPaise(paise) {
  return (paise / 100).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  });
}

/** Format ISO date string to a human-readable form e.g. "2024-05-15" → "15 May 2024" */
function formatDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const CATEGORY_COLORS = {
  "Food & Drink": "#f97316",
  Transport: "#3b82f6",
  Utilities: "#8b5cf6",
  Shopping: "#ec4899",
  Health: "#10b981",
  Entertainment: "#f59e0b",
  Rent: "#ef4444",
  Other: "#6b7280",
};

function CategoryBadge({ category }) {
  const color = CATEGORY_COLORS[category] ?? "#6b7280";
  return (
    <span
      className="category-badge"
      style={{ "--badge-color": color }}
    >
      {category}
    </span>
  );
}

export default function ExpenseTable({ expenses, total, loading, error }) {
  // ── Loading skeleton ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="card table-card" aria-busy="true" aria-label="Loading expenses">
        <div className="skeleton-rows">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-row" />
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="card table-card">
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────
  if (expenses.length === 0) {
    return (
      <div className="card table-card empty-state">
        <div className="empty-icon">💸</div>
        <p className="empty-text">No expenses yet. Add one above!</p>
      </div>
    );
  }

  // ── Data table ─────────────────────────────────────────────────────────
  return (
    <div className="card table-card">
      <div className="table-scroll">
        <table className="expense-table" aria-label="Expense list">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Category</th>
              <th scope="col">Description</th>
              <th scope="col" className="text-right">Amount</th>
            </tr>
          </thead>

          <tbody>
            {expenses.map((exp) => (
              <tr key={exp.id}>
                <td className="col-date">{formatDate(exp.date)}</td>
                <td className="col-category">
                  <CategoryBadge category={exp.category} />
                </td>
                <td className="col-desc">{exp.description}</td>
                <td className="col-amount text-right">
                  {formatPaise(exp.amount)}
                </td>
              </tr>
            ))}
          </tbody>

          {/* Total row — value comes from the server (constraint #7) */}
          <tfoot>
            <tr className="total-row">
              <td colSpan={3} className="total-label">
                Total ({expenses.length} expense{expenses.length !== 1 ? "s" : ""})
              </td>
              <td className="total-amount text-right" id="expenses-total">
                {formatPaise(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
