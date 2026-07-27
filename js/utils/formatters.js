const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usdFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export const money = (value) => `${numberFormatter.format(Math.round(Number(value) || 0))} EGP`;
export const usd = (value) => `${usdFormatter.format(Number(value) || 0)} USD`;

/**
 * Escapes HTML characters to prevent XSS vulnerabilities when inserting user content.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Safe deep clone
 */
export function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

/**
 * Safely attach event listener to an element if it exists
 */
export function on(idOrElement, event, handler) {
  const el = typeof idOrElement === "string" ? document.getElementById(idOrElement) : idOrElement;
  if (el) el.addEventListener(event, handler);
}
