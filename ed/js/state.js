// ============================================================
// state.js - Estado global de la aplicación
// ============================================================

export const AppState = {
  config: {
    fontSize: 14,
    wordWrap: 'off',
    autoSave: true,
    autoSaveDelay: 1500,
    darkTheme: true,
    tabSize: 4,
    minimap: true,
  },

  openFiles: new Map(),
  activeFilePath: null,
  rootDirHandle: null,
  isRealFS: false,

  fileSystem: {
    name: 'root',
    type: 'folder',
    path: '/',
    expanded: true,
    children: [
      {
        name: 'index.html',
        type: 'file',
        path: '/index.html',
        content: '<!DOCTYPE html>\n<html>\n<head>\n  <title>Nuevo proyecto</title>\n</head>\n<body>\n  <h1>Hola mundo</h1>\n</body>\n</html>\n'
      },
      {
        name: 'main.js',
        type: 'file',
        path: '/main.js',
        content: 'console.log("Hola desde main.js");\n'
      }
    ]
  },

  editorInstance: null,
  autoSaveTimer: null,
};

export function addOpenFile(path, fileData) {
  AppState.openFiles.set(path, {
    name: fileData.name,
    path,
    content: fileData.content ?? '',
    savedContent: fileData.content ?? '',
    model: fileData.model ?? null,
    viewState: fileData.viewState ?? null,
    language: fileData.language ?? 'plaintext',
    handle: fileData.handle ?? null,
    modified: fileData.modified ?? false,
    isVirtual: fileData.isVirtual ?? !AppState.isRealFS,
  });
}

export function getOpenFile(path) {
  return AppState.openFiles.get(path) || null;
}

export function removeOpenFile(path) {
  const file = AppState.openFiles.get(path);
  if (file && file.model) {
    file.model.dispose();
  }
  AppState.openFiles.delete(path);

  if (AppState.activeFilePath === path) {
    const remaining = Array.from(AppState.openFiles.keys());
    AppState.activeFilePath = remaining.length
      ? remaining[remaining.length - 1]
      : null;
  }
}

export function setActiveFile(path) {
  if (AppState.openFiles.has(path)) {
    AppState.activeFilePath = path;
    return true;
  }
  return false;
}

export function markFileModified(path, modified = true) {
  const file = AppState.openFiles.get(path);
  if (file) {
    file.modified = modified;
  }
}

export function isAnyFileModified() {
  for (const file of AppState.openFiles.values()) {
    if (file.modified) return true;
  }
  return false;
}

export function resetState() {
  AppState.openFiles.forEach(f => f.model && f.model.dispose());
  AppState.openFiles.clear();
  AppState.activeFilePath = null;
  AppState.rootDirHandle = null;
  AppState.isRealFS = false;
  clearTimeout(AppState.autoSaveTimer);
  AppState.autoSaveTimer = null;
}

export function loadConfig() {
  try {
    const saved = localStorage.getItem('editor_config');
    if (saved) {
      Object.assign(AppState.config, JSON.parse(saved));
    }
  } catch (e) {
    console.warn('No se pudo cargar la configuración guardada:', e);
  }
  return AppState.config;
}

export function saveConfig() {
  try {
    localStorage.setItem('editor_config', JSON.stringify(AppState.config));
  } catch (e) {
    console.warn('No se pudo guardar la configuración:', e);
  }
}