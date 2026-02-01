'use client'

/**
 * 删除确认对话框组件
 *
 * 通用的删除确认对话框，支持自定义标题、描述和回调
 */

import { AlertTriangle } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface DeleteConfirmDialogProps {
  /** 对话框是否打开 */
  open: boolean
  /** 对话框状态变化回调 */
  onOpenChange: (open: boolean) => void
  /** 要删除的项名称 */
  itemName: string
  /** 对话框标题 */
  title?: string
  /** 对话框描述 */
  description?: string
  /** 确认按钮文本 */
  confirmText?: string
  /** 取消按钮文本 */
  cancelText?: string
  /** 确认删除回调 */
  onConfirm: () => void
  /** 取消删除回调 */
  onCancel?: () => void
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  itemName,
  title = '确认删除',
  description,
  confirmText = '删除',
  cancelText = '取消',
  onConfirm,
  onCancel,
}: DeleteConfirmDialogProps) {
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()

  // 默认描述文本
  const defaultDescription = `您确定要删除"${itemName}"吗？此操作不可撤销。`
  const finalDescription = description || defaultDescription

  const handleCancel = () => {
    onCancel?.()
    onOpenChange(false)
  }

  const handleConfirm = () => {
    onConfirm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[400px]"
        style={{
          backgroundColor: themeConfig.card,
          borderColor: themeConfig.border,
        }}
      >
        <DialogHeader>
          <DialogTitle
            className="flex items-center gap-2"
            style={{ color: themeConfig.text }}
          >
            <AlertTriangle
              className="w-5 h-5"
              style={{ color: themeConfig.danger }}
            />
            {title}
          </DialogTitle>
          <DialogDescription style={{ color: themeConfig.textMuted }}>
            {finalDescription}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 mt-4">
          <Button
            variant="outline"
            onClick={handleCancel}
            style={{
              borderColor: themeConfig.primary,
              color: themeConfig.primary,
              backgroundColor: 'transparent',
            }}
            className="hover:opacity-80"
          >
            {cancelText}
          </Button>
          <Button
            onClick={handleConfirm}
            style={{
              backgroundColor: themeConfig.danger,
              color: '#fff',
            }}
            className="hover:opacity-90"
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
