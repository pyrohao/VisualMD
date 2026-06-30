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
  let indexedDbAvailable = true

  function resetDatabaseConnection(database?: IDBDatabase | null) {
    try {
      database?.close()
    } catch {
      // Ignore close errors from already-closing connections.
    }
    dbPromise = null
  }

  function isDatabaseClosingError(error: unknown) {
    if (!(error instanceof Error)) {
      return false
    }

    return (
      error.name === 'InvalidStateError' ||
      error.message.includes('connection is closing') ||
      error.message.includes('The database connection is closing')
    )
  }

  function canUseIndexedDb() {
    return indexedDbAvailable && typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined'
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
          resetDatabaseConnection(database)
        }
        database.onclose = () => {
          resetDatabaseConnection(database)
        }
        resolve(database)
      }

      request.onerror = () => {
        dbPromise = null
        reject(request.error || new Error(`Failed to open IndexedDB database: ${dbName}`))
      }

      request.onblocked = () => {
        dbPromise = null
        reject(new Error(`IndexedDB database is blocked: ${dbName}`))
      }
    })

    return dbPromise
  }

  async function readRawValue(key: string) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const database = await openDatabase()
      if (!database) {
        return null
      }

      try {
        return await new Promise<string | null>((resolve, reject) => {
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
      } catch (error) {
        if (!isDatabaseClosingError(error) || attempt === 1) {
          throw error
        }
        resetDatabaseConnection(database)
      }
    }

    return null
  }

  async function writeRawValue(key: string, value: string) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const database = await openDatabase()
      if (!database) {
        return false
      }

      try {
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
      } catch (error) {
        if (!isDatabaseClosingError(error) || attempt === 1) {
          throw error
        }
        resetDatabaseConnection(database)
      }
    }

    return false
  }

  async function removeRawValue(key: string) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const database = await openDatabase()
      if (!database) {
        return
      }

      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(storeName, 'readwrite')
          const store = transaction.objectStore(storeName)
          const request = store.delete(key)

          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error || new Error(`Failed to remove persisted state: ${key}`))
        })
        return
      } catch (error) {
        if (!isDatabaseClosingError(error) || attempt === 1) {
          throw error
        }
        resetDatabaseConnection(database)
      }
    }
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

  function disableIndexedDb() {
    indexedDbAvailable = false
    resetDatabaseConnection()
  }

  return {
    getItem: async (name) => {
      const activeKey = legacyStorageKey || name
      if (canUseIndexedDb()) {
        try {
          const indexedDbValue = await readRawValue(activeKey)
          if (indexedDbValue !== null) {
            return parseStorageValue<T>(indexedDbValue)
          }
        } catch {
          disableIndexedDb()
        }
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
      let wroteToIndexedDb = false

      if (canUseIndexedDb()) {
        try {
          wroteToIndexedDb = await writeRawValue(activeKey, serializedValue)
        } catch {
          disableIndexedDb()
        }
      }

      if (wroteToIndexedDb) {
        await removeLegacyValue(activeKey)
        return
      }

      await writeLegacyValue(activeKey, serializedValue)
    },
    removeItem: async (name) => {
      const activeKey = legacyStorageKey || name
      if (canUseIndexedDb()) {
        try {
          await removeRawValue(activeKey)
        } catch {
          disableIndexedDb()
        }
      }
      await removeLegacyValue(activeKey)
    },
  }
}
