// ==========================================================================
// Date Utilities (Pure, deterministic date arithmetic)
// ==========================================================================

export const DateUtils = {
  formatDate: (year: number, month: number, day: number): string =>
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,

  formatDateObj: (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,

  currentYearMonth: (): string => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  },

  getMonthKey: (dateString?: string): string =>
    dateString ? dateString.slice(0, 7) : '',

  getLastDayOfMonth: (year: number, month: number): number =>
    new Date(year, month, 0).getDate(),

  parseYearMonth: (ymString?: string): [number, number] => {
    if (!ymString) {
      const now = new Date();
      return [now.getFullYear(), now.getMonth() + 1];
    }
    const [y, m] = ymString.split('-').map(Number);
    return [y, m || 1];
  },

  parseDate: (dateString?: string): [number, number, number] => {
    if (!dateString) {
      const now = new Date();
      return [now.getFullYear(), now.getMonth() + 1, now.getDate()];
    }
    const [y, m, d] = dateString.split('-').map(Number);
    return [y, m || 1, d || 1];
  },

  todayString: (): string => {
    const now = new Date();
    return DateUtils.formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  },

  formatDisplayDate: (dateString?: string): string => {
    if (!dateString) return '';
    if (dateString.length === 7) {
      const [y, m] = dateString.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
    }
    const [y, m, d] = dateString.split('-').map(Number);
    if (!y || !m || !d) return dateString;
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  },

  daysBetween: (earlierDateString?: string, laterDateString?: string): number => {
    if (!earlierDateString || !laterDateString) return 0;
    const [y1, m1, d1] = earlierDateString.split('-').map(Number);
    const [y2, m2, d2] = laterDateString.split('-').map(Number);
    const ms = Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1);
    return Math.round(ms / (1000 * 60 * 60 * 24));
  },

  addMonths: (ymString: string, count: number): string => {
    const [y, m] = DateUtils.parseYearMonth(ymString);
    const totalMonths = y * 12 + (m - 1) + count;
    const newY = Math.floor(totalMonths / 12);
    const newM = (totalMonths % 12) + 1;
    return `${newY}-${String(newM).padStart(2, '0')}`;
  },
};

export const numberFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
export const usdFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export const formatMoney = (value: number | string): string =>
  `${numberFormatter.format(Math.round(Number(value) || 0))} EGP`;

export const formatUSD = (value: number | string): string =>
  `$${usdFormatter.format(Number(value) || 0)}`;
