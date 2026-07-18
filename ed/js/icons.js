// ============================================================
// icons.js - Íconos de la UI con Codicons reales de VS Code
// (los íconos de ARCHIVO por extensión se mantienen intactos:
// se siguen usando tus logos en assets/icons/languages/)
// ============================================================
import { getFileExtension } from './fs-utils.js';

// Carpeta donde debes colocar tus logos de lenguajes.
// Cada archivo debe llamarse igual que el valor de este mapa,
// ej: html.svg, css.svg, js.svg, py.svg, etc.
export const ICON_BASE_PATH = 'assets/icons/languages/';

const ICON_FILES = {
  html: 'html.svg',
  htm: 'html.svg',
  css: 'css.svg',
  scss: 'scss.svg',
  less: 'less.svg',
  js: 'js.svg',
  mjs: 'js.svg',
  cjs: 'js.svg',
  jsx: 'jsx.svg',
  ts: 'ts.svg',
  tsx: 'tsx.svg',
  json: 'json.svg',
  md: 'md.svg',
  markdown: 'md.svg',
  py: 'py.svg',
  xml: 'xml.svg',
  yml: 'yaml.svg',
  yaml: 'yaml.svg',
  txt: 'txt.svg',
  sh: 'shell.svg',
  bash: 'shell.svg',
  sql: 'sql.svg',
  php: 'php.svg',
  java: 'java.svg',
  c: 'c.svg',
  h: 'c.svg',
  cpp: 'cpp.svg',
  hpp: 'cpp.svg',
  cs: 'csharp.svg',
  go: 'go.svg',
  rs: 'rust.svg',
  rb: 'ruby.svg',
  vue: 'vue.svg',
  svg: 'svg.svg',
  ini: 'ini.svg',
  toml: 'ini.svg',
  dockerfile: 'docker.svg',
  env: 'env.svg',
};

// Ícono de archivo genérico incrustado (data URI), se usa si falta
// el logo del lenguaje o si el archivo de imagen no carga.
const FALLBACK_DATA_URI = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18">' +
  '<path fill="#c5c5c5" d="M4 1h6l4 4v12H4V1z"/>' +
  '<path fill="#8c8c8c" d="M10 1l4 4h-4V1z"/></svg>'
);

function iconImg(fileName) {
  return `<img class="file-icon-img" src="${ICON_BASE_PATH}${fileName}" width="16" height="16" alt="" onerror="this.onerror=null;this.src='${FALLBACK_DATA_URI}';">`;
}

const FALLBACK_IMG_TAG = `<img class="file-icon-img" src="${FALLBACK_DATA_URI}" width="16" height="16" alt="">`;

// ---------- Íconos de ARCHIVO por extensión (SIN CAMBIOS) ----------
export function getFileIcon(filename) {
  if (filename && filename.toLowerCase() === '.gitignore') {
    return iconImg('gitignore.svg');
  }
  const ext = getFileExtension(filename);
  const file = ICON_FILES[ext];
  return file ? iconImg(file) : FALLBACK_IMG_TAG;
}

// ---------- Íconos de CARPETA -> ahora con Codicons reales ----------
export function getFolderIcon(expanded) {
  return expanded
    ? '<i class="codicon codicon-folder-opened folder-codicon"></i>'
    : '<i class="codicon codicon-folder folder-codicon"></i>';
}

// ---------- Íconos del menú contextual -> Codicons reales ----------
export const MENU_ICONS = {
  newFile: '<i class="codicon codicon-new-file"></i>',
  newFolder: '<i class="codicon codicon-new-folder"></i>',
  rename: '<i class="codicon codicon-edit"></i>',
  delete: '<i class="codicon codicon-trash"></i>',
};
