import type { PersistStorage, StorageValue } from 'zustand/middleware'

interface IndexedDbPersistEntry {
  key: string
  value: string
  updatedAt: number
}

interface IndexedDbPersistStorageOptions {
  dbName: string
  storeName: string
  legacyStorageKey?: string
}

function getLegacyLocalStorage() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function parseStorageValue<T>(raw: string | null): StorageValue<T> | null {
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as StorageValue<T>
  } catch {
    return null
  }
}

export function createIndexedDbPersistStorage<T>({
  dbName,
  storeName,
  legacyStorageKey,
}: IndexedDbPersistStorageOptions): PersistStorage<T> {
  let dbPromise: Promise<IDBDatabase | null> | null = null

  function canUseIndexedDb() {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined'
  }

  function openDatabase(): Promise<IDBDatabase | null> {
    if (!canUseIndexedDb()) {
      return Promise.resolve(null)
    }

    if (dbPromise) {
      return dbPromise
    }

    dbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(dbName, 1)

      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: 'key' })
        }
      }

      request.onsuccess = () => {
        const database = request.result
        database.onversionchange = () => {
          database.close()
          dbPromise = null
        }
        resolve(database)
      }

      request.onerror = () => {
        dbPromise = null
        reject(request.error || new Error(`Failed to open IndexedDB database: ${dbName}`))
      }

      request.onblocked = () => {
        reject(new Error(`IndexedDB database is blocked: ${dbName}`))
      }
    })

    return dbPromise
  }

  async function readRawValue(key: string) {
    const database = await openDatabase()
    if (!database) {
      return null
    }

    return new Promise<string | null>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.get(key)

      request.onsuccess = () => {
        const entry = request.result as IndexedDbPersistEntry | undefined
        resolve(typeof entry?.value === 'string' ? entry.value : null)
      }

      request.onerror = () => {
        reject(request.error || new Error(`Failed to read persisted state: ${key}`))
      }
    })
  }

  async function writeRawValue(key: string, value: string) {
    const database = await openDatabase()
    if (!database) {
      return false
    }

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.put({
        key,
        value,
        updatedAt: Date.now(),
      } satisfies IndexedDbPersistEntry)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error || new Error(`Failed to persist state: ${key}`))
    })

    return true
  }

  async function removeRawValue(key: string) {
    const database = await openDatabase()
    if (!database) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.delete(key)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error || new Error(`Failed to remove persisted state: ${key}`))
    })
  }

  async function readLegacyValue(key: string) {
    const storage = getLegacyLocalStorage()
    if (!storage) {
      return null
    }

    return storage.getItem(key)
  }

  async function writeLegacyValue(key: string, value: string) {
    const storage = getLegacyLocalStorage()
    if (!storage) {
      return
    }

    storage.setItem(key, value)
  }

  async function removeLegacyValue(key: string) {
    const storage = getLegacyLocalStorage()
    if (!storage) {
      return
    }

    storage.removeItem(key)
  }

  return {
    getItem: async (name) => {
      const activeKey = legacyStorageKey || name
      const indexedDbValue = await readRawValue(activeKey)
      if (indexedDbValue !== null) {
        return parseStorageValue<T>(indexedDbValue)
      }

      const legacyValue = await readLegacyValue(activeKey)
      if (legacyValue === null) {
        return null
      }

      try {
        const wroteToIndexedDb = await writeRawValue(activeKey, legacyValue)
        if (wroteToIndexedDb) {
          await removeLegacyValue(activeKey)
        }
      } catch {
        // Keep legacy storage untouched if IndexedDB migration fails.
      }

      return parseStorageValue<T>(legacyValue)
    },
    setItem: async (name, value) => {
      const activeKey = legacyStorageKey || name
      const serializedValue = JSON.stringify(value)
      const wroteToIndexedDb = await writeRawValue(activeKey, serializedValue)

      if (wroteToIndexedDb) {
        await removeLegacyValue(activeKey)
        return
      }

      await writeLegacyValue(activeKey, serializedValue)
    },
    removeItem: async (name) => {
      const activeKey = legacyStorageKey || name
      await removeRawValue(activeKey)
      await removeLegacyValue(activeKey)
    },
  }
}
