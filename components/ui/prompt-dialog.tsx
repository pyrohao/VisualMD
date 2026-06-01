'use client'

/**
 * 输入对话框组件
 *
 * 用于替代原生 prompt 对话框
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'
import { Button } from './button'
import { Input } from './input'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'

interface PromptDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (value: string) => void
  title: string
  description?: string
  defaultValue?: string
  confirmText?: string
  cancelText?: string
  placeholder?: string
}

export function PromptDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  defaultValue = '',
  confirmText = '确定',
  cancelText = '取消',
  placeholder,
}: PromptDialogProps) {
  const { getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue)
    }
  }, [isOpen, defaultValue])

  const handleConfirm = () => {
    onConfirm(value)
    onClose()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-[425px]"
        style={{
          backgroundColor: themeConfig.card,
          borderColor: themeConfig.border,
          color: themeConfig.text,
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-semibold" style={{ color: themeConfig.heading }}>
            {title}
          </DialogTitle>
          {description && <DialogDescription style={{ color: themeConfig.muted }}>{description}</DialogDescription>}
        </DialogHeader>
        <div className="py-4">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus
            className="transition-colors"
            style={{
              backgroundColor: themeConfig.input,
              borderColor: themeConfig.border,
              color: themeConfig.text,
            }}
          />
        </div>
        <DialogFooter className="gap-2 border-t pt-4" style={{ borderColor: themeConfig.border }}>
          <Button
            onClick={onClose}
            variant="outline"
            className="transition-opacity hover:opacity-90"
            style={{
              backgroundColor: themeConfig.buttonSecondaryBg,
              borderColor: themeConfig.border,
              color: themeConfig.text,
            }}
          >
            {cancelText}
          </Button>
          <Button
            onClick={handleConfirm}
            className="transition-opacity hover:opacity-90"
            style={{
              backgroundColor: themeConfig.primary,
              color: themeConfig.buttonText || '#fff',
            }}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
