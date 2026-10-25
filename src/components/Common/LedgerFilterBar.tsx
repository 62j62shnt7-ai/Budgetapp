import React from 'react';
import { Search, X } from 'lucide-react';
import { DateUtils } from '../../engine/dateUtils';

export interface LedgerFilterBarProps {
  selectedMonth: string;
  onMonthChange: (month: string) => void;
  orderedMonths: string[];
  typeFilter: string;
  onTypeChange: (type: string) => void;
  categoryFilter: string;
  onCategoryChange: (category: string) => void;
  allCategories: string[];
  selectedAccount: string;
  onAccountChange: (account: string) => void;
  allAccounts: string[];
  selectedTag: string;
  onTagChange: (tag: string) => void;
  allTags: string[];
  hasUntagged?: boolean;
  searchTerm: string;
  onSearchChange: (search: string) => void;
  onResetFilters: () => void;
  isAnyFilterActive: boolean;
  dateFrom?: string;
  dateTo?: string;
  onClearDateRange?: () => void;
  extraFilters?: React.ReactNode;
}

export const LedgerFilterBar: React.FC<LedgerFilterBarProps> = ({
  selectedMonth,
  onMonthChange,
  orderedMonths,
  typeFilter,
  onTypeChange,
  categoryFilter,
  onCategoryChange,
  allCategories,
  selectedAccount,
  onAccountChange,
  allAccounts,
  selectedTag,
  onTagChange,
  allTags,
  hasUntagged = false,
  searchTerm,
  onSearchChange,
  onResetFilters,
  isAnyFilterActive,
  dateFrom,
  dateTo,
  onClearDateRange,
  extraFilters,
}) => {
  return (
    <div className="ledger-filter-wrapper">
      {/* Month quick selection chips */}
      {orderedMonths.length > 0 && (
        <div className="ledger-month-chips" role="tablist" aria-label="Filter by month">
          <button
            type="button"
            className={`ledger-chip ${selectedMonth === 'all' ? 'is-active' : ''}`}
            onClick={() => onMonthChange('all')}
          >
            All Months
          </button>
          {orderedMonths.map((m) => (
            <button
              key={m}
              type="button"
              className={`ledger-chip ${selectedMonth === m ? 'is-active' : ''}`}
              onClick={() => onMonthChange(m)}
            >
              {DateUtils.formatDisplayDate(m) || m}
            </button>
          ))}
        </div>
      )}

      {/* Main filters bar */}
      <div className="history-filters-bar ledger-filters-bar">
        <label className="history-filter-field">
          <span className="field-label-text">Type</span>
          <select value={typeFilter} onChange={(e) => onTypeChange(e.target.value)}>
            <option value="all">All types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </select>
        </label>

        <label className="history-filter-field">
          <span className="field-label-text">Category</span>
          <select value={categoryFilter} onChange={(e) => onCategoryChange(e.target.value)}>
            <option value="all">All categories</option>
            {allCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </label>

        <label className="history-filter-field">
          <span className="field-label-text">Account</span>
          <select value={selectedAccount} onChange={(e) => onAccountChange(e.target.value)}>
            <option value="all">All accounts</option>
            {allAccounts.map((acc) => (
              <option key={acc} value={acc}>
                {acc.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <label className="history-filter-field">
          <span className="field-label-text">Tag / Subcategory</span>
          <select value={selectedTag} onChange={(e) => onTagChange(e.target.value)}>
            <option value="all">All tags</option>
            {hasUntagged && <option value="__untagged__">Untagged</option>}
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>

        {extraFilters}

        <label className="history-filter-field history-search-field">
          <span className="field-label-text">Search</span>
          <div className="ledger-search-input-wrap">
            <Search size={14} className="ledger-search-icon" />
            <input
              type="search"
              placeholder="Search category, tag, account..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </label>

        <button
          className="ghost-button history-reset-btn"
          type="button"
          onClick={onResetFilters}
        >
          Reset filters
        </button>
      </div>

      {/* Active filter pills indicator */}
      {isAnyFilterActive && (
        <div className="active-filters-container">
          <span className="active-filters-label">Active filters:</span>

          {selectedMonth !== 'all' && (
            <span className="active-filter-pill">
              Month: <strong>{selectedMonth}</strong>
              <button
                type="button"
                className="filter-dismiss-btn"
                onClick={() => onMonthChange('all')}
                title="Clear month filter"
                aria-label="Clear month filter"
              >
                <X size={12} />
              </button>
            </span>
          )}

          {Boolean(dateFrom || dateTo) && (
            <span className="active-filter-pill">
              Range: <strong>{dateFrom || 'start'} to {dateTo || 'end'}</strong>
              {onClearDateRange && (
                <button
                  type="button"
                  className="filter-dismiss-btn"
                  onClick={onClearDateRange}
                  title="Clear date range"
                  aria-label="Clear date range"
                >
                  <X size={12} />
                </button>
              )}
            </span>
          )}

          {typeFilter !== 'all' && (
            <span className="active-filter-pill">
              Type: <strong>{typeFilter}</strong>
              <button
                type="button"
                className="filter-dismiss-btn"
                onClick={() => onTypeChange('all')}
                title="Clear type filter"
                aria-label="Clear type filter"
              >
                <X size={12} />
              </button>
            </span>
          )}

          {categoryFilter !== 'all' && (
            <span className="active-filter-pill">
              Category: <strong>{categoryFilter}</strong>
              <button
                type="button"
                className="filter-dismiss-btn"
                onClick={() => onCategoryChange('all')}
                title="Clear category filter"
                aria-label="Clear category filter"
              >
                <X size={12} />
              </button>
            </span>
          )}

          {selectedAccount !== 'all' && (
            <span className="active-filter-pill">
              Account: <strong>{selectedAccount.toUpperCase()}</strong>
              <button
                type="button"
                className="filter-dismiss-btn"
                onClick={() => onAccountChange('all')}
                title="Clear account filter"
                aria-label="Clear account filter"
              >
                <X size={12} />
              </button>
            </span>
          )}

          {selectedTag !== 'all' && (
            <span className="active-filter-pill">
              Tag: <strong>{selectedTag === '__untagged__' ? 'Untagged' : selectedTag}</strong>
              <button
                type="button"
                className="filter-dismiss-btn"
                onClick={() => onTagChange('all')}
                title="Clear tag filter"
                aria-label="Clear tag filter"
              >
                <X size={12} />
              </button>
            </span>
          )}

          {searchTerm && (
            <span className="active-filter-pill">
              Search: <strong>&quot;{searchTerm}&quot;</strong>
              <button
                type="button"
                className="filter-dismiss-btn"
                onClick={() => onSearchChange('')}
                title="Clear search filter"
                aria-label="Clear search filter"
              >
                <X size={12} />
              </button>
            </span>
          )}

          <button
            type="button"
            className="filter-clear-all-btn"
            onClick={onResetFilters}
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
};
