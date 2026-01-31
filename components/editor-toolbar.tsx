'use client'

/**
 * 编辑器工具栏组件
 *
 * 顶部工具栏，包含文件操作和视图控制
 * 使用浅色主题
 *
 * 对应技术文档6.1节
 */

import { useCallback, useState } from 'react'
import {
  FolderOpen,
  Save,
  Download,
  ChevronLeft,
  ChevronRight,
  Plus,
  FileText,
} from 'lucide-react'
import { Button } from './ui/button'
import { useDocumentStore } from '@/stores/documentStore'
import { openFile, saveFile, exportAsHTML } from '@/lib/file-system'
import { ThemeToggle } from './theme-toggle'

interface EditorToolbarProps {
  onToggleLeft: () => void
  onToggleRight: () => void
  leftCollapsed: boolean
  rightCollapsed: boolean
}

export function EditorToolbar({
  onToggleLeft,
  onToggleRight,
  leftCollapsed,
  rightCollapsed,
}: EditorToolbarProps) {
  const { document, loadDocument, getCurrentMarkdown, updateFromMarkdown } =
    useDocumentStore()
  const [isLoading, setIsLoading] = useState(false)

  // 处理打开文件
  const handleOpen = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await openFile()
      if (result.success && result.content) {
        loadDocument(result.content, result.fileName)
      }
    } catch (error) {
      console.error('Failed to open file:', error)
      alert('打开文件失败')
    } finally {
      setIsLoading(false)
    }
  }, [loadDocument])

  // 处理保存文件
  const handleSave = useCallback(async () => {
    if (!document) return

    setIsLoading(true)
    try {
      const markdown = getCurrentMarkdown()
      const success = await saveFile(markdown, document.fileName)
      if (success) {
        alert('保存成功')
      }
    } catch (error) {
      console.error('Failed to save file:', error)
      alert('保存文件失败')
    } finally {
      setIsLoading(false)
    }
  }, [document, getCurrentMarkdown])

  // 处理导出
  const handleExport = useCallback(async () => {
    if (!document) return

    setIsLoading(true)
    try {
      const markdown = getCurrentMarkdown()
      const success = await exportAsHTML(markdown, document.fileName)
      if (success) {
        alert('导出成功')
      }
    } catch (error) {
      console.error('Failed to export file:', error)
      alert('导出文件失败')
    } finally {
      setIsLoading(false)
    }
  }, [document, getCurrentMarkdown])

  return (
    <div className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
      {/* 左侧：文件操作 */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleOpen}
          disabled={isLoading}
          className="text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <FolderOpen className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSave}
          disabled={isLoading || !document}
          className="text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <Save className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleExport}
          disabled={isLoading || !document}
          className="text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <Download className="h-5 w-5" />
        </Button>

        <div className="mx-2 h-6 w-px bg-slate-200" />

        {/* 文件名显示 */}
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">
            {document?.fileName || '未命名文档'}
          </span>
          {document?.isModified && (
            <span className="text-xs text-slate-400">(已修改)</span>
          )}
        </div>
      </div>

      {/* 中间：标题 */}
      <div className="absolute left-1/2 -translate-x-1/2">
        <h1 className="text-lg font-semibold text-slate-800">
          Markdown 可视化编辑器
        </h1>
      </div>

      {/* 右侧：视图控制和主题切换 */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleLeft}
          className="text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          {leftCollapsed ? (
            <>
              <ChevronRight className="mr-1 h-4 w-4" />
              显示大纲
            </>
          ) : (
            <>
              <ChevronLeft className="mr-1 h-4 w-4" />
              隐藏大纲
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleRight}
          className="text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          {rightCollapsed ? (
            <>
              显示预览
              <ChevronLeft className="ml-1 h-4 w-4" />
            </>
          ) : (
            <>
              隐藏预览
              <ChevronRight className="ml-1 h-4 w-4" />
            </>
          )}
        </Button>

        <div className="mx-2 h-6 w-px bg-slate-200" />

        {/* 主题切换 */}
        <ThemeToggle />
      </div>
    </div>
  )
}

export default EditorToolbar
