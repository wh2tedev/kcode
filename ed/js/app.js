// ============================================================
// app.js - Orquestador: state, db, explorer, editor, notifs,
// comandos reales de Monaco, file watcher
// ============================================================

import { AppState, loadConfig } from './state.js';
import { restoreLastSession, verifyPermission } from './db.js';
import { renderExplorer, pickRealDirectory, createNewFileAtRoot, createNewFolderAtRoot, setExplorerContainer } from './explorer.js';
import {
  initEditor, updateEditorConfig, saveFile, saveAllFiles, forceCloseTab,
  reloadFileFromDisk, registerAppAction,
} from './editor.js';
import { showToast } from './notifications.js';
import { startFileWatcher } from './file-watcher.js';
import { initSearchPanel, focusSearchInput } from './search.js';
import { THEMES, THEME_ORDER, resolveInitialTheme } from './themes.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  explorerRoot: $('#explorer-root'),
  noFolderMsg: $('#no-folder-message'),
  btnOpenFolder: $('#btn-open-folder'),
  btnNewFile: $('#btn-new-file'),
  btnNewFolder: $('#btn-new-folder'),
  btnOpenFolderMain: $('#btn-open-folder-main'),
  btnReopenLast: $('#btn-reopen-last'),
  btnVirtualFs: $('#btn-virtual-fs'),
  tabsBar: $('#tabs-bar'),
  editorHost: $('#editor-host'),
  statusFsMode: $('#status-fs-mode'),
  statusCursor: $('#status-cursor-pos'),
  statusLanguage: $('#status-language'),
  statusAutosave: $('#status-autosave'),
  settingsOverlay: $('#settings-overlay'),
  btnSettings: $('#btn-settings'),
  btnCloseSettings: $('#btn-close-settings'),
  cfgFontSize: $('#cfg-font-size'),
  cfgTabSize: $('#cfg-tab-size'),
  cfgWordWrap: $('#cfg-word-wrap'),
  cfgMinimap: $('#cfg-minimap'),
  cfgAutoSave: $('#cfg-auto-save'),
  cfgTheme: $('#cfg-theme'),
  sidebarResizer: $('#sidebar-resizer'),
  sideBar: $('#side-bar'),
  viewExplorer: $('#view-explorer'),
  viewSearch: $('#view-search'),
  searchInput: $('#search-input'),
  searchResults: $('#search-results'),
  searchSummary: $('#search-summary'),
  searchClear: $('#search-clear'),
};

async function bootstrap() {
  loadConfig();
  setExplorerContainer(els.explorerRoot);

  await initEditor({ editorHost: els.editorHost, tabsHost: els.tabsBar });

  syncSettingsPanelFromState();
  await tryRestoreSession();

  wireExplorerButtons();
  wireSettingsPanel();
  wireStatusBar();
  wireSidebarResizer();
  wireActivityBar();

  initSearchPanel({
    input: els.searchInput,
    results: els.searchResults,
    summary: els.searchSummary,
    clear: els.searchClear,
  });

  registerAllCommands();

  startFileWatcher({
    onDeleted: (path, file) => {
      forceCloseTab(path);
      showToast({ type: 'warning', title: 'Archivo eliminado', message: `"${file.name}" ya no existe en disco. La pestaña se cerró.` });
    },
    onExternalChange: (path, file, conflict) => {
      if (conflict) {
        showToast({ type: 'warning', title: 'Conflicto de edición', message: `"${file.name}" cambió en disco y tiene cambios sin guardar aquí.` });
      } else {
        showToast({
          type: 'info', title: 'Cambio externo detectado', message: `"${file.name}" cambió en disco.`,
          actionLabel: 'Recargar', onAction: () => reloadFileFromDisk(path), timeout: 8000,
        });
      }
    },
  });

  updateFsModeLabel();
}

async function tryRestoreSession() {
  try {
    const session = await restoreLastSession();
    if (!session) { showNoFolderMessage(); return; }

    if (session.granted) {
      AppState.rootDirHandle = session.handle;
      AppState.isRealFS = true;
      await renderExplorer(els.explorerRoot);
      showExplorerTree();
    } else {
      els.btnReopenLast.style.display = 'block';
      els.btnReopenLast.onclick = async () => {
        const granted = await verifyPermission(session.handle, true);
        if (granted) {
          AppState.rootDirHandle = session.handle;
          AppState.isRealFS = true;
          await renderExplorer(els.explorerRoot);
          showExplorerTree();
          updateFsModeLabel();
        } else {
          showToast({ type: 'error', message: 'No se concedió permiso sobre la carpeta.' });
        }
      };
      showNoFolderMessage();
    }
  } catch (err) {
    console.warn('No se pudo restaurar la sesión anterior:', err);
    showNoFolderMessage();
  }
}

