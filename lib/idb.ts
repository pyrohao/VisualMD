type DbKey = string
const databaseStoreRegistry = new Map<string, Set<string>>()

interface IdbEntry<T> {
  key: DbKey
  value: T
  updatedAt: number
}

function canUseIndexedDb() {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined'
}

export function createIdbStore<T>(dbName: string, storeName: string) {
  let dbPromise: Promise<IDBDatabase | null> | null = null
  const registeredStoreNames = databaseStoreRegistry.get(dbName) || new Set<string>()
  registeredStoreNames.add(storeName)
  databaseStoreRegistry.set(dbName, registeredStoreNames)

  function getRegisteredStoreNames() {
    return Array.from(databaseStoreRegistry.get(dbName) || [])
  }

  function openDatabase(targetVersion?: number): Promise<IDBDatabase | null> {
    if (!canUseIndexedDb()) {
      return Promise.resolve(null)
    }

    if (!targetVersion && dbPromise) {
      return dbPromise
    }

    dbPromise = new Promise((resolve, reject) => {
      const request = typeof targetVersion === 'number'
        ? window.indexedDB.open(dbName, targetVersion)
        : window.indexedDB.open(dbName)

      request.onupgradeneeded = () => {
        const database = request.result
        getRegisteredStoreNames().forEach((registeredStoreName) => {
          if (!database.objectStoreNames.contains(registeredStoreName)) {
            database.createObjectStore(registeredStoreName, { keyPath: 'key' })
          }
        })
      }

      request.onsuccess = () => {
        const database = request.result

        const missingStoreNames = getRegisteredStoreNames().filter(
          (registeredStoreName) => !database.objectStoreNames.contains(registeredStoreName)
        )

        if (missingStoreNames.length > 0) {
          const nextVersion = Math.max(database.version + 1, 1)
          database.close()
          dbPromise = null
          void openDatabase(nextVersion).then(resolve).catch(reject)
          return
        }

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

  async function getDatabaseForStore() {
    const database = await openDatabase()
    if (!database) {
      return null
    }

    if (database.objectStoreNames.contains(storeName)) {
      return database
    }

    const nextVersion = Math.max(database.version + 1, 1)
    database.close()
    dbPromise = null
    return openDatabase(nextVersion)
  }

  async function getAll() {
    const database = await getDatabaseForStore()
    if (!database) return [] as Array<IdbEntry<T>>

    return new Promise<Array<IdbEntry<T>>>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.getAll()

      request.onsuccess = () => resolve((request.result || []) as Array<IdbEntry<T>>)
      request.onerror = () => reject(request.error || new Error(`Failed to read IndexedDB store: ${storeName}`))
    })
  }

  async function get(key: DbKey) {
    const database = await getDatabaseForStore()
    if (!database) return null

    return new Promise<T | null>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly')
      const store = transaction.objectStore(storeName)
      const request = store.get(key)

      request.onsuccess = () => {
        const entry = request.result as IdbEntry<T> | undefined
        resolve(entry?.value ?? null)
      }

      request.onerror = () => reject(request.error || new Error(`Failed to read key: ${key}`))
    })
  }

  async function set(key: DbKey, value: T) {
    const database = await getDatabaseForStore()
    if (!database) return false

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.put({ key, value, updatedAt: Date.now() } satisfies IdbEntry<T>)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error || new Error(`Failed to write key: ${key}`))
    })

    return true
  }

  async function remove(key: DbKey) {
    const database = await getDatabaseForStore()
    if (!database) return

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)
      const request = store.delete(key)

      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error || new Error(`Failed to remove key: ${key}`))
    })
  }

  return { getAll, get, set, remove }
}
