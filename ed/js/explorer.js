// ============================================================
// explorer.js - Motor del explorador (real + virtual) con
// renombrar, eliminar, crear, menú contextual y árbol calcado
// a VS Code (twisty animado + guías de indentación)
// ============================================================

import { AppState, getOpenFile } from './state.js';
import { getLanguageFromExtension, normalizePath, sortTree, findFileByPath, findFolderByPath } from './fs-utils.js';
import { verifyPermission, saveDirectoryHandle } from './db.js';
import { openFileInEditor, forceCloseTab, renameOpenFile } from './editor.js';
import { getFileIcon, getFolderIcon, MENU_ICONS } from './icons.js';
import { showContextMenu } from './context-menu.js';
import { showToast } from './notifications.js';
import { confirmDialog } from './dialogs.js';
import {
  realRenameFile, realRenameFolder, realDeleteEntry, realCreateFile, realCreateFolder,
  virtualRename, virtualDelete, virtualCreateFile, virtualCreateFolder, getParentPath,
} from './file-ops.js';

let explorerContainer = null;
const realHandleCache = new Map();
const folderState = new Map();

let hoveredPath = null;
let hoveredType = null;
let hoveredName = null;

// Arrastrar y soltar archivos (solo archivos, no carpetas) entre carpetas
let draggedFilePath = null;

// FIX: permite fijar el contenedor desde app.js ANTES de renderizar,
// para que pickRealDirectory() nunca reciba explorerContainer = null.
export function setExplorerContainer(container) {
  explorerContainer = container;
  bindContainerEvents(container);
}

export async function renderExplorer(container) {
  explorerContainer = container;
  bindContainerEvents(container);

  container.innerHTML = '';
  realHandleCache.clear();
  folderState.clear();

  const rootUl = document.createElement('ul');
  rootUl.className = 'explorer-tree';
  container.appendChild(rootUl);

  if (AppState.isRealFS && AppState.rootDirHandle) {
    realHandleCache.set('/', { handle: AppState.rootDirHandle, kind: 'directory', parentHandle: null });
    folderState.set('/', {
      ul: rootUl, isVirtual: false, depth: 0,
      realHandle: AppState.rootDirHandle, parentHandle: null,
      get isExpanded() { return true; },
      expand: async () => {},
    });
    await renderRealFolder(AppState.rootDirHandle, '/', rootUl, 0);
  } else {
    sortTree(AppState.fileSystem);
    folderState.set('/', {
      ul: rootUl, isVirtual: true, depth: 0, node: AppState.fileSystem,
      get isExpanded() { return true; },
      expand: async () => {},
    });
    renderVirtualFolder(AppState.fileSystem, rootUl, 0);
  }
}

function bindContainerEvents(container) {
  if (container.dataset.boundEvents) return;
  container.dataset.boundEvents = '1';

  container.addEventListener('contextmenu', (e) => {
    if (e.target === container || e.target.classList.contains('explorer-tree')) {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, [
        { label: 'Nuevo archivo...', icon: MENU_ICONS.newFile, action: () => startCreateEntry('/', 'file') },
        { label: 'Nueva carpeta...', icon: MENU_ICONS.newFolder, action: () => startCreateEntry('/', 'folder') },
      ]);
    }
  });

  container.addEventListener('mouseleave', () => {
    hoveredPath = null; hoveredType = null; hoveredName = null;
  });

  // Soltar un archivo arrastrado sobre el espacio vacío del árbol lo
  // mueve de vuelta a la raíz del proyecto.
  const isEmptySpace = (target) => target === container || target.classList.contains('explorer-tree');

  container.addEventListener('dragover', (e) => {
    if (!draggedFilePath || !isEmptySpace(e.target)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    container.classList.add('drag-over-root');
  });
  container.addEventListener('dragleave', (e) => {
    if (isEmptySpace(e.target)) container.classList.remove('drag-over-root');
  });
  container.addEventListener('drop', async (e) => {
    if (!draggedFilePath || !isEmptySpace(e.target)) return;
    e.preventDefault();
    container.classList.remove('drag-over-root');
    await handleFileDrop(draggedFilePath, '/');
  });
}