function wireExplorerButtons() {
  const openFolderHandler = async () => {
    const ok = await pickRealDirectory();
    if (ok) { showExplorerTree(); updateFsModeLabel(); }
  };

  els.btnOpenFolder.addEventListener('click', openFolderHandler);
  els.btnOpenFolderMain.addEventListener('click', openFolderHandler);
  els.btnNewFile.addEventListener('click', () => createNewFileAtRoot());
  els.btnNewFolder.addEventListener('click', () => createNewFolderAtRoot());

  els.btnVirtualFs.addEventListener('click', async () => {
    AppState.isRealFS = false;
    AppState.rootDirHandle = null;
    await renderExplorer(els.explorerRoot);
    showExplorerTree();
    updateFsModeLabel();
  });
}

function showExplorerTree() { els.noFolderMsg.style.display = 'none'; els.explorerRoot.style.display = 'block'; }
function showNoFolderMessage() { els.noFolderMsg.style.display = 'block'; els.explorerRoot.style.display = 'none'; }
function updateFsModeLabel() {
  els.statusFsMode.textContent = AppState.isRealFS ? '📁 Carpeta real (FS Access)' : '🗂 Sistema virtual';
}

function syncSettingsPanelFromState() {
  const cfg = AppState.config;
  els.cfgFontSize.value = cfg.fontSize;
  els.cfgTabSize.value = cfg.tabSize;
  els.cfgWordWrap.checked = cfg.wordWrap === 'on';
  els.cfgMinimap.checked = cfg.minimap;
  els.cfgAutoSave.checked = cfg.autoSave;
  els.statusAutosave.textContent = `Autoguardado: ${cfg.autoSave ? 'ON' : 'OFF'}`;

  const themeKey = resolveInitialTheme(cfg);
  els.cfgTheme.value = themeKey;
  applyTheme(themeKey);
}

function applyTheme(themeKey) {
  if (!THEMES[themeKey]) return;
  document.body.dataset.theme = themeKey;
}

function wireSettingsPanel() {
  els.btnSettings.addEventListener('click', () => els.settingsOverlay.classList.add('open'));
  els.btnCloseSettings.addEventListener('click', () => els.settingsOverlay.classList.remove('open'));
  els.settingsOverlay.addEventListener('click', (e) => { if (e.target === els.settingsOverlay) els.settingsOverlay.classList.remove('open'); });

  els.cfgFontSize.addEventListener('change', () => {
    const value = Math.min(40, Math.max(8, parseInt(els.cfgFontSize.value, 10) || 14));
    els.cfgFontSize.value = value;
    updateEditorConfig({ fontSize: value });
  });
  els.cfgTabSize.addEventListener('change', () => {
    const value = Math.min(8, Math.max(1, parseInt(els.cfgTabSize.value, 10) || 4));
    els.cfgTabSize.value = value;
    updateEditorConfig({ tabSize: value });
  });
  els.cfgWordWrap.addEventListener('change', () => updateEditorConfig({ wordWrap: els.cfgWordWrap.checked ? 'on' : 'off' }));
  els.cfgMinimap.addEventListener('change', () => updateEditorConfig({ minimap: els.cfgMinimap.checked }));
  els.cfgAutoSave.addEventListener('change', () => {
    updateEditorConfig({ autoSave: els.cfgAutoSave.checked });
    els.statusAutosave.textContent = `Autoguardado: ${els.cfgAutoSave.checked ? 'ON' : 'OFF'}`;
  });
  els.cfgTheme.addEventListener('change', () => {
    applyTheme(els.cfgTheme.value);
    updateEditorConfig({ theme: els.cfgTheme.value });
  });
}

function wireStatusBar() {
  const editor = AppState.editorInstance;
  if (!editor) return;
  editor.onDidChangeCursorPosition((e) => {
    els.statusCursor.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
  });
  editor.onDidChangeModel(() => {
    const model = editor.getModel();
    els.statusLanguage.textContent = model ? model.getLanguageId() : 'plaintext';
  });
}

function wireSidebarResizer() {
  let dragging = false;
  els.sidebarResizer.addEventListener('mousedown', () => {
    dragging = true;
    els.sidebarResizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const activityBarWidth = 48;
    const newWidth = Math.min(500, Math.max(170, e.clientX - activityBarWidth));
    els.sideBar.style.width = `${newWidth}px`;
  });
  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false;
      els.sidebarResizer.classList.remove('dragging');
      document.body.style.cursor = '';
      AppState.editorInstance && AppState.editorInstance.layout();
    }
  });
}

