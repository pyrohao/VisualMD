'use client'

import { useEffect, useRef, useState } from 'react'
import { ImageIcon, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildLocalImageDataUrl } from '@/lib/local-image-resolution'
import { getLocalWorkspaceAssetBinary } from '@/lib/local-workspace-storage'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import type { WorkspaceAsset } from '@/types/file-system'
import { DeleteConfirmDialog } from '../delete-confirm-dialog'
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog'
import { toast } from '@/hooks/use-toast'

interface AssetItemProps {
  asset: WorkspaceAsset
}

export function AssetItem({ asset }: AssetItemProps) {
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [isPreviewLoading, setIsPreviewLoading] = useState(false)
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const { getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const { t } = useTranslation()
  const { deleteAsset, exportAsset } = useFileSystemStore()

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowContextMenu(true)

    const closeMenu = () => {
      setShowContextMenu(false)
      document.removeEventListener('click', closeMenu)
    }
    document.addEventListener('click', closeMenu)
  }

  const handleExport = async () => {
    await exportAsset(asset.path)
    toast({ title: t('file.exportSuccess') })
  }

  const handlePreview = async () => {
    setShowPreview(true)
    setIsPreviewLoading(true)

    try {
      const binary = await getLocalWorkspaceAssetBinary(asset.path)
      if (!binary?.contentBase64) {
        setShowPreview(false)
        toast({
          title: t('git.binaryPreviewEmptyContent'),
          variant: 'destructive',
        })
        return
      }

      const dataUrl = buildLocalImageDataUrl(asset.path, binary.contentBase64, binary.mimeType)
      setPreviewUrl(dataUrl)
    } catch {
      setShowPreview(false)
      toast({
        title: t('git.binaryPreviewFailed'),
        variant: 'destructive',
      })
    } finally {
      setIsPreviewLoading(false)
    }
  }

  const handleConfirmDelete = async () => {
    await deleteAsset(asset.path)
    toast({ title: t('toast.fileDeleted') })
  }

  const handleClosePreview = () => {
    setShowPreview(false)
    setPreviewUrl('')
    setIsPreviewLoading(false)
    setPreviewSize(null)
  }

  return (
    <>
      <div
        ref={triggerRef}
        onContextMenu={handleContextMenu}
        onDoubleClick={() => {
          void handlePreview()
        }}
        className={cn('group flex items-center gap-2 rounded px-2 py-1 transition-colors duration-150 hover:bg-white/5')}
        style={{ color: themeConfig.text }}
      >
        <ImageIcon className="h-4 w-4 shrink-0 opacity-70" />
        <span className="flex-1 truncate text-sm">{asset.name}</span>
      </div>

      {showContextMenu && (
        <div
          className="fixed z-50 rounded-md border py-1 shadow-lg"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
          }}
        >
          <button
            onClick={() => {
              void handlePreview()
              setShowContextMenu(false)
            }}
            className="w-full px-4 py-1.5 text-left text-sm transition-colors hover:bg-white/10"
          >
            {t('preview.preview')}
          </button>
          <div className="my-1 border-t" style={{ borderColor: themeConfig.border }} />
          <button
            onClick={() => {
              void handleExport()
              setShowContextMenu(false)
            }}
            className="w-full px-4 py-1.5 text-left text-sm transition-colors hover:bg-white/10"
          >
            {t('common.export')}
          </button>
          <div className="my-1 border-t" style={{ borderColor: themeConfig.border }} />
          <button
            onClick={() => {
              setShowDeleteConfirm(true)
              setShowContextMenu(false)
            }}
            className="w-full px-4 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-white/10"
          >
            {t('common.delete')}
          </button>
        </div>
      )}

      <DeleteConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        itemName={asset.name}
        title="Delete image"
        onConfirm={() => {
          void handleConfirmDelete()
        }}
      />

      <Dialog
        open={showPreview}
        onOpenChange={(open) => {
          if (!open) {
            handleClosePreview()
          } else {
            setShowPreview(true)
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-black/72"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              handleClosePreview()
            }
          }}
          className="fixed inset-0 left-0 top-0 flex h-screen w-screen max-w-none translate-x-0 translate-y-0 items-center justify-center border-0 bg-transparent p-0 shadow-none outline-none sm:max-w-none"
        >
          <DialogTitle className="sr-only">
            {t('git.imagePreview')} - {asset.name}
          </DialogTitle>

          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center px-6 pb-4 pt-6 sm:px-10 sm:pt-8">
            <div
              className="pointer-events-auto max-w-[min(68vw,760px)] text-center text-slate-50"
              style={{
                textShadow: '0 8px 28px rgba(0, 0, 0, 0.45)',
              }}
            >
              <div className="truncate text-[15px] font-medium tracking-[0.01em] sm:text-base">
                {asset.name}
              </div>
              {previewSize ? (
                <div className="mt-1 text-xs text-slate-300/90">
                  {previewSize.width} x {previewSize.height}
                </div>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={handleClosePreview}
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center bg-transparent text-white/68 transition-all duration-150 hover:text-white focus:outline-none sm:right-8 sm:top-7"
            style={{
              filter: 'drop-shadow(0 8px 24px rgba(0, 0, 0, 0.42))',
            }}
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="flex h-full w-full items-center justify-center px-6 pb-8 pt-24 sm:px-10 sm:pb-10 sm:pt-28">
            {isPreviewLoading ? (
              <div
                className="flex h-[70vh] w-[min(88vw,1320px)] items-center justify-center px-6 text-sm text-slate-200/88"
                style={{ textShadow: '0 10px 30px rgba(0, 0, 0, 0.35)' }}
              >
                {t('git.loadingPreview')}
              </div>
            ) : previewUrl ? (
              <img
                src={previewUrl}
                alt={asset.name}
                className="block max-h-[calc(100vh-8rem)] max-w-[calc(100vw-3rem)] object-contain shadow-[0_18px_64px_rgba(0,0,0,0.42)] sm:max-h-[calc(100vh-9.5rem)] sm:max-w-[calc(100vw-6rem)]"
                onLoad={(event) => {
                  setPreviewSize({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }}
              />
            ) : (
              <div
                className="flex h-[70vh] w-[min(88vw,1320px)] items-center justify-center px-6 text-sm text-slate-200/88"
                style={{ textShadow: '0 10px 30px rgba(0, 0, 0, 0.35)' }}
              >
                {t('git.binaryPreviewEmptyContent')}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default AssetItem
