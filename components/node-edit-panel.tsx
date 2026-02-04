'use client'

/**
 * 节点编辑面板组件 - 现代简约风格
 * 重构版：单一数据源模式
 * 支持自动保存（1秒延迟）
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { X, Save, Trash2, Type, FileJson } from 'lucide-react'
import { Button } from './ui/button'
import { useDocumentStore } from '@/stores/documentStore'
import { useThemeStore } from '@/stores/themeStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { findNodeInTreeOrDetached } from '@/lib/flow-helpers'
import { toast } from '@/hooks/use-toast'
import { DeleteConfirmDialog } from './delete-confirm-dialog'
import { VirtualRootEditor, type VirtualRootEditorRef, type MetadataEntry } from './virtual-root-editor'
import { NodeContentEditor } from './node-content-editor'

export function NodeEditPanel() {
  // ========== Store 访问 ==========
  const {
    document,
    selectedNodeId,
    selectNode,
    updateNode,
    deleteNode,
    updateMetadata,
    updateFileName,
    getCurrentMarkdown,
  } = useDocumentStore()

  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()
  const { currentFileId, saveFileContent, renameFile, files } = useFileSystemStore()
  const { editingTemplateId } = useSidebarStore()

  // ========== 派生状态 ==========
  const selectedNode = selectedNodeId && document
    ? findNodeInTreeOrDetached(document.root, document.detachedNodes || [], selectedNodeId)
    : null

  const isVirtualRoot = selectedNode?.isVirtual || selectedNode?.level === 0

  // ========== 本地编辑状态（仅用于非虚拟节点）==========
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  // ========== Refs ==========
  const virtualRootEditorRef = useRef<VirtualRootEditorRef>(null)
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isFirstRender = useRef(true)
  const lastSavedContentRef = useRef<string>('')
  
  // 使用 ref 存储最新值，避免循环依赖
  const documentRef = useRef(document)
  const currentFileIdRef = useRef(currentFileId)
  const filesRef = useRef(files)
  const editingTemplateIdRef = useRef(editingTemplateId)
  const isVirtualRootRef = useRef(isVirtualRoot)
  const selectedNodeIdRef = useRef(selectedNodeId)
  const titleRef = useRef(title)
  const contentRef = useRef(content)

  // 同步 refs（合并为一个 useEffect，减少 React 调度开销）
  useEffect(() => {
    documentRef.current = document
    currentFileIdRef.current = currentFileId
    filesRef.current = files
    editingTemplateIdRef.current = editingTemplateId
    isVirtualRootRef.current = isVirtualRoot
    selectedNodeIdRef.current = selectedNodeId
    titleRef.current = title
    contentRef.current = content
  }, [document, currentFileId, files, editingTemplateId, isVirtualRoot, selectedNodeId, title, content])

  // ========== 初始化数据 ==========
  useEffect(() => {
    if (selectedNode) {
      setTitle(selectedNode.title)
      setContent(selectedNode.content || '')
    }
  }, [selectedNodeId, selectedNode?.title, selectedNode?.content])

  // ========== 保存逻辑（使用 ref 避免循环依赖）==========
  const doSave = useCallback(() => {
    const doc = documentRef.current
    const selNodeId = selectedNodeIdRef.current
    const isVirtRoot = isVirtualRootRef.current
    const currTitle = titleRef.current
    const currContent = contentRef.current
    const currFileId = currentFileIdRef.current
    const currFiles = filesRef.current
    const editTemplateId = editingTemplateIdRef.current

    if (!selNodeId || !doc) return

    // 1. 更新数据到 documentStore
    if (!isVirtRoot) {
      // 普通节点：更新标题和内容
      const trimmedTitle = currTitle.trim()
      if (trimmedTitle) {
        updateNode(selNodeId, { title: trimmedTitle, content: currContent || undefined })
      }
    }

    // 2. 获取最新 Markdown 内容
    const latestContent = getCurrentMarkdown()

    // 3. 避免重复保存
    if (latestContent === lastSavedContentRef.current) {
      return
    }
    lastSavedContentRef.current = latestContent

    // 4. 同步文件名到 fileSystemStore（如果发生变化）
    if (currFileId && doc.fileName) {
      const currentFile = currFiles.find(f => f.id === currFileId)
      if (currentFile && currentFile.name !== doc.fileName) {
        renameFile(currFileId, doc.fileName)
      }
    }

    // 5. 保存到文件系统
    if (currFileId) {
      saveFileContent(currFileId, latestContent)
    } else if (editTemplateId) {
      useSidebarStore.setState((state) => ({
        templates: state.templates.map(t =>
          t.id === editTemplateId
            ? { ...t, content: latestContent, updatedAt: Date.now() }
            : t
        ),
        isTemplateModified: false,
      }))
    }
  }, [updateNode, getCurrentMarkdown, renameFile, saveFileContent])

  // ========== 自动保存 ==========
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
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
  }, [title, content, selectedNodeId, doSave])

  // ========== 组件卸载时保存 ==========
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
      doSave()
    }
  }, [doSave])

  // ========== 事件处理 ==========
  const handleSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
      autoSaveTimeoutRef.current = null
    }
    doSave()
    toast({ title: '已保存', description: '修改已保存' })
  }, [doSave])

  const handleClose = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
      autoSaveTimeoutRef.current = null
    }
    doSave()
    selectNode(null)
  }, [doSave, selectNode])

  // ========== 虚拟节点：元数据变化处理 ==========
  const handleEntriesChange = useCallback((newEntries: MetadataEntry[]) => {
    // 实时更新到 documentStore
    const metadata: Record<string, string> = {}
    newEntries.forEach(({ key, value }) => {
      if (key.trim()) metadata[key.trim()] = value
    })
    updateMetadata(metadata)
  }, [updateMetadata])

  // ========== 虚拟节点：文件名变化处理 ==========
  const handleFileNameChange = useCallback((newFileName: string) => {
    // 实时更新到 documentStore
    updateFileName(newFileName)
  }, [updateFileName])

  // ========== 删除节点 ==========
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

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

  // ========== 准备虚拟节点的数据（使用 useMemo 缓存）==========
  const metadataEntries = useMemo(() =>
    document?.metadata
      ? Object.entries(document.metadata).map(([key, value]) => ({
          key,
          value: String(value),
        }))
      : []
  , [document?.metadata])

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
        {/* 头部 */}
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
                {isVirtualRoot ? 'Metadata' : '编辑节点'}
              </h2>
              <p className="text-xs" style={{ color: themeConfig.muted }}>
                {isVirtualRoot ? '元数据' : `H${selectedNode.level} 标题`}
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

        {/* 编辑区域 */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isVirtualRoot ? (
            <VirtualRootEditor
              ref={virtualRootEditorRef}
              entries={metadataEntries}
              fileName={document?.fileName || ''}
              themeConfig={{
                card: themeConfig.card,
                border: themeConfig.border,
                text: themeConfig.text,
                heading: themeConfig.heading,
                muted: themeConfig.muted,
                accent: themeConfig.accent,
                danger: themeConfig.danger,
              }}
              onEntriesChange={handleEntriesChange}
              onFileNameChange={handleFileNameChange}
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

          {/* 子节点信息 */}
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

        {/* 底部操作栏 */}
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
            {!isVirtualRoot && (
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
            )}
          </div>
        </div>
      </div>

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        itemName={selectedNode?.title || '节点'}
        title="删除节点"
        description={`确定要删除"${selectedNode?.title || '节点'}"及其子节点吗？`}
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

export default NodeEditPanel
