import { keys } from "../store/storage.js";

export function initTheme() {
  const savedTheme = localStorage.getItem(keys.theme);
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = savedTheme || (prefersDark ? "dark" : "light");
  setTheme(theme);
}

export function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(keys.theme, theme);
  const toggleBtn = document.getElementById("themeToggle");
  if (toggleBtn) {
    toggleBtn.textContent = theme === "dark" ? "☀️ Light mode" : "🌙 Dark mode";
    toggleBtn.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} mode`);
  }
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  const next = current === "dark" ? "light" : "dark";
  setTheme(next);
}