document.addEventListener('keydown', (e) => {
  if (!hoveredPath) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  if (e.key === 'F2') {
    e.preventDefault();
    startRenameEntry(hoveredPath, hoveredType, hoveredName);
  } else if (e.key === 'Delete') {
    e.preventDefault();
    deleteEntryByPath(hoveredPath, hoveredType, hoveredName);
  }
});

// ---------------- Construcción de filas (calcado a VS Code) ----------------

// Cada fila se compone de: [guías de indentación] [twisty] [ícono] [label].
// Las guías son una línea vertical por cada nivel de anidación (igual que
// el árbol real de VS Code); el twisty es la flechita que rota 90° al
// expandir/colapsar una carpeta (los archivos llevan un twisty vacío,
// solo para mantener la alineación con las carpetas hermanas).
function buildRowSkeleton(depth) {
  const row = document.createElement('div');
  row.className = 'explorer-row';

  for (let i = 0; i < depth; i++) {
    const guide = document.createElement('span');
    guide.className = 'indent-guide';
    row.appendChild(guide);
  }

  const twistyEl = document.createElement('span');
  twistyEl.className = 'explorer-twisty';

  const iconEl = document.createElement('span');
  iconEl.className = 'explorer-icon';

  row.appendChild(twistyEl);
  row.appendChild(iconEl);

  return { row, twistyEl, iconEl };
}

// ---------------- Árbol virtual ----------------

function renderVirtualFolder(folderNode, parentUl, depth) {
  for (const child of folderNode.children || []) {
    const li = document.createElement('li');
    li.dataset.path = child.path;
    li.className = child.type === 'folder' ? 'explorer-folder' : 'explorer-file';

    const { row, twistyEl, iconEl } = buildRowSkeleton(depth);

    const label = document.createElement('span');
    label.className = 'explorer-label';
    label.textContent = child.name;
    row.appendChild(label);
    li.appendChild(row);

    if (child.type === 'folder') {
      twistyEl.innerHTML = '<i class="codicon codicon-chevron-right"></i>';
      twistyEl.classList.toggle('expanded', !!child.expanded);
      iconEl.innerHTML = getFolderIcon(child.expanded);

      const childUl = document.createElement('ul');
      childUl.className = 'explorer-subtree';
      childUl.style.display = child.expanded ? 'block' : 'none';
      renderVirtualFolder(child, childUl, depth + 1);
      li.appendChild(childUl);

      folderState.set(child.path, {
        ul: childUl, isVirtual: true, depth: depth + 1, node: child, twistyEl,
        get isExpanded() { return child.expanded; },
        expand: async () => {
          if (!child.expanded) {
            child.expanded = true;
            iconEl.innerHTML = getFolderIcon(true);
            twistyEl.classList.add('expanded');
            childUl.style.display = 'block';
          }
        },
      });

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        child.expanded = !child.expanded;
        iconEl.innerHTML = getFolderIcon(child.expanded);
        twistyEl.classList.toggle('expanded', child.expanded);
        childUl.style.display = child.expanded ? 'block' : 'none';
      });

      row.addEventListener('mouseenter', () => setHovered(child.path, 'folder', child.name));
      row.addEventListener('contextmenu', (e) => onEntryContextMenu(e, child.path, 'folder', child.name));
      bindFolderDropTarget(row, child.path);
    } else {
      iconEl.innerHTML = getFileIcon(child.name);

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        openVirtualFile(child);
        highlightActiveRow(child.path);
      });
      row.addEventListener('mouseenter', () => setHovered(child.path, 'file', child.name));
      row.addEventListener('contextmenu', (e) => onEntryContextMenu(e, child.path, 'file', child.name));
      bindFileDragSource(li, row, child.path);
    }

    parentUl.appendChild(li);
  }
}

function openVirtualFile(fileNode) {
  const language = getLanguageFromExtension(fileNode.name);
  openFileInEditor({
    path: fileNode.path, name: fileNode.name, content: fileNode.content ?? '',
    language, handle: null, isVirtual: true,
  });
}

