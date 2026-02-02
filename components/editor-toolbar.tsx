'use client'

/**
 * 编辑器工具栏组件
 *
 * 顶部工具栏，包含文件操作和视图控制
 * 支持主题切换
 *
 * 对应技术文档6.1节
 */

import { useCallback, useState } from 'react'
import {
  FolderOpen,
  Save,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react'
import { useSidebarStore } from '@/stores/sidebarStore'
import { Button } from './ui/button'
import { useDocumentStore } from '@/stores/documentStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useThemeStore } from '@/stores/themeStore'
import { openFile, saveFile, exportAsHTML } from '@/lib/file-system'
import { ThemeToggle } from './theme-toggle'
import { toast } from '@/hooks/use-toast'

interface EditorToolbarProps {
  onToggleRight: () => void
  rightCollapsed: boolean
  onSave?: () => void
  onSearch?: () => void
}

export function EditorToolbar({
  onToggleRight,
  rightCollapsed,
  onSave,
  onSearch,
}: EditorToolbarProps) {
  const { document, loadDocument, getCurrentMarkdown } =
    useDocumentStore()
  const { importFile } = useFileSystemStore()
  const { getThemeConfig } = useThemeStore()
  const { isPanelExpanded, togglePanel } = useSidebarStore()
  const themeConfig = getThemeConfig()
  const [isLoading, setIsLoading] = useState(false)

  // 处理打开文件
  const handleOpen = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await openFile()
      if (result.success && result.content && result.fileName) {
        // 先导入到文件系统，然后再加载到编辑器
        importFile(result.fileName, result.content, null)
        loadDocument(result.content, result.fileName)
      }
    } catch (error) {
      console.error('Failed to open file:', error)
      toast({
        title: '打开文件失败',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [loadDocument, importFile])

  // 处理保存
  const handleSaveClick = useCallback(async () => {
    // 优先使用传入的 onSave 回调（新文件系统）
    if (onSave) {
      onSave()
      return
    }

    // 兼容旧版文件系统
    if (!document) return

    setIsLoading(true)
    try {
      const markdown = getCurrentMarkdown()
      const success = await saveFile(markdown, document.fileName)
      if (success) {
        toast({
          title: '保存成功',
        })
      }
    } catch (error) {
      console.error('Failed to save file:', error)
      toast({
        title: '保存文件失败',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [document, getCurrentMarkdown, onSave])

  // 处理导出
  const handleExport = useCallback(async () => {
    if (!document) return

    setIsLoading(true)
    try {
      const markdown = getCurrentMarkdown()
      const success = await exportAsHTML(markdown, document.fileName)
      if (success) {
        toast({
          title: '导出成功',
        })
      }
    } catch (error) {
      console.error('Failed to export file:', error)
      toast({
        title: '导出文件失败',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }, [document, getCurrentMarkdown])

  return (
    <div
      className="flex h-14 items-center justify-between border-b px-4 shadow-sm"
      style={{
        backgroundColor: themeConfig.card,
        borderColor: themeConfig.border,
      }}
    >
      {/* 左侧：文件操作 */}
      <div className="flex items-center gap-2">
        {/* 展开/收起左侧面板按钮 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={togglePanel}
          className="transition-colors"
          style={{
            color: themeConfig.muted,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = themeConfig.text
            e.currentTarget.style.backgroundColor = themeConfig.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = themeConfig.muted
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          {isPanelExpanded ? (
            <ChevronLeft className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </Button>

        <div
          className="mx-1 h-6 w-px"
          style={{ backgroundColor: themeConfig.border }}
        />

        <Button
          variant="ghost"
          size="icon"
          onClick={handleOpen}
          disabled={isLoading}
          className="transition-colors"
          style={{
            color: themeConfig.muted,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = themeConfig.text
            e.currentTarget.style.backgroundColor = themeConfig.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = themeConfig.muted
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <FolderOpen className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSaveClick}
          disabled={isLoading || (!document && !onSave)}
          className="transition-colors"
          style={{
            color: themeConfig.muted,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = themeConfig.text
            e.currentTarget.style.backgroundColor = themeConfig.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = themeConfig.muted
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <Save className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleExport}
          disabled={isLoading || !document}
          className="transition-colors"
          style={{
            color: themeConfig.muted,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = themeConfig.text
            e.currentTarget.style.backgroundColor = themeConfig.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = themeConfig.muted
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <Download className="h-5 w-5" />
        </Button>

        {/* 搜索按钮 */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onSearch}
          className="transition-colors"
          style={{
            color: themeConfig.muted,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = themeConfig.text
            e.currentTarget.style.backgroundColor = themeConfig.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = themeConfig.muted
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <Search className="h-5 w-5" />
        </Button>

        <div
          className="mx-2 h-6 w-px"
          style={{ backgroundColor: themeConfig.border }}
        />

        {/* 文件名显示 */}
        <div className="flex items-center gap-2">
          <FileText
            className="h-4 w-4"
            style={{ color: themeConfig.muted }}
          />
          <span
            className="text-sm font-medium"
            style={{ color: themeConfig.text }}
          >
            {document?.fileName || '未命名文档'}
          </span>
          {document?.isModified && (
            <span style={{ color: themeConfig.muted, fontSize: '12px' }}>
              (已修改)
            </span>
          )}
        </div>
      </div>



      {/* 右侧：视图控制和主题切换 */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleRight}
          className="transition-colors"
          style={{
            color: themeConfig.muted,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = themeConfig.text
            e.currentTarget.style.backgroundColor = themeConfig.hover
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = themeConfig.muted
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
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

        <div
          className="mx-2 h-6 w-px"
          style={{ backgroundColor: themeConfig.border }}
        />

        {/* 主题切换 */}
        <ThemeToggle />
      </div>
    </div>
  )
}

export default EditorToolbar
