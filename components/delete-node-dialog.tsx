'use client'

/**
 * 删除节点对话框组件
 *
 * 支持两种删除模式：
 * 1. 仅删除当前节点（子节点变为孤立节点）
 * 2. 删除当前节点及其所有子节点
 */

import { AlertTriangle, GitBranch, Trash2 } from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type DeleteMode = 'current' | 'all'

interface DeleteNodeDialogProps {
  /** 对话框是否打开 */
  open: boolean
  /** 对话框状态变化回调 */
  onOpenChange: (open: boolean) => void
  /** 要删除的节点名称 */
  nodeName: string
  /** 子节点数量 */
  childrenCount: number
  /** 确认删除回调 */
  onConfirm: (mode: DeleteMode) => void
  /** 取消删除回调 */
  onCancel?: () => void
}

export function DeleteNodeDialog({
  open,
  onOpenChange,
  nodeName,
  childrenCount,
  onConfirm,
  onCancel,
}: DeleteNodeDialogProps) {
  const { getThemeConfig } = useThemeStore()
  const { t } = useTranslation()
  const themeConfig = getThemeConfig()

  const handleCancel = () => {
    onCancel?.()
    onOpenChange(false)
  }

  const handleDeleteCurrent = () => {
    onConfirm('current')
    onOpenChange(false)
  }

  const handleDeleteAll = () => {
    onConfirm('all')
    onOpenChange(false)
  }

  const hasChildren = childrenCount > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[450px]"
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
            {t('common.delete')}
          </DialogTitle>
          <DialogDescription style={{ color: themeConfig.textMuted }}>
            {hasChildren
              ? `"${nodeName}" ${t('node.childNodes')} (${childrenCount})。${t('node.deleteNodeConfirm')}`
              : `${t('node.deleteNodeConfirm')} "${nodeName}"?`}
          </DialogDescription>
        </DialogHeader>

        {hasChildren ? (
          <div className="flex flex-col gap-3 mt-4">
            {/* 仅删除当前节点 */}
            <button
              onClick={handleDeleteCurrent}
              className="flex items-start gap-3 p-4 rounded-lg border-2 transition-all text-left hover:opacity-80"
              style={{
                borderColor: themeConfig.border,
                backgroundColor: themeConfig.background,
              }}
            >
              <GitBranch
                className="w-5 h-5 mt-0.5 flex-shrink-0"
                style={{ color: themeConfig.warning }}
              />
              <div>
                <div
                  className="font-medium mb-1"
                  style={{ color: themeConfig.text }}
                >
                  {t('node.deleteNodeOnly')}
                </div>
                <div className="text-sm" style={{ color: themeConfig.textMuted }}>
                  {t('node.deleteNodeOrphanChildren')}
                </div>
              </div>
            </button>

            {/* 删除当前节点及所有子节点 */}
            <button
              onClick={handleDeleteAll}
              className="flex items-start gap-3 p-4 rounded-lg border-2 transition-all text-left hover:opacity-80"
              style={{
                borderColor: themeConfig.danger,
                backgroundColor: `${themeConfig.danger}10`,
              }}
            >
              <Trash2
                className="w-5 h-5 mt-0.5 flex-shrink-0"
                style={{ color: themeConfig.danger }}
              />
              <div>
                <div
                  className="font-medium mb-1"
                  style={{ color: themeConfig.danger }}
                >
                  {t('node.deleteNodeAndChildren')}
                </div>
                <div className="text-sm" style={{ color: themeConfig.textMuted }}>
                  {childrenCount} {t('node.childNodes')}
                </div>
              </div>
            </button>
          </div>
        ) : null}

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
            {t('common.cancel')}
          </Button>
          {!hasChildren && (
            <Button
              onClick={handleDeleteAll}
              style={{
                backgroundColor: themeConfig.danger,
                color: '#fff',
              }}
              className="hover:opacity-90"
            >
              {t('common.delete')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
