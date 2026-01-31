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
  const [value, setValue] = useState(defaultValue)

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
      <DialogContent className="sm:max-w-[425px] bg-gray-50 text-black border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-black font-semibold">{title}</DialogTitle>
          {description && <DialogDescription className="text-gray-700">{description}</DialogDescription>}
        </DialogHeader>
        <div className="py-4">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus
            className="border-gray-300 text-black placeholder:text-gray-500 bg-white"
          />
        </div>
        <DialogFooter className="gap-2">
          <Button onClick={onClose} className="bg-green-600 hover:bg-green-700 text-white">
            {cancelText}
          </Button>
          <Button onClick={handleConfirm} className="bg-blue-600 hover:bg-blue-700 text-white">
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
