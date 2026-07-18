// ============================================================
// fs-utils.js - Utilidades para el árbol de archivos virtual
// ============================================================

// Mapa de extensiones -> lenguaje reconocido por Monaco
const EXTENSION_LANGUAGE_MAP = {
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  json: 'json',
  md: 'markdown',
  markdown: 'markdown',
  xml: 'xml',
  yml: 'yaml',
  yaml: 'yaml',
  txt: 'plaintext',
  sh: 'shell',
  bash: 'shell',
  sql: 'sql',
  php: 'php',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  vue: 'html',
  svg: 'xml',
  ini: 'ini',
  toml: 'ini',
  dockerfile: 'dockerfile',
};

/**
 * Extrae la extensión de un nombre de archivo (sin el punto).
 * @param {string} filename
 * @returns {string} extensión en minúsculas, o '' si no tiene
 */
export function getFileExtension(filename) {
  if (!filename || typeof filename !== 'string') return '';
  const lower = filename.toLowerCase();

  if (lower === 'dockerfile') return 'dockerfile';

  const lastDot = lower.lastIndexOf('.');
  if (lastDot === -1 || lastDot === lower.length - 1) return '';
  return lower.slice(lastDot + 1);
}

/**
 * Determina el lenguaje de Monaco a partir del nombre de archivo.
 * @param {string} filename
 * @returns {string} identificador de lenguaje de Monaco
 */
export function getLanguageFromExtension(filename) {
  const ext = getFileExtension(filename);
  return EXTENSION_LANGUAGE_MAP[ext] || 'plaintext';
}

/**
 * Normaliza un path para que siempre empiece por '/' y no
 * termine con '/' (salvo que sea la raíz).
 * @param {string} path
 */
export function normalizePath(path) {
  if (!path) return '/';
  let p = path.replace(/\\/g, '/');
  if (!p.startsWith('/')) p = '/' + p;
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/**
 * Busca recursivamente un nodo de tipo 'file' por su path exacto
 * dentro del árbol del sistema de archivos virtual.
 *
 * @param {object} node - nodo raíz del árbol (AppState.fileSystem)
 * @param {string} path - path completo del archivo, ej: '/src/app.js'
 * @returns {object|null} el nodo encontrado, o null
 */
export function findFileByPath(node, path) {
  if (!node) return null;
  const target = normalizePath(path);

  if (node.type === 'file' && normalizePath(node.path) === target) {
    return node;
  }

  if (node.type === 'folder' && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findFileByPath(child, target);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Busca recursivamente un nodo de tipo 'folder' por su path exacto.
 *
 * @param {object} node - nodo raíz del árbol
 * @param {string} path - path completo de la carpeta
 * @returns {object|null}
 */
export function findFolderByPath(node, path) {
  if (!node) return null;
  const target = normalizePath(path);

  if (node.type === 'folder') {
    if (normalizePath(node.path) === target) return node;

    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        const found = findFolderByPath(child, target);
        if (found) return found;
      }
    }
  }

  return null;
}

/**
 * Busca recursivamente la carpeta que contiene directamente
 * (es padre inmediato de) el nodo cuyo path coincide con `path`.
 * Útil para operaciones de borrar/renombrar/mover.
 *
 * @param {object} node - nodo raíz del árbol
 * @param {string} path - path del hijo cuyo padre buscamos
 * @returns {object|null} nodo carpeta padre, o null si no se halla
 */
export function findParentFolder(node, path) {
  if (!node || node.type !== 'folder' || !Array.isArray(node.children)) {
    return null;
  }

  const target = normalizePath(path);

  for (const child of node.children) {
    if (normalizePath(child.path) === target) {
      return node;
    }
    if (child.type === 'folder') {
      const found = findParentFolder(child, target);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Recorre todo el árbol aplicando un callback a cada nodo (archivo o carpeta).
 * @param {object} node
 * @param {(node: object, depth: number) => void} callback
 * @param {number} depth
 */
export function walkTree(node, callback, depth = 0) {
  if (!node) return;
  callback(node, depth);
  if (node.type === 'folder' && Array.isArray(node.children)) {
    for (const child of node.children) {
      walkTree(child, callback, depth + 1);
    }
  }
}

/**
 * Inserta un nuevo nodo (archivo o carpeta) dentro de la carpeta
 * indicada por parentPath.
 * @param {object} root - nodo raíz del árbol
 * @param {string} parentPath - path de la carpeta destino
 * @param {object} newNode - nodo a insertar { name, type, path, ... }
 * @returns {boolean} true si se insertó correctamente
 */
export function insertNode(root, parentPath, newNode) {
  const parent = findFolderByPath(root, parentPath);
  if (!parent) return false;
  if (!Array.isArray(parent.children)) parent.children = [];
  parent.children.push(newNode);
  return true;
}

/**
 * Elimina un nodo del árbol dado su path exacto.
 * @param {object} root
 * @param {string} path
 * @returns {boolean} true si se eliminó
 */
export function removeNode(root, path) {
  const parent = findParentFolder(root, path);
  if (!parent) return false;
  const target = normalizePath(path);
  const idx = parent.children.findIndex(c => normalizePath(c.path) === target);
  if (idx === -1) return false;
  parent.children.splice(idx, 1);
  return true;
}

/**
 * Ordena los hijos de una carpeta: carpetas primero, luego archivos,
 * ambos alfabéticamente. Se aplica recursivamente.
 * @param {object} node
 */
export function sortTree(node) {
  if (!node || node.type !== 'folder' || !Array.isArray(node.children)) return;
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });
  node.children.forEach(sortTree);
}