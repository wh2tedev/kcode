// ============================================================
// editor.js - Monaco Editor, pestañas, guardado, atajos,
// IntelliSense, notificaciones, temas estilo VS Code y
// registro de comandos reales en la Command Palette de Monaco
// ============================================================

import {
  AppState, addOpenFile, getOpenFile, removeOpenFile,
  setActiveFile, markFileModified, loadConfig, saveConfig,
} from './state.js';
import { getCachedHandle, updateExplorerModifiedIndicator } from './explorer.js';
import { verifyPermission } from './db.js';
import { getLanguageFromExtension } from './fs-utils.js';
import { setupIntelliSense } from './intellisense.js';
import { getFileIcon } from './icons.js';
import { showToast } from './notifications.js';
import { THEMES, resolveInitialTheme } from './themes.js';

const MONACO_CDN = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs';

let tabsContainer = null;
let editorHostEl = null;
let monacoNS = null;

// Acciones pendientes de registrar en Monaco mientras el editor
// aún no existe (se registran en cuanto se crea la instancia).
const pendingActions = [];

function loadMonacoLoader() {
  return new Promise((resolve, reject) => {
    if (window.require && window.require.config) { resolve(); return; }
    const script = document.createElement('script');
    script.src = `${MONACO_CDN}/loader.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar el loader de Monaco desde el CDN.'));
    document.head.appendChild(script);
  });
}

// Vuelve a insertar nuestro <link> de Codicons al FINAL del <head>, para que
// su @font-face "codicon" cascadee por encima del que trae empaquetado Monaco.
// Se llama justo después de cargar Monaco, y una vez más un instante después
// por si Monaco agrega hojas de estilo adicionales de forma perezosa (al abrir
// el buscador, la command palette, etc. por primera vez).
function reprioritizeAppCodicons() {
  const link = document.getElementById('app-codicon-link');
  if (link) document.head.appendChild(link);
}

// ---------------- Temas calcados a VS Code ----------------

function defineVSCodeThemes(ns) {
  // Dark+ : el clásico de siempre
  ns.editor.defineTheme('vscode-dark-plus', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A9955' },
      { token: 'keyword', foreground: 'C586C0' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'type.identifier', foreground: '4EC9B0' },
      { token: 'function', foreground: 'DCDCAA' },
      { token: 'variable', foreground: '9CDCFE' },
      { token: 'variable.predefined', foreground: '4FC1FF' },
      { token: 'constant', foreground: '4FC1FF' },
      { token: 'tag', foreground: '569CD6' },
      { token: 'attribute.name', foreground: '9CDCFE' },
      { token: 'attribute.value', foreground: 'CE9178' },
      { token: 'delimiter', foreground: 'D4D4D4' },
      { token: 'delimiter.html', foreground: '808080' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'editorLineNumber.foreground': '#858585',
      'editorLineNumber.activeForeground': '#c6c6c6',
      'editor.selectionBackground': '#264f78',
      'editor.inactiveSelectionBackground': '#3a3d41',
      'editorCursor.foreground': '#aeafad',
      'editor.lineHighlightBackground': '#2a2d2e',
      'editorIndentGuide.background': '#404040',
      'editorIndentGuide.activeBackground': '#707070',
      'editorWhitespace.foreground': '#404040',
      'editorGutter.background': '#1e1e1e',
      'editorWidget.background': '#252526',
      'editorWidget.border': '#454545',
      'editorSuggestWidget.background': '#252526',
      'editorSuggestWidget.border': '#454545',
      'editorSuggestWidget.selectedBackground': '#04395e',
      'input.background': '#3c3c3c',
      'input.border': '#3c3c3c',
      'list.hoverBackground': '#2a2d2e',
      'list.activeSelectionBackground': '#04395e',
      'scrollbarSlider.background': '#79797966',
      'scrollbarSlider.hoverBackground': '#646464b3',
    },
  });

  // Light+ : el clásico claro de siempre
  ns.editor.defineTheme('vscode-light-plus', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '008000' },
      { token: 'keyword', foreground: 'AF00DB' },
      { token: 'string', foreground: 'A31515' },
      { token: 'number', foreground: '098658' },
      { token: 'type', foreground: '267F99' },
      { token: 'function', foreground: '795E26' },
      { token: 'variable', foreground: '001080' },
      { token: 'tag', foreground: '800000' },
      { token: 'attribute.name', foreground: 'FF0000' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#000000',
      'editorLineNumber.foreground': '#237893',
      'editor.lineHighlightBackground': '#f3f3f3',
      'editor.selectionBackground': '#add6ff',
    },
  });

  // Dark Modern: el default de VS Code justo antes de Dark 2026.
  // Misma paleta de sintaxis que Dark+, pero con el fondo/UI un poco
  // más oscuros y neutros (#1f1f1f) que trajo el rediseño "Modern".
  ns.editor.defineTheme('vscode-dark-modern', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A9955' },
      { token: 'keyword', foreground: 'C586C0' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'type.identifier', foreground: '4EC9B0' },
      { token: 'function', foreground: 'DCDCAA' },
      { token: 'variable', foreground: '9CDCFE' },
      { token: 'variable.predefined', foreground: '4FC1FF' },
      { token: 'constant', foreground: '4FC1FF' },
      { token: 'tag', foreground: '569CD6' },
      { token: 'attribute.name', foreground: '9CDCFE' },
      { token: 'attribute.value', foreground: 'CE9178' },
      { token: 'delimiter', foreground: 'D4D4D4' },
    ],
    colors: {
      'editor.background': '#1f1f1f',
      'editor.foreground': '#cccccc',
      'editorLineNumber.foreground': '#6e7681',
      'editorLineNumber.activeForeground': '#cccccc',
      'editor.selectionBackground': '#264f78',
      'editor.lineHighlightBackground': '#2a2d2e',
      'editorIndentGuide.background': '#2b2b2b',
      'editorIndentGuide.activeBackground': '#525252',
      'editorGutter.background': '#1f1f1f',
      'editorWidget.background': '#202020',
      'list.hoverBackground': '#2a2d2e',
      'list.activeSelectionBackground': '#04395e',
    },
  });

  // Light Modern: contraparte clara del anterior.
  ns.editor.defineTheme('vscode-light-modern', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '008000' },
      { token: 'keyword', foreground: 'AF00DB' },
      { token: 'string', foreground: 'A31515' },
      { token: 'number', foreground: '098658' },
      { token: 'type', foreground: '267F99' },
      { token: 'function', foreground: '795E26' },
      { token: 'variable', foreground: '001080' },
      { token: 'tag', foreground: '800000' },
      { token: 'attribute.name', foreground: 'FF0000' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#3b3b3b',
      'editorLineNumber.foreground': '#237893',
      'editor.lineHighlightBackground': '#f2f2f2',
      'editor.selectionBackground': '#add6ff',
    },
  });

  // Dark 2026: el nuevo default oficial desde VS Code 1.113 (marzo 2026).
  // Colores tomados de la especificación publicada por Microsoft:
  // fondo del editor #121314, sidebar #191A1B, strings en azul claro
  // #a5d6ff, parámetros en naranja #ffa657, funciones en púrpura #d2a8ff,
  // keywords estructurales en rojo #ff7b72, tags/JSX en verde #7ee787.
  ns.editor.defineTheme('vscode-dark-2026', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '84A980' },
      { token: 'keyword', foreground: 'C586C0' },
      { token: 'keyword.flow', foreground: 'C586C0' },
      { token: 'string', foreground: 'A5D6FF' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'type.identifier', foreground: '4EC9B0' },
      { token: 'function', foreground: 'D2A8FF' },
      { token: 'variable', foreground: 'E6E6E6' },
      { token: 'variable.predefined', foreground: 'FFA657' },
      { token: 'variable.parameter', foreground: 'FFA657' },
      { token: 'constant', foreground: 'FFA657' },
      { token: 'tag', foreground: '7EE787' },
      { token: 'attribute.name', foreground: '9CDCFE' },
      { token: 'attribute.value', foreground: 'A5D6FF' },
      { token: 'delimiter', foreground: 'D4D4D4' },
      { token: 'delimiter.html', foreground: '808080' },
    ],
    colors: {
      'editor.background': '#121314',
      'editor.foreground': '#d4d4d4',
      'editorLineNumber.foreground': '#6e7681',
      'editorLineNumber.activeForeground': '#d4d4d4',
      'editor.selectionBackground': '#284a59',
      'editor.inactiveSelectionBackground': '#2a2d2e',
      'editorCursor.foreground': '#d4d4d4',
      'editor.lineHighlightBackground': '#191a1b',
      'editorIndentGuide.background': '#2b2c2d',
      'editorIndentGuide.activeBackground': '#4a4a4a',
      'editorWhitespace.foreground': '#2b2c2d',
      'editorGutter.background': '#121314',
      'editorWidget.background': '#191a1b',
      'editorWidget.border': '#2b2c2d',
      'editorSuggestWidget.background': '#191a1b',
      'editorSuggestWidget.border': '#2b2c2d',
      'editorSuggestWidget.selectedBackground': '#284a59',
      'input.background': '#191a1b',
      'input.border': '#2b2c2d',
      'list.hoverBackground': '#1d3e4b',
      'list.activeSelectionBackground': '#284a59',
      'editor.findMatchBackground': '#284a59',
      'editor.findMatchHighlightBackground': '#1d3e4b',
      'scrollbarSlider.background': '#79797966',
      'scrollbarSlider.hoverBackground': '#646464b3',
    },
  });

  // Monokai: tema clásico incluido como opción extra de variedad.
  ns.editor.defineTheme('monokai', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '75715E' },
      { token: 'keyword', foreground: 'F92672' },
      { token: 'string', foreground: 'E6DB74' },
      { token: 'number', foreground: 'AE81FF' },
      { token: 'type', foreground: '66D9EF' },
      { token: 'type.identifier', foreground: '66D9EF' },
      { token: 'function', foreground: 'A6E22E' },
      { token: 'variable', foreground: 'F8F8F2' },
      { token: 'constant', foreground: 'AE81FF' },
      { token: 'tag', foreground: 'F92672' },
      { token: 'attribute.name', foreground: 'A6E22E' },
      { token: 'delimiter', foreground: 'F8F8F2' },
    ],
    colors: {
      'editor.background': '#272822',
      'editor.foreground': '#f8f8f2',
      'editorLineNumber.foreground': '#75715e',
      'editor.selectionBackground': '#49483e',
      'editor.lineHighlightBackground': '#3e3d32',
      'list.hoverBackground': '#3e3d32',
      'list.activeSelectionBackground': '#49483e',
    },
  });
}

export async function initEditor({ editorHost, tabsHost }) {
  editorHostEl = editorHost;
  tabsContainer = tabsHost;

  loadConfig();
  await loadMonacoLoader();

  await new Promise((resolve, reject) => {
    window.require.config({ paths: { vs: MONACO_CDN } });
    window.require(['vs/editor/editor.main'], () => { monacoNS = window.monaco; resolve(); }, reject);
  });

  // Monaco inyecta su PROPIA fuente de Codicons (una versión más vieja) en el
  // <head> al cargar, con el mismo font-family "codicon". Como se agrega
  // después de la nuestra, gana la cascada y los íconos "vuelven" a los
  // antiguos. Solución: mover nuestro <link> al final del <head> para que
  // siempre cascadee por encima del de Monaco.
  reprioritizeAppCodicons();

  defineVSCodeThemes(monacoNS);
  setupIntelliSense(monacoNS);

  AppState.editorInstance = monacoNS.editor.create(editorHostEl, {
    value: '',
    language: 'plaintext',
    theme: THEMES[resolveInitialTheme(AppState.config)].monaco,
    fontSize: AppState.config.fontSize,
    wordWrap: AppState.config.wordWrap,
    tabSize: AppState.config.tabSize,
    minimap: { enabled: AppState.config.minimap },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    cursorBlinking: 'smooth',
    renderLineHighlight: 'all',
    guides: { indentation: true },
  });

  // Registrar en Monaco todas las acciones pedidas antes de que
  // el editor existiera (quedaron en cola).
  pendingActions.splice(0).forEach(addActionToEditor);

  // Segunda pasada de seguridad: algunos widgets de Monaco (find, suggest,
  // quickCommand) inyectan su propio CSS recién al montarse la primera vez.
  setTimeout(reprioritizeAppCodicons, 500);
  setTimeout(reprioritizeAppCodicons, 2000);

  setupContentChangeTracking();
  setupKeyboardShortcuts();
  renderTabs();
  showEmptyState();

  return AppState.editorInstance;
}

// ---------------- Registro de comandos reales en la Command Palette ----------------

// Convierte un combo tipo "Ctrl+S" o "Ctrl+Shift+F" en un keybinding
// real de Monaco (KeyMod.CtrlCmd equivale a Ctrl en Win/Linux y Cmd en Mac).
function buildKeybinding(ns, combo) {
  if (!combo) return null;
  const parts = combo.split('+').map((p) => p.trim().toLowerCase());
  let mod = 0;
  let keyCode = null;

  for (const part of parts) {
    if (part === 'ctrl' || part === 'cmd') mod |= ns.KeyMod.CtrlCmd;
    else if (part === 'shift') mod |= ns.KeyMod.Shift;
    else if (part === 'alt') mod |= ns.KeyMod.Alt;
    else keyCode = ns.KeyCode[`Key${part.toUpperCase()}`] ?? null;
  }

  return keyCode != null ? (mod | keyCode) : null;
}

function addActionToEditor({ id, label, keybinding, run }) {
  const keybindings = [];
  const built = buildKeybinding(monacoNS, keybinding);
  if (built != null) keybindings.push(built);

  AppState.editorInstance.addAction({
    id,
    label,
    keybindings,
    run: () => run(),
  });
}

/**
 * Registra un comando de la aplicación como una acción REAL de Monaco,
 * visible y ejecutable desde su Command Palette nativa (Ctrl+Q).
 * @param {{id: string, label: string, keybinding?: string, run: () => void}} config
 */
export function registerAppAction(config) {
  if (AppState.editorInstance && monacoNS) {
    addActionToEditor(config);
  } else {
    pendingActions.push(config);
  }
}

/** Abre la Command Palette nativa de Monaco (usada por el atajo Ctrl+Q). */
export function openCommandPalette() {
  if (!AppState.editorInstance) return;
  AppState.editorInstance.focus();
  const action = AppState.editorInstance.getAction('editor.action.quickCommand');
  if (action) action.run();
}

// ---------------- Pestañas ----------------

export function openFileInEditor(fileInfo) {
  const { path, name, content, language, handle, isVirtual, lastModified } = fileInfo;
  let file = getOpenFile(path);

  if (!file) {
    const model = monacoNS.editor.createModel(content, language);
    model.onDidChangeContent(() => handleModelChange(path));

    addOpenFile(path, { name, content, model, language, handle, isVirtual, modified: false });
    file = getOpenFile(path);
    file.lastKnownModified = lastModified ?? null;
  }

  activateTab(path);
}

function handleModelChange(path) {
  const file = getOpenFile(path);
  if (!file) return;

  const currentValue = file.model.getValue();
  const isDirty = currentValue !== file.savedContent;

  if (file.modified !== isDirty) {
    markFileModified(path, isDirty);
    updateTabModifiedIndicator(path, isDirty);
    updateExplorerModifiedIndicator(path, isDirty);
  }

  if (isDirty && AppState.config.autoSave) {
    clearTimeout(AppState.autoSaveTimer);
    AppState.autoSaveTimer = setTimeout(() => saveFile(AppState.activeFilePath), AppState.config.autoSaveDelay);
  }
}

function renderTabs() {
  if (!tabsContainer) return;
  tabsContainer.innerHTML = '';
  for (const [path, file] of AppState.openFiles.entries()) {
    tabsContainer.appendChild(buildTabElement(path, file));
  }
}

function buildTabElement(path, file) {
  const tab = document.createElement('div');
  tab.className = 'editor-tab';
  tab.dataset.path = path;
  if (path === AppState.activeFilePath) tab.classList.add('active');

  const iconEl = document.createElement('span');
  iconEl.className = 'tab-icon';
  iconEl.innerHTML = getFileIcon(file.name);
  tab.appendChild(iconEl);

  const label = document.createElement('span');
  label.className = 'tab-label';
  label.textContent = (file.modified ? '● ' : '') + file.name;
  tab.appendChild(label);

  const closeBtn = document.createElement('span');
  closeBtn.className = 'tab-close';
  closeBtn.textContent = '×';
  closeBtn.title = 'Cerrar';
  tab.appendChild(closeBtn);

  tab.addEventListener('click', (e) => { if (e.target !== closeBtn) activateTab(path); });
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeTab(path); });

  return tab;
}

function activateTab(path) {
  const file = getOpenFile(path);
  if (!file) return;

  if (AppState.activeFilePath) {
    const prevFile = getOpenFile(AppState.activeFilePath);
    if (prevFile) prevFile.viewState = AppState.editorInstance.saveViewState();
  }

  setActiveFile(path);
  AppState.editorInstance.setModel(file.model);
  if (file.viewState) AppState.editorInstance.restoreViewState(file.viewState);

  AppState.editorInstance.focus();
  hideEmptyState();
  renderTabs();
}

function closeTab(path) {
  const file = getOpenFile(path);
  if (!file) return;

  if (file.modified) {
    const discard = confirm(`"${file.name}" tiene cambios sin guardar. ¿Cerrar de todos modos?`);
    if (!discard) return;
  }
  finalizeTabRemoval(path);
}

export function forceCloseTab(path) {
  if (!getOpenFile(path)) return;
  finalizeTabRemoval(path);
}

function finalizeTabRemoval(path) {
  removeOpenFile(path);
  if (AppState.activeFilePath) {
    activateTab(AppState.activeFilePath);
  } else {
    AppState.editorInstance.setModel(null);
    showEmptyState();
    renderTabs();
  }
}

export function renameOpenFile(oldPath, newPath, newName, newHandle) {
  const file = AppState.openFiles.get(oldPath);
  if (!file) return;

  AppState.openFiles.delete(oldPath);
  file.name = newName;
  file.path = newPath;
  if (newHandle) file.handle = newHandle;

  const newLang = getLanguageFromExtension(newName);
  if (newLang && file.model && monacoNS) {
    monacoNS.editor.setModelLanguage(file.model, newLang);
    file.language = newLang;
  }

  AppState.openFiles.set(newPath, file);
  if (AppState.activeFilePath === oldPath) AppState.activeFilePath = newPath;
  renderTabs();
}

export async function reloadFileFromDisk(path) {
  const file = getOpenFile(path);
  if (!file || !file.handle) return;
  try {
    const fsFile = await file.handle.getFile();
    const content = await fsFile.text();
    file.model.setValue(content);
    file.content = content;
    file.savedContent = content;
    file.lastKnownModified = fsFile.lastModified;
    markFileModified(path, false);
    updateTabModifiedIndicator(path, false);
    updateExplorerModifiedIndicator(path, false);
    showToast({ type: 'success', message: `"${file.name}" recargado desde disco` });
  } catch (err) {
    console.error('Error recargando archivo:', err);
    showToast({ type: 'error', message: `No se pudo recargar "${file.name}": ${err.message}` });
  }
}

function updateTabModifiedIndicator(path, modified) {
  if (!tabsContainer) return;
  const tabEl = tabsContainer.querySelector(`.editor-tab[data-path="${CSS.escape(path)}"] .tab-label`);
  const file = getOpenFile(path);
  if (tabEl && file) tabEl.textContent = (modified ? '● ' : '') + file.name;
}

function showEmptyState() { if (editorHostEl) editorHostEl.classList.add('editor-empty'); }
function hideEmptyState() { if (editorHostEl) editorHostEl.classList.remove('editor-empty'); }

export async function saveFile(path) {
  const file = getOpenFile(path);
  if (!file) return false;

  const content = file.model.getValue();
  file.content = content;

  try {
    if (!file.isVirtual) {
      let handle = file.handle || (getCachedHandle(path) || {}).handle;
      if (!handle) { console.warn('No se encontró el handle real para', path); return false; }

      const granted = await verifyPermission(handle, true);
      if (!granted) {
        showToast({ type: 'error', message: `Permiso de escritura denegado para "${file.name}".` });
        return false;
      }

      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();

      const fsFile = await handle.getFile();
      file.lastKnownModified = fsFile.lastModified;
    } else {
      const { findFileByPath } = await import('./fs-utils.js');
      const node = findFileByPath(AppState.fileSystem, path);
      if (node) node.content = content;
    }

    file.savedContent = content;
    markFileModified(path, false);
    updateTabModifiedIndicator(path, false);
    updateExplorerModifiedIndicator(path, false);
    showToast({ type: 'success', message: `"${file.name}" guardado`, timeout: 2200 });
    return true;
  } catch (err) {
    console.error('Error guardando archivo:', err);
    showToast({ type: 'error', message: `No se pudo guardar "${file.name}": ${err.message}` });
    return false;
  }
}

export async function saveAllFiles() {
  for (const path of AppState.openFiles.keys()) await saveFile(path);
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', async (e) => {
    const ctrlOrCmd = e.ctrlKey || e.metaKey;

    if (ctrlOrCmd && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (AppState.activeFilePath) await saveFile(AppState.activeFilePath);
      return;
    }

    // Ctrl+Q abre la Command Palette REAL de Monaco (editor.action.quickCommand),
    // con todos los comandos de la app registrados como acciones nativas.
    if (ctrlOrCmd && e.key.toLowerCase() === 'q') {
      e.preventDefault();
      openCommandPalette();
      return;
    }

    if (ctrlOrCmd && e.key.toLowerCase() === 'w') {
      if (AppState.activeFilePath) { e.preventDefault(); closeTab(AppState.activeFilePath); }
    }
  });
}

function setupContentChangeTracking() {
  window.addEventListener('beforeunload', (e) => {
    let anyModified = false;
    for (const file of AppState.openFiles.values()) { if (file.modified) { anyModified = true; break; } }
    if (anyModified) { e.preventDefault(); e.returnValue = ''; }
  });
}

export function updateEditorConfig(partialConfig) {
  Object.assign(AppState.config, partialConfig);
  saveConfig();
  if (!AppState.editorInstance) return;

  if ('fontSize' in partialConfig) AppState.editorInstance.updateOptions({ fontSize: partialConfig.fontSize });
  if ('wordWrap' in partialConfig) AppState.editorInstance.updateOptions({ wordWrap: partialConfig.wordWrap });
  if ('minimap' in partialConfig) AppState.editorInstance.updateOptions({ minimap: { enabled: partialConfig.minimap } });
  if ('darkTheme' in partialConfig) monacoNS.editor.setTheme(partialConfig.darkTheme ? 'vscode-dark-plus' : 'vscode-light-plus');
  if ('theme' in partialConfig && THEMES[partialConfig.theme]) monacoNS.editor.setTheme(THEMES[partialConfig.theme].monaco);
}

export function getActiveModel() {
  return AppState.activeFilePath ? getOpenFile(AppState.activeFilePath)?.model : null;
}
