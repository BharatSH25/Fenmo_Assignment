/**
 * FilterBar.jsx
 *
 * Controlled component — all state lives in App.jsx (single source of truth).
 * Props:
 *   categories  string[]   — unique categories fetched from the expense list
 *   filters     { category, sort }
 *   onChange    (newFilters) => void   — parent re-fetches on every change
 *
 * Why no local state?
 *   If FilterBar held its own state, App.jsx would need to sync it, creating
 *   two competing sources of truth. Lifting state up avoids that entirely.
 */

export default function FilterBar({ categories, filters, onChange }) {
  function handleCategory(e) {
    onChange({ ...filters, category: e.target.value });
  }

  function toggleSort() {
    onChange({
      ...filters,
      sort: filters.sort === "date_desc" ? "date_asc" : "date_desc",
    });
  }

  return (
    <div className="filter-bar" role="search" aria-label="Filter expenses">
      {/* Category filter */}
      <div className="filter-group">
        <label htmlFor="filter-category" className="filter-label">
          Category
        </label>
        <select
          id="filter-category"
          value={filters.category}
          onChange={handleCategory}
          className="field-input field-select filter-select"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Sort toggle */}
      <div className="filter-group">
        <label className="filter-label">Sort</label>
        <button
          id="sort-toggle-btn"
          type="button"
          onClick={toggleSort}
          className="btn btn-secondary sort-btn"
          aria-label={
            filters.sort === "date_desc"
              ? "Currently newest first — click for oldest first"
              : "Currently oldest first — click for newest first"
          }
        >
          {filters.sort === "date_desc" ? "↓ Newest first" : "↑ Oldest first"}
        </button>
      </div>
    </div>
  );
}
