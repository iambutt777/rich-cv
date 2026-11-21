/* =========================================================================
   Local storage for candidate records and settings (IndexedDB).
   Nothing here is ever sent to a server - it stays in this browser.
   ========================================================================= */
window.CVStore = (function () {
  const DB_NAME = 'gcc-cv-maker';   // internal storage name: kept so saved CVs are not lost
  const DB_VERSION = 2;           // 2: adds the downloads store
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('This browser cannot store records (IndexedDB unavailable).'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('candidates')) db.createObjectStore('candidates', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
        if (!db.objectStoreNames.contains('downloads')) db.createObjectStore('downloads', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      fn(t.objectStore(store));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Storage operation was cancelled.'));
    });
  }

  function reqResult(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    async all() {
      const db = await open();
      const list = await reqResult(db.transaction('candidates').objectStore('candidates').getAll());
      return list.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));   // (v4.96) safe with dates saved as numbers
    },
    async get(id) {
      const db = await open();
      return reqResult(db.transaction('candidates').objectStore('candidates').get(id));
    },
    put(record) { return tx('candidates', 'readwrite', s => { s.put(record); }); },
    remove(id) { return tx('candidates', 'readwrite', s => { s.delete(id); }); },
    // PDFs the user downloaded (kept so they can be opened, shared or saved again)
    async downloads() {
      const db = await open();
      const list = await reqResult(db.transaction('downloads').objectStore('downloads').getAll());
      return list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    },
    putDownload(rec) { return tx('downloads', 'readwrite', s => { s.put(rec); }); },
    removeDownload(id) { return tx('downloads', 'readwrite', s => { s.delete(id); }); },
    async getSetting(key) {
      const db = await open();
      return reqResult(db.transaction('settings').objectStore('settings').get(key));
    },
    setSetting(key, value) { return tx('settings', 'readwrite', s => { s.put(value, key); }); },
    removeSetting(key) { return tx('settings', 'readwrite', s => { s.delete(key); }); }
  };
})();
