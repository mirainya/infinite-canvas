// Node.js 22+ ships a built-in localStorage that lacks .clear() and conflicts
// with jsdom's implementation. This setup file ensures a working localStorage
// is available in the test environment.

const store: Record<string, string> = {};

const storage: Storage = {
  get length() {
    return Object.keys(store).length;
  },
  clear() {
    for (const key of Object.keys(store)) {
      delete store[key];
    }
  },
  getItem(key: string) {
    return key in store ? store[key] : null;
  },
  key(index: number) {
    return Object.keys(store)[index] ?? null;
  },
  removeItem(key: string) {
    delete store[key];
  },
  setItem(key: string, value: string) {
    store[key] = String(value);
  },
};

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  writable: true,
  configurable: true,
});
