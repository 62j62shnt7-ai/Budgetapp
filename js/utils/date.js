export const DateUtils = {
  formatDate: (year, month, day) => `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,

  currentYearMonth: () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  },
  
  getMonthKey: (dateString) => (dateString ? dateString.slice(0, 7) : ""),
  
  // Accepts a 1-based `month` (1-12) and returns the last day of that month
  getLastDayOfMonth: (year, month) => new Date(year, month, 0).getDate(),
  
  parseYearMonth: (ymString) => (ymString ? ymString.split("-").map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1]),
  
  parseDate: (dateString) => (dateString ? dateString.split("-").map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate()]),
  
  getShortMonth: (ymString) => (ymString ? ymString.slice(5) : ""),

  todayString: () => {
    const now = new Date();
    return DateUtils.formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  },

  daysBetween: (earlierDateString, laterDateString) => {
    if (!earlierDateString || !laterDateString) return 0;
    const [y1, m1, d1] = earlierDateString.split("-").map(Number);
    const [y2, m2, d2] = laterDateString.split("-").map(Number);
    const ms = Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1);
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }
};
