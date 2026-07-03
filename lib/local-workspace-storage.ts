import { createIdbStore } from '@/lib/idb'
import type { WorkspaceAsset } from '@/types/file-system'

export interface LocalWorkspaceAssetBinary extends WorkspaceAsset {
  contentBase64: string
}

const assetBinaryStore = createIdbStore<LocalWorkspaceAssetBinary>('visualmd-workspace', 'asset-binaries')

export async function saveLocalWorkspaceAssetBinary(record: LocalWorkspaceAssetBinary) {
  return assetBinaryStore.set(record.path, record)
}

export async function getLocalWorkspaceAssetBinary(path: string) {
  return assetBinaryStore.get(path)
}

export async function deleteLocalWorkspaceAssetBinary(path: string) {
  return assetBinaryStore.remove(path)
}

export async function listLocalWorkspaceAssetBinaries() {
  return (await assetBinaryStore.getAll()).map((entry) => entry.value)
}
