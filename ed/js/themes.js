// ============================================================
// themes.js - Registro central de los temas disponibles.
// Cada tema define: la clave usada en data-theme (CSS), el
// nombre del tema de Monaco asociado, y si es oscuro o claro
// (para lógica auxiliar que dependa de eso).
// ============================================================

export const THEMES = {
  'dark-2026': { label: 'Dark 2026 (VS Code 2026)', monaco: 'vscode-dark-2026', dark: true },
  'dark-modern': { label: 'Dark Modern', monaco: 'vscode-dark-modern', dark: true },
  'dark-plus': { label: 'Dark+ (Clásico)', monaco: 'vscode-dark-plus', dark: true },
  'light-modern': { label: 'Light Modern', monaco: 'vscode-light-modern', dark: false },
  'light-plus': { label: 'Light+ (Clásico)', monaco: 'vscode-light-plus', dark: false },
  'monokai': { label: 'Monokai', monaco: 'monokai', dark: true },
};

export const THEME_ORDER = ['dark-2026', 'dark-modern', 'dark-plus', 'light-modern', 'light-plus', 'monokai'];

export const DEFAULT_THEME = 'dark-2026';

/**
 * Resuelve la clave de tema a usar al arrancar la app, migrando
 * configuraciones viejas que solo tenían el booleano `darkTheme`.
 */
export function resolveInitialTheme(config) {
  if (config.theme && THEMES[config.theme]) return config.theme;
  if (config.darkTheme === false) return 'light-plus';
  return DEFAULT_THEME;
}