// ---------------- Árbol real (File System Access API) ----------------

async function renderRealFolder(dirHandle, path, parentUl, depth) {
  const entries = [];
  for await (const [name, handle] of dirHandle.entries()) entries.push({ name, handle });

  entries.sort((a, b) => {
    const aDir = a.handle.kind === 'directory', bDir = b.handle.kind === 'directory';
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });

  for (const { name, handle } of entries) {
    const entryPath = normalizePath(`${path === '/' ? '' : path}/${name}`);
    realHandleCache.set(entryPath, { handle, kind: handle.kind, parentHandle: dirHandle });

    const li = document.createElement('li');
    li.dataset.path = entryPath;

    const { row, twistyEl, iconEl } = buildRowSkeleton(depth);

    const label = document.createElement('span');
    label.className = 'explorer-label';
    label.textContent = name;
    row.appendChild(label);
    li.appendChild(row);

    if (handle.kind === 'directory') {
      li.className = 'explorer-folder';
      twistyEl.innerHTML = '<i class="codicon codicon-chevron-right"></i>';
      iconEl.innerHTML = getFolderIcon(false);

      const childUl = document.createElement('ul');
      childUl.className = 'explorer-subtree';
      childUl.style.display = 'none';
      li.appendChild(childUl);

      let expanded = false;
      let loaded = false;

      const doExpand = async () => {
        if (expanded) return;
        expanded = true;
        iconEl.innerHTML = getFolderIcon(true);
        twistyEl.classList.add('expanded');
        childUl.style.display = 'block';
        if (!loaded) {
          loaded = true;
          await renderRealFolder(handle, entryPath, childUl, depth + 1);
        }
      };

      folderState.set(entryPath, {
        ul: childUl, isVirtual: false, depth: depth + 1,
        realHandle: handle, parentHandle: dirHandle, twistyEl,
        get isExpanded() { return expanded; },
        expand: doExpand,
      });

      row.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (expanded) {
          expanded = false;
          iconEl.innerHTML = getFolderIcon(false);
          twistyEl.classList.remove('expanded');
          childUl.style.display = 'none';
        } else {
          await doExpand();
        }
      });

      row.addEventListener('mouseenter', () => setHovered(entryPath, 'folder', name));
      row.addEventListener('contextmenu', (e) => onEntryContextMenu(e, entryPath, 'folder', name));
      bindFolderDropTarget(row, entryPath);
    } else {
      li.className = 'explorer-file';
      iconEl.innerHTML = getFileIcon(name);

      row.addEventListener('click', async (e) => {
        e.stopPropagation();
        await openRealFile(handle, entryPath, name);
        highlightActiveRow(entryPath);
      });
      row.addEventListener('mouseenter', () => setHovered(entryPath, 'file', name));
      row.addEventListener('contextmenu', (e) => onEntryContextMenu(e, entryPath, 'file', name));
      bindFileDragSource(li, row, entryPath);
    }

    parentUl.appendChild(li);
  }
}

async function openRealFile(fileHandle, path, name) {
  try {
    const hasPermission = await verifyPermission(fileHandle, true);
    if (!hasPermission) {
      showToast({ type: 'error', message: 'Permiso denegado para acceder a este archivo.' });
      return;
    }

    const file = await fileHandle.getFile();
    const content = await file.text();
    const language = getLanguageFromExtension(name);

    openFileInEditor({
      path, name, content, language, handle: fileHandle, isVirtual: false,
      lastModified: file.lastModified,
    });
  } catch (err) {
    console.error('Error abriendo archivo real:', err);
    showToast({ type: 'error', message: `No se pudo abrir "${name}": ${err.message}` });
  }
}

export function getCachedHandle(path) {
  return realHandleCache.get(normalizePath(path)) || null;
}

// ---------------- Arrastrar y soltar archivos (mover entre carpetas) ----------------

