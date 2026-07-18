// ============================================================
// db.js - Persistencia con IndexedDB para FileSystemDirectoryHandle
// ============================================================

const DB_NAME = 'CodeEditorDB';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const ROOT_KEY = 'rootDirHandle';

let dbInstance = null;

/**
 * Abre (o crea) la base de datos IndexedDB.
 * @returns {Promise<IDBDatabase>}
 */
export function openDatabase() {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('Error abriendo IndexedDB:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Guarda el FileSystemDirectoryHandle de la carpeta raíz abierta.
 * @param {FileSystemDirectoryHandle} handle
 */
export async function saveDirectoryHandle(handle) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(handle, ROOT_KEY);

    request.onsuccess = () => resolve(true);
    request.onerror = (event) => {
      console.error('Error guardando el handle:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Recupera el FileSystemDirectoryHandle guardado previamente.
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
export async function getDirectoryHandle() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(ROOT_KEY);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (event) => {
      console.error('Error recuperando el handle:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Elimina el handle almacenado (por ejemplo, al cerrar la carpeta).
 */
export async function clearDirectoryHandle() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(ROOT_KEY);

    request.onsuccess = () => resolve(true);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Verifica (y si es necesario solicita) permisos sobre un handle.
 * Es OBLIGATORIO llamar a esto tras recuperar un handle de IndexedDB,
 * ya que Chrome revoca el permiso activo al refrescar la página aunque
 * el handle en sí siga siendo válido.
 *
 * @param {FileSystemDirectoryHandle|FileSystemFileHandle} handle
 * @param {boolean} readWrite - true para pedir permiso 'readwrite'
 * @returns {Promise<boolean>} true si el permiso fue concedido
 */
export async function verifyPermission(handle, readWrite = true) {
  if (!handle) return false;

  const options = {};
  options.mode = readWrite ? 'readwrite' : 'read';

  // 1. Comprobar si ya tenemos permiso
  if ((await handle.queryPermission(options)) === 'granted') {
    return true;
  }

  // 2. Si no, solicitarlo explícitamente (requiere gesto del usuario,
  //    por eso normalmente se llama dentro de un click handler)
  if ((await handle.requestPermission(options)) === 'granted') {
    return true;
  }

  return false;
}

/**
 * Intenta restaurar la sesión anterior: recupera el handle guardado
 * y valida sus permisos. No solicita permiso automáticamente (eso
 * requiere gesto del usuario); solo comprueba el estado actual.
 * Útil para mostrar un botón "Reabrir última carpeta" en vez de
 * intentar el acceso directo y fallar silenciosamente.
 *
 * @returns {Promise<{handle: FileSystemDirectoryHandle, granted: boolean}|null>}
 */
export async function restoreLastSession() {
  const handle = await getDirectoryHandle();
  if (!handle) return null;

  const options = { mode: 'readwrite' };
  const permissionState = await handle.queryPermission(options);

  return {
    handle,
    granted: permissionState === 'granted',
  };
}