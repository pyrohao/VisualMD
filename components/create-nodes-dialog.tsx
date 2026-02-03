'use client'

/**
 * 批量创建子节点对话框
 *
 * 拖拽节点连接点后弹出，允许用户选择创建子节点的数量和标题
 * 支持批量输入多个子节点标题，每行一个
 *
 * 功能：
 * 1. 显示父节点信息
 * 2. 输入子节点标题（每行一个）
 * 3. 快速添加按钮（1/2/3/5个）
 * 4. 预览即将创建的节点
 * 5. 确认或取消创建
 */

import { useState, useCallback, useEffect } from 'react'
import { X, Plus, Trash2, GitBranch } from 'lucide-react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { ScrollArea } from './ui/scroll-area'
import { useThemeStore } from '@/stores/themeStore'

export interface CreateNodesDialogProps {
  /** 是否显示对话框 */
  isOpen: boolean
  /** 父节点标题 */
  parentTitle: string
  /** 父节点层级 */
  parentLevel: number
  /** 子节点层级（可选，默认 parentLevel + 1） */
  childLevel?: number
  /** 确认回调 */
  onConfirm: (titles: string[]) => void
  /** 取消回调 */
  onCancel: () => void
}

export function CreateNodesDialog({
  isOpen,
  parentTitle,
  parentLevel,
  childLevel: propChildLevel,
  onConfirm,
  onCancel,
}: CreateNodesDialogProps) {
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()

  const [inputText, setInputText] = useState('')
  const [parsedTitles, setParsedTitles] = useState<string[]>([])

  // 子节点层级（使用传入值或默认 parentLevel + 1）
  const childLevel = propChildLevel ?? parentLevel + 1

  // 解析输入的标题
  useEffect(() => {
    const titles = inputText
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
    setParsedTitles(titles)
  }, [inputText])

  // 快速添加按钮处理
  const handleQuickAdd = useCallback((count: number) => {
    const newLines = Array(count).fill('').map((_, i) => `新节点 ${parsedTitles.length + i + 1}`)
    setInputText(prev => {
      const current = prev.trim()
      return current ? `${current}\n${newLines.join('\n')}` : newLines.join('\n')
    })
  }, [parsedTitles.length])

  // 清空输入
  const handleClear = useCallback(() => {
    setInputText('')
  }, [])

  // 确认创建
  const handleConfirm = useCallback(() => {
    if (parsedTitles.length > 0) {
      onConfirm(parsedTitles)
      setInputText('')
    }
  }, [parsedTitles, onConfirm])

  // 取消
  const handleCancel = useCallback(() => {
    setInputText('')
    onCancel()
  }, [onCancel])

  // 如果对话框关闭，清空输入
  useEffect(() => {
    if (!isOpen) {
      setInputText('')
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-[480px] max-h-[80vh] rounded-2xl shadow-2xl flex flex-col animate-in zoom-in-95 duration-200"
        style={{
          backgroundColor: themeConfig.background,
          border: `1px solid ${themeConfig.border}`,
        }}
      >
        {/* 头部 */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b rounded-t-2xl"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: themeConfig.accent }}
            >
              <GitBranch className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2
                className="text-lg font-semibold"
                style={{ color: themeConfig.heading }}
              >
                创建子节点
              </h2>
              <p className="text-xs" style={{ color: themeConfig.muted }}>
                在「{parentTitle || '未命名'}」下创建 H{childLevel} 子节点
              </p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: themeConfig.muted }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = themeConfig.hover
              e.currentTarget.style.color = themeConfig.text
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.color = themeConfig.muted
            }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-6 space-y-5">
          {/* 快速添加按钮 */}
          <div className="space-y-2">
            <label
              className="text-sm font-medium"
              style={{ color: themeConfig.heading }}
            >
              快速添加
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 5].map((count) => (
                <Button
                  key={count}
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickAdd(count)}
                  className="flex-1 h-9 text-sm transition-all duration-200"
                  style={{
                    backgroundColor: themeConfig.card,
                    borderColor: themeConfig.border,
                    color: themeConfig.text,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = themeConfig.hover
                    e.currentTarget.style.borderColor = themeConfig.accent
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = themeConfig.card
                    e.currentTarget.style.borderColor = themeConfig.border
                  }}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {count}个
                </Button>
              ))}
            </div>
          </div>

          {/* 标题输入 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label
                className="text-sm font-medium"
                style={{ color: themeConfig.heading }}
              >
                节点标题
              </label>
              <button
                onClick={handleClear}
                className="text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors"
                style={{ color: themeConfig.muted }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = themeConfig.hover
                  e.currentTarget.style.color = themeConfig.danger
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = themeConfig.muted
                }}
              >
                <Trash2 className="w-3 h-3" />
                清空
              </button>
            </div>
            <div
              className="rounded-xl border-2 overflow-hidden transition-all duration-200"
              style={{
                backgroundColor: themeConfig.card,
                borderColor: themeConfig.border,
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = themeConfig.accent
                e.currentTarget.style.boxShadow = `0 0 0 3px ${themeConfig.accent}20`
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = themeConfig.border
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`输入子节点标题，每行一个\n例如：\n子节点1\n子节点2\n子节点3`}
                className="w-full h-40 resize-none border-0 text-sm leading-relaxed p-4 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                style={{
                  backgroundColor: 'transparent',
                  color: themeConfig.text,
                }}
              />
            </div>
            <p className="text-xs" style={{ color: themeConfig.muted }}>
              每行输入一个标题，系统将自动创建为 H{childLevel} 层级的子节点
            </p>
          </div>

          {/* 预览区域 */}
          {parsedTitles.length > 0 && (
            <div
              className="rounded-xl border p-4"
              style={{
                backgroundColor: themeConfig.code,
                borderColor: themeConfig.border,
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: themeConfig.accent }}
                />
                <span
                  className="text-sm font-medium"
                  style={{ color: themeConfig.heading }}
                >
                  即将创建 {parsedTitles.length} 个节点
                </span>
              </div>
              <ScrollArea className="h-32">
                <div className="space-y-1.5">
                  {parsedTitles.map((title, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-lg"
                      style={{
                        backgroundColor: themeConfig.card,
                      }}
                    >
                      <span
                        className="w-5 h-5 rounded flex items-center justify-center text-xs font-medium"
                        style={{
                          backgroundColor: themeConfig.accent + '20',
                          color: themeConfig.accent,
                        }}
                      >
                        {index + 1}
                      </span>
                      <span
                        className="truncate flex-1"
                        style={{ color: themeConfig.text }}
                      >
                        {title}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div
          className="border-t px-6 py-5 rounded-b-2xl"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
          }}
        >
          <div className="flex gap-3">
            <Button
              onClick={handleConfirm}
              disabled={parsedTitles.length === 0}
              className="flex-1 h-11 text-sm font-medium transition-all duration-200 hover:opacity-90 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: themeConfig.accent,
                color: themeConfig.buttonText,
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              创建 {parsedTitles.length > 0 ? `${parsedTitles.length} 个` : ''}节点
            </Button>
            <Button
              variant="outline"
              onClick={handleCancel}
              className="flex-1 h-11 text-sm font-medium transition-all duration-200"
              style={{
                backgroundColor: themeConfig.buttonSecondaryBg,
                borderColor: themeConfig.border,
                color: themeConfig.text,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = themeConfig.hover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = themeConfig.buttonSecondaryBg
              }}
            >
              取消
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CreateNodesDialog