function bindFileDragSource(li, row, filePath) {
  li.draggable = true;

  row.addEventListener('dragstart', (e) => {
    draggedFilePath = filePath;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', filePath); } catch { /* algunos navegadores móviles no lo soportan */ }
    row.classList.add('dragging');
  });

  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    draggedFilePath = null;
    if (explorerContainer) {
      explorerContainer.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      explorerContainer.classList.remove('drag-over-root');
    }
  });
}

function bindFolderDropTarget(row, folderPath) {
  row.addEventListener('dragover', (e) => {
    if (!draggedFilePath) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    row.classList.add('drag-over');
  });
  row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
  row.addEventListener('drop', async (e) => {
    if (!draggedFilePath) return;
    e.preventDefault();
    e.stopPropagation();
    row.classList.remove('drag-over');
    await handleFileDrop(draggedFilePath, folderPath);
  });
}

async function handleFileDrop(sourcePath, targetFolderPath) {
  const normalizedTarget = normalizePath(targetFolderPath);
  const currentParent = getParentPath(sourcePath);
  const fileName = sourcePath.split('/').pop();
  draggedFilePath = null;

  if (normalizedTarget === currentParent) return; // ya está en esa carpeta, no hacer nada

  try {
    let newHandle = null;
    if (AppState.isRealFS) {
      newHandle = await moveFileReal(sourcePath, normalizedTarget, fileName);
    } else {
      moveFileVirtual(sourcePath, normalizedTarget, fileName);
    }

    const newPath = normalizePath(normalizedTarget === '/' ? `/${fileName}` : `${normalizedTarget}/${fileName}`);
    if (getOpenFile(sourcePath)) {
      renameOpenFile(sourcePath, newPath, fileName, newHandle);
    }

    showToast({ type: 'success', message: `"${fileName}" movido correctamente.` });
  } catch (err) {
    console.error('Error moviendo archivo:', err);
    showToast({ type: 'error', message: `No se pudo mover "${fileName}": ${err.message}` });
  }
  await renderExplorer(explorerContainer);
}

async function resolveRealDirHandle(path) {
  const norm = normalizePath(path);
  if (norm === '/') return AppState.rootDirHandle;
  const parts = norm.split('/').filter(Boolean);
  let handle = AppState.rootDirHandle;
  for (const part of parts) {
    handle = await handle.getDirectoryHandle(part);
  }
  return handle;
}

async function moveFileReal(sourcePath, targetFolderPath, fileName) {
  const sourceMeta = realHandleCache.get(normalizePath(sourcePath));
  if (!sourceMeta || !sourceMeta.parentHandle) throw new Error('No se encontró la referencia real del archivo de origen.');

  const targetDirHandle = await resolveRealDirHandle(targetFolderPath);

  let collision = false;
  try { await targetDirHandle.getFileHandle(fileName); collision = true; } catch { /* no existe: perfecto */ }
  if (collision) throw new Error(`ya existe un archivo llamado "${fileName}" en la carpeta destino`);

  const file = await sourceMeta.handle.getFile();
  const content = await file.arrayBuffer();

  const newFileHandle = await targetDirHandle.getFileHandle(fileName, { create: true });
  const writable = await newFileHandle.createWritable();
  await writable.write(content);
  await writable.close();

  await sourceMeta.parentHandle.removeEntry(fileName);

  return newFileHandle;
}

function moveFileVirtual(sourcePath, targetFolderPath, fileName) {
  const node = findFileByPath(AppState.fileSystem, sourcePath);
  if (!node) throw new Error('archivo de origen no encontrado');

  const targetFolder = findFolderByPath(AppState.fileSystem, targetFolderPath);
  if (!targetFolder) throw new Error('carpeta destino no encontrada');

  if ((targetFolder.children || []).some(c => c.name === fileName)) {
    throw new Error(`ya existe un archivo llamado "${fileName}" en la carpeta destino`);
  }

  const content = node.content ?? '';
  virtualDelete(sourcePath);
  virtualCreateFile(targetFolderPath, fileName, content);
}

function setHovered(path, type, name) {
  hoveredPath = path; hoveredType = type; hoveredName = name;
}

