// ============================================================
// file-ops.js - Operaciones puras de renombrar/eliminar/crear
// (real vía File System Access API + virtual vía árbol JSON)
// ============================================================
import { AppState } from './state.js';
import { findFolderByPath, normalizePath, insertNode, removeNode, sortTree } from './fs-utils.js';

// ---------------- Helpers de paths ----------------

export function getParentPath(path) {
  const norm = normalizePath(path);
  const idx = norm.lastIndexOf('/');
  return idx <= 0 ? '/' : norm.slice(0, idx);
}

function joinPath(parentPath, name) {
  return normalizePath(parentPath === '/' ? `/${name}` : `${parentPath}/${name}`);
}

// ---------------- Real FS (File System Access API) ----------------

export async function realRenameFile(parentHandle, oldName, newName) {
  const oldFileHandle = await parentHandle.getFileHandle(oldName);
  const file = await oldFileHandle.getFile();
  const content = await file.arrayBuffer();

  const newFileHandle = await parentHandle.getFileHandle(newName, { create: true });
  const writable = await newFileHandle.createWritable();
  await writable.write(content);
  await writable.close();

  await parentHandle.removeEntry(oldName);
  return newFileHandle;
}

async function copyDirRecursive(sourceDirHandle, destDirHandle) {
  for await (const [name, handle] of sourceDirHandle.entries()) {
    if (handle.kind === 'file') {
      const file = await handle.getFile();
      const content = await file.arrayBuffer();
      const newFileHandle = await destDirHandle.getFileHandle(name, { create: true });
      const writable = await newFileHandle.createWritable();
      await writable.write(content);
      await writable.close();
    } else {
      const newSubDir = await destDirHandle.getDirectoryHandle(name, { create: true });
      await copyDirRecursive(handle, newSubDir);
    }
  }
}

// ---------------- NUEVO: borrado recursivo manual y fiable ----------------
// No dependemos de removeEntry(name, {recursive:true}) porque en algunos
// navegadores/versiones no borra el contenido de carpetas no vacías de forma
// consistente. En su lugar, vaciamos la carpeta de adentro hacia afuera
// (borrando primero archivos y subcarpetas) y al final borramos la carpeta
// ya vacía, que sí es una operación soportada de forma fiable.
async function removeDirRecursive(parentHandle, name) {
  const dirHandle = await parentHandle.getDirectoryHandle(name);

  // 1. Vaciar la carpeta primero (recursivo, de adentro hacia afuera)
  for await (const [childName, childHandle] of dirHandle.entries()) {
    if (childHandle.kind === 'directory') {
      await removeDirRecursive(dirHandle, childName);
    } else {
      await dirHandle.removeEntry(childName);
    }
  }

  // 2. Ahora que está vacía, se puede eliminar sin depender de {recursive:true}
  await parentHandle.removeEntry(name);
}

export async function realRenameFolder(parentHandle, oldName, newName) {
  const oldDirHandle = await parentHandle.getDirectoryHandle(oldName);
  const newDirHandle = await parentHandle.getDirectoryHandle(newName, { create: true });

  await copyDirRecursive(oldDirHandle, newDirHandle);

  // Borrado manual y recursivo de la carpeta vieja (antes: removeEntry con
  // {recursive:true}, que dejaba la carpeta anterior sin eliminar)
  await removeDirRecursive(parentHandle, oldName);

  return newDirHandle;
}

export async function realDeleteEntry(parentHandle, name, isFolder) {
  if (isFolder) {
    await removeDirRecursive(parentHandle, name);
  } else {
    await parentHandle.removeEntry(name);
  }
}

export async function realCreateFile(parentHandle, name) {
  return parentHandle.getFileHandle(name, { create: true });
}

export async function realCreateFolder(parentHandle, name) {
  return parentHandle.getDirectoryHandle(name, { create: true });
}

// ---------------- Virtual FS (árbol JSON) ----------------

function renumberPaths(node, newPath) {
  node.path = newPath;
  if (node.type === 'folder' && Array.isArray(node.children)) {
    for (const child of node.children) {
      renumberPaths(child, joinPath(newPath, child.name));
    }
  }
}

export function virtualRename(path, newName) {
  const node = findFolderByPath(AppState.fileSystem, path) ||
    findInTree(AppState.fileSystem, path);
  if (!node) return null;
  const parentPath = getParentPath(node.path);
  const newPath = joinPath(parentPath, newName);
  node.name = newName;
  renumberPaths(node, newPath);
  sortTree(AppState.fileSystem);
  return newPath;
}

function findInTree(node, path) {
  const target = normalizePath(path);
  if (normalizePath(node.path) === target) return node;
  if (node.type === 'folder' && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findInTree(child, target);
      if (found) return found;
    }
  }
  return null;
}

export function virtualDelete(path) {
  return removeNode(AppState.fileSystem, path);
}

export function virtualCreateFile(parentPath, name, content = '') {
  const inserted = insertNode(AppState.fileSystem, parentPath, {
    name, type: 'file', path: joinPath(parentPath, name), content,
  });
  if (inserted) sortTree(AppState.fileSystem);
  return inserted;
}

export function virtualCreateFolder(parentPath, name) {
  const inserted = insertNode(AppState.fileSystem, parentPath, {
    name, type: 'folder', path: joinPath(parentPath, name), expanded: false, children: [],
  });
  if (inserted) sortTree(AppState.fileSystem);
  return inserted;
}