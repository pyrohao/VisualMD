'use client'

/**
 * 节点编辑面板组件 - 现代简约风格
 * 重构版：拆分为独立子组件
 * 支持自动保存（1秒延迟）
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { X, Save, Trash2, Type, FileJson } from 'lucide-react'
import { Button } from './ui/button'
import { useDocumentStore } from '@/stores/documentStore'
import { useThemeStore } from '@/stores/themeStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { findNodeInTreeOrDetached } from '@/lib/flow-helpers'
import { toast } from '@/hooks/use-toast'
import { DeleteConfirmDialog } from './delete-confirm-dialog'
import { VirtualRootEditor } from './virtual-root-editor'
import { NodeContentEditor } from './node-content-editor'

interface MetadataEntry {
  key: string
  value: string
}

export function NodeEditPanel() {
  const {
    document,
    selectedNodeId,
    selectNode,
    updateNode,
    deleteNode,
    updateMetadata,
    markAsSaved,
    getCurrentMarkdown,
  } = useDocumentStore()

  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()
  const { currentFileId, saveFileContent } = useFileSystemStore()
  const { editingTemplateId } = useSidebarStore()

  // 本地编辑状态
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [metadataEntries, setMetadataEntries] = useState<MetadataEntry[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // 获取当前选中的节点（在树和断开节点中查找）
  const selectedNode = selectedNodeId && document
    ? findNodeInTreeOrDetached(document.root, document.detachedNodes || [], selectedNodeId)
    : null

  const isVirtualRoot = selectedNode?.isVirtual || selectedNode?.level === 0

  // 只在选中的节点变化时加载数据
  useEffect(() => {
    if (selectedNode) {
      setTitle(selectedNode.title)
      setContent(selectedNode.content || '')
      
      // 加载元数据 - 只在节点切换时执行
      if (document?.metadata) {
        const entries = Object.entries(document.metadata).map(([key, value]) => ({
          key,
          value: String(value)
        }))
        setMetadataEntries(entries)
      } else {
        setMetadataEntries([])
      }
    }
  }, [selectedNodeId])

  // ==================== 自动保存逻辑 ====================
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isFirstRender = useRef(true)
  const lastSavedContentRef = useRef<string>('')

  // 首次渲染标记 - 在组件挂载后设置为 false
  useEffect(() => {
    const timer = setTimeout(() => {
      isFirstRender.current = false
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  // 执行保存的函数
  const doSave = useCallback(async () => {
    if (!selectedNodeId) return

    // 1. 更新节点
    if (isVirtualRoot) {
      const metadata: Record<string, string> = {}
      metadataEntries.forEach(({ key, value }) => {
        if (key.trim()) metadata[key.trim()] = value
      })
      updateMetadata(metadata)
    } else {
      const trimmedTitle = String(title || '').trim()
      if (trimmedTitle) {
        updateNode(selectedNodeId, { title: trimmedTitle, content: content || undefined })
      }
    }

    // 2. 获取最新内容并保存到文件
    const latestContent = getCurrentMarkdown()
    
    // 避免重复保存相同内容
    if (latestContent === lastSavedContentRef.current) {
      return
    }
    
    lastSavedContentRef.current = latestContent

    if (currentFileId) {
      saveFileContent(currentFileId, latestContent)
    } else if (editingTemplateId) {
      useSidebarStore.setState((state) => ({
        templates: state.templates.map(t =>
          t.id === editingTemplateId
            ? { ...t, content: latestContent, updatedAt: Date.now() }
            : t
        ),
        isTemplateModified: false,
      }))
    }
  }, [selectedNodeId, isVirtualRoot, metadataEntries, title, content, updateMetadata, updateNode, getCurrentMarkdown, currentFileId, editingTemplateId, saveFileContent])

  // 自动保存 effect - 当内容变化时触发
  useEffect(() => {
    // 首次渲染不触发
    if (isFirstRender.current) return
    // 没有选中节点不保存
    if (!selectedNodeId) return

    // 清除之前的定时器
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    // 设置新的定时器（1秒后自动保存）
    autoSaveTimeoutRef.current = setTimeout(() => {
      doSave()
    }, 1000)

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [metadataEntries, title, content, selectedNodeId])

  // 组件卸载时立即保存
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
        doSave()
      }
    }
  }, [])

  // 保存处理 - 立即保存（取消自动保存定时器）
  const handleSave = useCallback(() => {
    // 清除自动保存定时器
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
      autoSaveTimeoutRef.current = null
    }
    
    // 立即执行保存
    doSave()
    
    // 显示保存成功提示
    toast({ title: '已保存', description: '修改已保存' })
  }, [doSave])

  // 删除节点
  const handleDelete = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  const handleConfirmDelete = useCallback(() => {
    if (selectedNodeId) {
      deleteNode(selectedNodeId)
      selectNode(null)
      setShowDeleteConfirm(false)
      toast({ title: '节点已删除' })
    }
  }, [selectedNodeId, deleteNode, selectNode])

  const handleClose = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  // 处理元数据变化
  const handleMetadataChange = useCallback((newEntries: MetadataEntry[]) => {
    setMetadataEntries(newEntries)
  }, [])

  if (!selectedNode) {
    return null
  }

  return (
    <div className="fixed right-0 top-0 z-50 h-full w-[480px] animate-in slide-in-from-right duration-300 ease-out">
      <div
        className="flex h-full flex-col shadow-2xl"
        style={{
          backgroundColor: themeConfig.background,
          borderLeft: `1px solid ${themeConfig.border}`,
        }}
      >
        {/* 头部 - 固定高度 */}
        <div
          className="flex h-16 items-center justify-between px-6 border-b shrink-0"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: isVirtualRoot ? '#8b5cf6' : themeConfig.accent }}
            >
              {isVirtualRoot ? (
                <FileJson className="w-4 h-4 text-white" />
              ) : (
                <Type className="w-4 h-4 text-white" />
              )}
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ color: themeConfig.heading }}>
                {isVirtualRoot ? 'Front Matter' : '编辑节点'}
              </h2>
              <p className="text-xs" style={{ color: themeConfig.muted }}>
                {isVirtualRoot ? 'YAML 元数据' : `H${selectedNode.level} 标题`}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
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

        {/* 编辑区域 - 可滚动 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isVirtualRoot ? (
            <VirtualRootEditor
              initialEntries={metadataEntries}
              themeConfig={{
                card: themeConfig.card,
                border: themeConfig.border,
                text: themeConfig.text,
                heading: themeConfig.heading,
                muted: themeConfig.muted,
                accent: themeConfig.accent,
                danger: themeConfig.danger,
              }}
              onChange={handleMetadataChange}
            />
          ) : (
            <NodeContentEditor
              title={title}
              content={content}
              themeConfig={{
                card: themeConfig.card,
                border: themeConfig.border,
                text: themeConfig.text,
                heading: themeConfig.heading,
                muted: themeConfig.muted,
                accent: themeConfig.accent,
              }}
              onTitleChange={setTitle}
              onContentChange={setContent}
            />
          )}

          {/* 子节点信息卡片 */}
          {selectedNode.children.length > 0 && (
            <div
              className="rounded-xl p-4 border"
              style={{
                backgroundColor: themeConfig.code,
                borderColor: themeConfig.border,
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: isVirtualRoot ? '#8b5cf6' : themeConfig.accent }}
                />
                <p className="text-sm font-medium" style={{ color: themeConfig.text }}>
                  包含 {selectedNode.children.length} 个子节点
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 底部操作栏 - 固定高度 */}
        <div
          className="border-t px-6 py-5 shrink-0"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
          }}
        >
          <div className="flex gap-3">
            <Button
              onClick={handleSave}
              className="flex-1 h-11 text-sm font-medium transition-all duration-200 hover:opacity-90 hover:shadow-lg"
              style={{
                backgroundColor: themeConfig.accent,
                color: themeConfig.buttonText,
              }}
            >
              <Save className="mr-2 h-4 w-4" />
              保存修改
            </Button>
            <Button
              variant="outline"
              onClick={handleClose}
              className="flex-1 h-11 text-sm font-medium transition-all duration-200"
              style={{
                backgroundColor: themeConfig.buttonSecondaryBg,
                borderColor: themeConfig.border,
                color: themeConfig.text,
              }}
            >
              取消
            </Button>
            <Button
              variant="outline"
              onClick={handleDelete}
              className="h-11 w-11 p-0 transition-all duration-200"
              style={{
                backgroundColor: 'transparent',
                borderColor: themeConfig.danger,
                color: themeConfig.danger,
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        itemName={selectedNode?.title || '节点'}
        title="删除节点"
        description={`确定要删除"${selectedNode?.title || '节点'}及其子节点"吗？`}
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

export default NodeEditPanel