function highlightActiveRow(path) {
  if (!explorerContainer) return;
  explorerContainer.querySelectorAll('.explorer-row.active').forEach(el => el.classList.remove('active'));
  const li = explorerContainer.querySelector(`li[data-path="${CSS.escape(path)}"]`);
  if (li) {
    const row = li.querySelector(':scope > .explorer-row');
    if (row) row.classList.add('active');
  }
}

export function updateExplorerModifiedIndicator(path, modified) {
  if (!explorerContainer) return;
  const li = explorerContainer.querySelector(`li[data-path="${CSS.escape(path)}"]`);
  if (!li) return;
  const label = li.querySelector(':scope > .explorer-row .explorer-label');
  if (!label) return;
  const baseName = label.textContent.replace(/^\u25CF\s/, '');
  label.textContent = modified ? `● ${baseName}` : baseName;
}

function onEntryContextMenu(e, path, type, name) {
  e.preventDefault();
  e.stopPropagation();
  setHovered(path, type, name);

  const items = [];
  if (type === 'folder') {
    items.push(
      { label: 'Nuevo archivo...', icon: MENU_ICONS.newFile, action: () => startCreateEntry(path, 'file') },
      { label: 'Nueva carpeta...', icon: MENU_ICONS.newFolder, action: () => startCreateEntry(path, 'folder') },
      { separator: true },
    );
  }
  items.push(
    { label: 'Renombrar', icon: MENU_ICONS.rename, keybinding: 'F2', action: () => startRenameEntry(path, type, name) },
    { label: 'Eliminar', icon: MENU_ICONS.delete, danger: true, keybinding: 'Del', action: () => deleteEntryByPath(path, type, name) },
  );

  showContextMenu(e.clientX, e.clientY, items);
}

async function ensureExpanded(path) {
  const st = folderState.get(path);
  if (st && !st.isExpanded) await st.expand();
  return st;
}

async function startCreateEntry(parentPath, type) {
  const st = await ensureExpanded(parentPath);
  if (!st) return;

  const li = document.createElement('li');
  const { row, twistyEl, iconEl } = buildRowSkeleton(st.depth);

  if (type === 'folder') twistyEl.innerHTML = '<i class="codicon codicon-chevron-right"></i>';
  iconEl.innerHTML = type === 'folder' ? getFolderIcon(false) : getFileIcon('');

  const input = document.createElement('input');
  input.className = 'explorer-inline-input';
  input.placeholder = type === 'folder' ? 'nombre-carpeta' : 'archivo.ext';

  row.appendChild(input);
  li.appendChild(row);
  st.ul.insertBefore(li, st.ul.firstChild);
  input.focus();

  let done = false;
  const commit = async () => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    li.remove();
    if (!name) return;

    try {
      if (st.isVirtual) {
        type === 'folder' ? virtualCreateFolder(parentPath, name) : virtualCreateFile(parentPath, name, '');
      } else {
        type === 'folder' ? await realCreateFolder(st.realHandle, name) : await realCreateFile(st.realHandle, name);
      }
      showToast({ type: 'success', message: `"${name}" creado correctamente` });
    } catch (err) {
      console.error(err);
      showToast({ type: 'error', message: `No se pudo crear "${name}": ${err.message}` });
    }
    await renderExplorer(explorerContainer);
  };

  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); done = true; li.remove(); }
  });
  input.addEventListener('blur', () => commit());
}

export function createNewFileAtRoot() { return startCreateEntry('/', 'file'); }
export function createNewFolderAtRoot() { return startCreateEntry('/', 'folder'); }

function startRenameEntry(path, type, oldName) {
  const li = explorerContainer.querySelector(`li[data-path="${CSS.escape(path)}"]`);
  if (!li) return;
  const row = li.querySelector(':scope > .explorer-row');
  const label = row.querySelector('.explorer-label');
  if (!label) return;

  const input = document.createElement('input');
  input.className = 'explorer-inline-input';
  input.value = oldName;
  label.replaceWith(input);
  input.focus();
  input.setSelectionRange(0, oldName.lastIndexOf('.') > 0 ? oldName.lastIndexOf('.') : oldName.length);

  let done = false;
  const commit = async () => {
    if (done) return;
    done = true;
    const newName = input.value.trim();
    if (!newName || newName === oldName) { await renderExplorer(explorerContainer); return; }
    await commitRenameEntry(path, type, oldName, newName);
  };

  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); done = true; renderExplorer(explorerContainer); }
  });
  input.addEventListener('blur', () => commit());
}

