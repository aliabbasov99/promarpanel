// Qara rejimi tətbiq edir və yadda saxlayır
const KEY_THEME = 'promar.theme';

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(KEY_THEME, theme);
}

export function initTheme() {
  applyTheme(localStorage.getItem(KEY_THEME) || 'light');
}