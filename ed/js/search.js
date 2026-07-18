// ============================================================
// search.js - Búsqueda de texto en todos los archivos del
// proyecto (real vía File System Access API, o virtual),
// con resultados clicables que saltan a la línea exacta.
// ============================================================

import { AppState } from './state.js';
import { getLanguageFromExtension, normalizePath, walkTree } from './fs-utils.js';
import { openFileInEditor } from './editor.js';
import { getFileIcon } from './icons.js';

let inputEl, resultsEl, summaryEl, clearBtn;
let debounceTimer = null;
let searchToken = 0; // evita que una búsqueda vieja pise a una más nueva

const BINARY_EXT_BLOCKLIST = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'pdf', 'zip', 'rar', '7z', 'gz', 'tar',
  'mp3', 'mp4', 'wav', 'ogg', 'webm', 'mov',
  'wasm', 'exe', 'dll', 'so', 'bin',
]);
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB por archivo
const MAX_MATCHES_PER_FILE = 200;
const MAX_MATCHES_SHOWN_PER_FILE = 50;

export function initSearchPanel({ input, results, summary, clear }) {
  inputEl = input;
  resultsEl = results;
  summaryEl = summary;
  clearBtn = clear;

  inputEl.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = inputEl.value;
    clearBtn.style.display = query ? 'flex' : 'none';
    if (!query.trim()) { renderEmpty(); return; }
    debounceTimer = setTimeout(() => runSearch(query), 300);
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      runSearch(inputEl.value);
    }
  });

  clearBtn.addEventListener('click', () => {
    inputEl.value = '';
    clearBtn.style.display = 'none';
    renderEmpty();
    inputEl.focus();
  });

  renderEmpty();
}

/** Enfoca el campo de búsqueda (llamado al abrir el panel de búsqueda). */
export function focusSearchInput() {
  if (inputEl) inputEl.focus();
}

function renderEmpty() {
  summaryEl.textContent = '';
  resultsEl.innerHTML = '';
}

async function runSearch(query) {
  const q = query.trim();
  if (!q) { renderEmpty(); return; }

  const token = ++searchToken;
  resultsEl.innerHTML = '<div class="search-loading">Buscando...</div>';
  summaryEl.textContent = '';

  let fileResults = [];
  try {
    if (AppState.isRealFS && AppState.rootDirHandle) {
      fileResults = await searchRealFs(AppState.rootDirHandle, '/', q.toLowerCase());
    } else {
      fileResults = searchVirtualFs(AppState.fileSystem, q.toLowerCase());
    }
  } catch (err) {
    console.error('Error buscando en los archivos:', err);
  }

  if (token !== searchToken) return; // llegó una búsqueda más nueva mientras tanto
  renderResults(q, fileResults);
}

async function searchRealFs(dirHandle, path, qLower, acc = []) {
  for await (const [name, handle] of dirHandle.entries()) {
    const entryPath = normalizePath(`${path === '/' ? '' : path}/${name}`);
    if (handle.kind === 'directory') {
      await searchRealFs(handle, entryPath, qLower, acc);
    } else {
      const dot = name.lastIndexOf('.');
      const ext = dot > -1 ? name.slice(dot + 1).toLowerCase() : '';
      if (BINARY_EXT_BLOCKLIST.has(ext)) continue;

      try {
        const file = await handle.getFile();
        if (file.size > MAX_FILE_SIZE) continue;
        const content = await file.text();
        const matches = findMatches(content, qLower);
        if (matches.length) {
          acc.push({ path: entryPath, name, content, handle, isVirtual: false, matches });
        }
      } catch {
        // archivo no legible como texto (binario, permiso, etc.): se ignora
      }
    }
  }
  return acc;
}

function searchVirtualFs(root, qLower) {
  const acc = [];
  walkTree(root, (node) => {
    if (node.type === 'file') {
      const content = node.content || '';
      const matches = findMatches(content, qLower);
      if (matches.length) {
        acc.push({ path: node.path, name: node.name, content, node, isVirtual: true, matches });
      }
    }
  });
  return acc;
}