async function commitRenameEntry(path, type, oldName, newName) {
  try {
    let newPath;
    if (AppState.isRealFS) {
      const meta = realHandleCache.get(path);
      if (!meta || !meta.parentHandle) throw new Error('No se encontró la referencia real del elemento.');
      const newHandle = type === 'file'
        ? await realRenameFile(meta.parentHandle, oldName, newName)
        : await realRenameFolder(meta.parentHandle, oldName, newName);
      const parentPath = getParentPath(path);
      newPath = normalizePath(parentPath === '/' ? `/${newName}` : `${parentPath}/${newName}`);
      syncRenameInOpenFiles(path, newPath, newName, type, newHandle);
    } else {
      newPath = virtualRename(path, newName);
      syncRenameInOpenFiles(path, newPath, newName, type, null);
    }
    showToast({ type: 'success', message: `Renombrado a "${newName}"` });
  } catch (err) {
    console.error(err);
    showToast({ type: 'error', message: `No se pudo renombrar: ${err.message}` });
  }
  await renderExplorer(explorerContainer);
}

function syncRenameInOpenFiles(oldPath, newPath, newName, type, newHandle) {
  if (type === 'file') {
    if (getOpenFile(oldPath)) {
      renameOpenFile(oldPath, newPath, newName, newHandle);
    }
    return;
  }
  const prefix = oldPath === '/' ? '/' : oldPath + '/';
  const affected = Array.from(AppState.openFiles.keys()).filter(p => p === oldPath || p.startsWith(prefix));
  affected.forEach(p => forceCloseTab(p));
  if (affected.length) {
    showToast({ type: 'warning', message: `Se cerraron ${affected.length} pestaña(s) dentro de la carpeta renombrada.` });
  }
}

async function deleteEntryByPath(path, type, name) {
  const confirmed = await confirmDialog(
    type === 'folder' ? 'Eliminar carpeta' : 'Eliminar archivo',
    `¿Seguro que deseas eliminar "${name}"? Esta acción no se puede deshacer.`,
  );
  if (!confirmed) return;

  try {
    if (AppState.isRealFS) {
      const meta = realHandleCache.get(path);
      if (!meta || !meta.parentHandle) throw new Error('No se encontró la referencia real del elemento.');
      await realDeleteEntry(meta.parentHandle, name, type === 'folder');
    } else {
      virtualDelete(path);
    }

    const prefix = path === '/' ? '/' : path + '/';
    const affected = Array.from(AppState.openFiles.keys()).filter(p =>
      type === 'folder' ? (p === path || p.startsWith(prefix)) : p === path
    );
    affected.forEach(p => forceCloseTab(p));

    showToast({ type: 'success', message: `"${name}" eliminado` });
  } catch (err) {
    console.error(err);
    showToast({ type: 'error', message: `No se pudo eliminar "${name}": ${err.message}` });
  }
  await renderExplorer(explorerContainer);
}

export async function pickRealDirectory() {
  try {
    const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const granted = await verifyPermission(dirHandle, true);
    if (!granted) {
      showToast({ type: 'error', message: 'No se concedió permiso de lectura/escritura sobre la carpeta.' });
      return false;
    }

    AppState.rootDirHandle = dirHandle;
    AppState.isRealFS = true;
    await saveDirectoryHandle(dirHandle);

    await renderExplorer(explorerContainer);
    showToast({ type: 'success', message: `Carpeta "${dirHandle.name}" abierta correctamente` });
    return true;
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error('Error seleccionando carpeta:', err);
      showToast({ type: 'error', message: `No se pudo abrir la carpeta: ${err.message}` });
    }
    return false;
  }
}