let currentSidebarView = 'explorer';

function wireActivityBar() {
  const explorerBtn = document.querySelector('.activity-btn[data-view="explorer"]');
  const searchBtn = document.querySelector('.activity-btn[data-view="search"]');

  const activateView = (view, btn) => {
    const sameViewAlreadyOpen = currentSidebarView === view && !els.sideBar.classList.contains('collapsed');

    if (sameViewAlreadyOpen) {
      // Click sobre el ícono ya activo: colapsa la sidebar (con animación)
      els.sideBar.classList.add('collapsed');
      els.sidebarResizer.classList.add('collapsed');
      btn.classList.remove('active');
    } else {
      // Abre la sidebar (si estaba colapsada) y muestra la vista pedida
      els.sideBar.classList.remove('collapsed');
      els.sidebarResizer.classList.remove('collapsed');
      currentSidebarView = view;
      els.viewExplorer.style.display = view === 'explorer' ? 'flex' : 'none';
      els.viewSearch.style.display = view === 'search' ? 'flex' : 'none';

      document.querySelectorAll('.activity-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (view === 'search') {
        setTimeout(() => focusSearchInput(), 240);
      }
    }

    // Espera a que termine la transición CSS antes de re-layoutear Monaco
    setTimeout(() => AppState.editorInstance && AppState.editorInstance.layout(), 240);
  };

  explorerBtn.addEventListener('click', () => activateView('explorer', explorerBtn));
  searchBtn.addEventListener('click', () => activateView('search', searchBtn));
}

// Todos los comandos de la app ahora son acciones REALES de Monaco:
// aparecen en su Command Palette nativa (Ctrl+Q) en vez de en una
// paleta artificial propia.
function registerAllCommands() {
  registerAppAction({ id: 'app.file.save', label: 'Archivo: Guardar', run: () => AppState.activeFilePath && saveFile(AppState.activeFilePath) });
  registerAppAction({ id: 'app.file.saveAll', label: 'Archivo: Guardar todo', run: () => saveAllFiles() });
  registerAppAction({ id: 'app.file.newFile', label: 'Archivo: Nuevo archivo (raíz)', run: () => createNewFileAtRoot() });
  registerAppAction({ id: 'app.file.newFolder', label: 'Archivo: Nueva carpeta (raíz)', run: () => createNewFolderAtRoot() });
  registerAppAction({ id: 'app.folder.open', label: 'Carpeta: Abrir carpeta...', run: () => els.btnOpenFolderMain.click() });
  registerAppAction({ id: 'app.folder.virtual', label: 'Carpeta: Usar sistema virtual', run: () => els.btnVirtualFs.click() });
  registerAppAction({ id: 'app.editor.find', label: 'Editor: Buscar', run: () => AppState.editorInstance && AppState.editorInstance.getAction('actions.find').run() });
  registerAppAction({ id: 'app.view.toggleSidebar', label: 'Ver: Alternar barra lateral', run: () => els.sideBar.classList.toggle('collapsed') });
  registerAppAction({ id: 'app.view.toggleMinimap', label: 'Ver: Alternar minimapa', run: () => { els.cfgMinimap.checked = !els.cfgMinimap.checked; els.cfgMinimap.dispatchEvent(new Event('change')); } });
  registerAppAction({ id: 'app.view.toggleWordWrap', label: 'Ver: Alternar ajuste de línea', run: () => { els.cfgWordWrap.checked = !els.cfgWordWrap.checked; els.cfgWordWrap.dispatchEvent(new Event('change')); } });
  registerAppAction({ id: 'app.view.toggleTheme', label: 'Preferencias: Cambiar tema', run: () => {
    const currentIndex = THEME_ORDER.indexOf(els.cfgTheme.value);
    const nextTheme = THEME_ORDER[(currentIndex + 1) % THEME_ORDER.length];
    els.cfgTheme.value = nextTheme;
    els.cfgTheme.dispatchEvent(new Event('change'));
    showToast({ type: 'info', message: `Tema: ${THEMES[nextTheme].label}`, timeout: 1800 });
  } });
  registerAppAction({ id: 'app.preferences.open', label: 'Preferencias: Abrir configuración', run: () => els.settingsOverlay.classList.add('open') });
}

document.addEventListener('DOMContentLoaded', bootstrap);
window.addEventListener('error', (e) => console.error('Error no capturado:', e.error || e.message));
