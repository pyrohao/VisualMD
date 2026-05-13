'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog'
import { AlertTriangle } from 'lucide-react'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'

interface ThemedDeleteDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
}

export function ThemedDeleteDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Delete',
  cancelText = 'Cancel',
}: ThemedDeleteDialogProps) {
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig?.() || themeConfigs.light

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => {
      if (!open) onClose()
    }}>
      <AlertDialogContent
        className="sm:max-w-[460px]"
        style={{
          backgroundColor: themeConfig.card,
          borderColor: `${themeConfig.danger}55`,
          color: themeConfig.text,
        }}
      >
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: `${themeConfig.danger}18`, color: themeConfig.danger }}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <AlertDialogTitle style={{ color: themeConfig.heading }}>{title}</AlertDialogTitle>
              <AlertDialogDescription style={{ color: themeConfig.muted }}>
                {description}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel
            onClick={onClose}
            style={{
              backgroundColor: themeConfig.background,
              borderColor: themeConfig.border,
              color: themeConfig.text,
            }}
          >
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            style={{
              backgroundColor: themeConfig.danger,
              color: themeConfig.buttonText || '#fff',
            }}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
