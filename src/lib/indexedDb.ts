// Memory-only fallback cache (useful in iframe environments where IndexedDB might be blocked)
const memoryCache = new Map<string, Blob>();

const DB_NAME = 'YogoTeacherStorage';
const STORE_NAME = 'files';
const DB_VERSION = 1;

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      if (!window.indexedDB) {
        throw new Error('IndexedDB is not supported in this browser');
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    } catch (e) {
      reject(e);
    }
  });
}

export async function saveFileLocal(workspaceId: string, file: Blob): Promise<void> {
  // Always write to in-memory cache first
  memoryCache.set(workspaceId, file);

  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(file, workspaceId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.warn("IndexedDB is not available. Using memory-only storage fallback.", error);
    // Since we successfully wrote to memoryCache, we consider this a partial success and do not throw
  }
}

export async function getFileLocal(workspaceId: string): Promise<Blob | null> {
  // 1. Try in-memory cache first
  if (memoryCache.has(workspaceId)) {
    return memoryCache.get(workspaceId) || null;
  }

  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(workspaceId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result || null;
        if (result) {
          memoryCache.set(workspaceId, result); // Cache it in memory for fast subsequent reads
        }
        resolve(result);
      };
    });
  } catch (error) {
    console.warn("IndexedDB read failed, memory cache only.", error);
    return null;
  }
}

export async function deleteFileLocal(workspaceId: string): Promise<void> {
  memoryCache.delete(workspaceId);

  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(workspaceId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.warn("IndexedDB delete failed.", error);
  }
}