function findMatches(content, qLower) {
  if (!qLower) return [];
  const lines = content.split('\n');
  const matches = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const lineText = lines[idx];
    const lower = lineText.toLowerCase();
    let from = 0;
    let pos;
    while ((pos = lower.indexOf(qLower, from)) !== -1) {
      matches.push({ lineNumber: idx + 1, lineText, matchStart: pos, matchEnd: pos + qLower.length });
      from = pos + qLower.length;
      if (matches.length >= MAX_MATCHES_PER_FILE) return matches;
    }
  }
  return matches;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderResults(query, fileResults) {
  resultsEl.innerHTML = '';
  const totalMatches = fileResults.reduce((sum, f) => sum + f.matches.length, 0);

  if (totalMatches === 0) {
    summaryEl.textContent = 'Sin resultados';
    resultsEl.innerHTML = `<div class="search-empty">No se encontraron coincidencias para "${escapeHtml(query)}".</div>`;
    return;
  }

  summaryEl.textContent = `${totalMatches} resultado${totalMatches !== 1 ? 's' : ''} en ${fileResults.length} archivo${fileResults.length !== 1 ? 's' : ''}`;

  fileResults.forEach((fileResult) => {
    const fileGroup = document.createElement('div');
    fileGroup.className = 'search-file-group';

    const fileHeader = document.createElement('div');
    fileHeader.className = 'search-file-header';

    const icon = document.createElement('span');
    icon.className = 'search-file-icon';
    icon.innerHTML = getFileIcon(fileResult.name);

    const name = document.createElement('span');
    name.className = 'search-file-name';
    name.textContent = fileResult.name;
    name.title = fileResult.path;

    const count = document.createElement('span');
    count.className = 'search-file-count';
    count.textContent = fileResult.matches.length;

    fileHeader.appendChild(icon);
    fileHeader.appendChild(name);
    fileHeader.appendChild(count);
    fileGroup.appendChild(fileHeader);

    const matchList = document.createElement('ul');
    matchList.className = 'search-match-list';

    fileResult.matches.slice(0, MAX_MATCHES_SHOWN_PER_FILE).forEach((match) => {
      const li = document.createElement('li');
      li.className = 'search-match-row';

      const lineNum = document.createElement('span');
      lineNum.className = 'search-match-line';
      lineNum.textContent = match.lineNumber;

      const preview = document.createElement('span');
      preview.className = 'search-match-preview';
      const before = escapeHtml(match.lineText.slice(0, match.matchStart).trimStart());
      const hit = escapeHtml(match.lineText.slice(match.matchStart, match.matchEnd));
      const after = escapeHtml(match.lineText.slice(match.matchEnd));
      preview.innerHTML = `${before}<mark>${hit}</mark>${after}`;

      li.appendChild(lineNum);
      li.appendChild(preview);
      li.addEventListener('click', () => openMatch(fileResult, match));
      matchList.appendChild(li);
    });

    fileGroup.appendChild(matchList);
    resultsEl.appendChild(fileGroup);
  });
}

function openMatch(fileResult, match) {
  const language = getLanguageFromExtension(fileResult.name);
  openFileInEditor({
    path: fileResult.path,
    name: fileResult.name,
    content: fileResult.content,
    language,
    handle: fileResult.isVirtual ? null : fileResult.handle,
    isVirtual: fileResult.isVirtual,
  });

  if (AppState.editorInstance) {
    const range = {
      startLineNumber: match.lineNumber,
      startColumn: match.matchStart + 1,
      endLineNumber: match.lineNumber,
      endColumn: match.matchEnd + 1,
    };
    AppState.editorInstance.revealRangeInCenter(range);
    AppState.editorInstance.setSelection(range);
    AppState.editorInstance.focus();
  }
}
