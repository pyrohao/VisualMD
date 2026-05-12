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
import { useTabsStore } from '@/stores/tabsStore'
import { useGitStore } from '@/stores/gitStore'
import { useTranslation } from '@/stores/languageStore'
import { findNodeInTreeOrDetached } from '@/lib/flow-helpers'
import { toast } from '@/hooks/use-toast'
import { DeleteNodeDialog, type DeleteMode } from './delete-node-dialog'
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
    deleteNodeOnly,
    updateMetadata,
    updateFileName,
    getCurrentMarkdown,
  } = useDocumentStore()

  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()
  const { currentFileId, saveFileContent, renameFile, files } = useFileSystemStore()
  const { currentDocumentId: currentGitDocumentId } = useGitStore()
  const { editingTemplateId } = useSidebarStore()
  const { t } = useTranslation()

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

  // ========== 自动保存逻辑（仅保存，不重新解析）==========
  const doAutoSave = useCallback(() => {
    const doc = documentRef.current
    const selNodeId = selectedNodeIdRef.current
    const isVirtRoot = isVirtualRootRef.current
    const currTitle = titleRef.current
    const currContent = contentRef.current
    const currFileId = currentFileIdRef.current
    const currFiles = filesRef.current
    const editTemplateId = editingTemplateIdRef.current

    if (!selNodeId || !doc) {
      return
    }

    // 1. 更新数据到 documentStore（仅更新当前节点，不重新解析）
    if (!isVirtRoot) {
      const trimmedTitle = currTitle.trim()
      if (trimmedTitle) {
        useDocumentStore.getState().updateNode(selNodeId, { title: trimmedTitle, content: currContent || undefined })
      }
    }

    // 2. 获取最新 Markdown 内容
    const latestContent = useDocumentStore.getState().getCurrentMarkdown()

    // 3. 避免重复保存
    if (latestContent === lastSavedContentRef.current) {
      return
    }
    lastSavedContentRef.current = latestContent

    // 4. 同步文件名到 fileSystemStore（如果发生变化）
    if (currFileId && doc.fileName) {
      const currentFile = currFiles.find(f => f.id === currFileId)
      if (currentFile && currentFile.name !== doc.fileName) {
        useFileSystemStore.getState().renameFile(currFileId, doc.fileName)
      }
    }

    // 5. 保存到文件系统或模板
    const activeTab = useTabsStore.getState().getActiveTab()
    const activeGitDocumentId = activeTab?.sourceType === 'git' ? activeTab.fileId || null : null

    if (currFileId && !activeGitDocumentId) {
      useFileSystemStore.getState().saveFileContent(currFileId, latestContent)
    } else if (activeGitDocumentId) {
      const gitDocumentId = activeGitDocumentId
      if (gitDocumentId) {
        useGitStore.getState().updateDraftContent(gitDocumentId, latestContent)
      }
      const currentTabId = useTabsStore.getState().activeTabId
      if (currentTabId) {
        useTabsStore.getState().updateTabContent(currentTabId, latestContent)
        useTabsStore.getState().markTabAsModified(currentTabId, true)
      }
    } else if (editTemplateId) {
      // 保存模板内容
      useSidebarStore.setState((state) => ({
        templates: state.templates.map(t =>
          t.id === editTemplateId
            ? { ...t, content: latestContent, updatedAt: Date.now() }
            : t
        ),
        isTemplateModified: false,
      }))
      
      // 同时更新标签页状态
      const { tabs, activeTabId } = useTabsStore.getState()
      const currentTab = tabs.find(t => t.id === activeTabId)
      if (currentTab && currentTab.isTemplate && currentTab.templateId === editTemplateId) {
        useTabsStore.setState((state) => ({
          tabs: state.tabs.map(t =>
            t.id === activeTabId
              ? { ...t, content: latestContent, isModified: false }
              : t
          ),
        }))
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ========== 手动保存并重新解析（用于关闭面板时）==========
  const doSaveAndReparse = useCallback(() => {
    const doc = documentRef.current
    const selNodeId = selectedNodeIdRef.current
    const isVirtRoot = isVirtualRootRef.current
    const currTitle = titleRef.current
    const currContent = contentRef.current
    const currFileId = currentFileIdRef.current
    const currFiles = filesRef.current
    const editTemplateId = editingTemplateIdRef.current

    if (!selNodeId || !doc) {
      return
    }

    // 1. 更新数据到 documentStore
    if (!isVirtRoot) {
      const trimmedTitle = currTitle.trim()
      if (trimmedTitle) {
        useDocumentStore.getState().updateNode(selNodeId, { title: trimmedTitle, content: currContent || undefined })
      }
    }

    // 2. 获取最新 Markdown 内容并重新解析（这会处理内容中的新标题）
    const latestContent = useDocumentStore.getState().getCurrentMarkdown()
    useDocumentStore.getState().updateFromMarkdown(latestContent)

    // 3. 避免重复保存
    if (latestContent === lastSavedContentRef.current) {
      return
    }
    lastSavedContentRef.current = latestContent

    // 4. 同步文件名到 fileSystemStore（如果发生变化）
    if (currFileId && doc.fileName) {
      const currentFile = currFiles.find(f => f.id === currFileId)
      if (currentFile && currentFile.name !== doc.fileName) {
        useFileSystemStore.getState().renameFile(currFileId, doc.fileName)
      }
    }

    // 5. 保存到文件系统
    const activeTab = useTabsStore.getState().getActiveTab()
    const activeGitDocumentId = activeTab?.sourceType === 'git' ? activeTab.fileId || null : null

    if (currFileId && !activeGitDocumentId) {
      useFileSystemStore.getState().saveFileContent(currFileId, latestContent)
    } else if (activeGitDocumentId) {
      const gitDocumentId = activeGitDocumentId
      if (gitDocumentId) {
        useGitStore.getState().updateDraftContent(gitDocumentId, latestContent)
      }
      const currentTabId = useTabsStore.getState().activeTabId
      if (currentTabId) {
        useTabsStore.getState().updateTabContent(currentTabId, latestContent)
        useTabsStore.getState().markTabAsModified(currentTabId, true)
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

    // 设置自动保存定时器（0.8秒后保存）- 仅保存，不重新解析
    autoSaveTimeoutRef.current = setTimeout(() => {
      doAutoSave()
    }, 800)

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [title, content, selectedNodeId, doAutoSave])

  // ========== 组件卸载时保存 ==========
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
      // 使用 ref 获取最新的值，避免依赖数组问题
      const selNodeId = selectedNodeIdRef.current
      const isVirtRoot = isVirtualRootRef.current
      const currTitle = titleRef.current
      const currContent = contentRef.current

      // 只有在有选中节点且不是虚拟根节点时才保存
      if (selNodeId && !isVirtRoot) {
        const trimmedTitle = currTitle.trim()
        if (trimmedTitle) {
          useDocumentStore.getState().updateNode(selNodeId, { title: trimmedTitle, content: currContent || undefined })
          
          // 重新解析 Markdown 以处理内容中的新标题
          const latestContent = useDocumentStore.getState().getCurrentMarkdown()
          useDocumentStore.getState().updateFromMarkdown(latestContent)
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ========== 事件处理 ==========
  const handleSave = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
      autoSaveTimeoutRef.current = null
    }
    // 保存并重新解析（处理内容中的新标题）
    doSaveAndReparse()
    selectNode(null)
    toast({ title: t('toast.saved'), description: t('toast.saved') })
  }, [doSaveAndReparse, selectNode, t])

  const handleClose = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
      autoSaveTimeoutRef.current = null
    }
    // 保存并重新解析（处理内容中的新标题）
    doSaveAndReparse()
    selectNode(null)
  }, [doSaveAndReparse, selectNode])

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
    // 1. 实时更新到 documentStore
    updateFileName(newFileName)
    
    // 2. 立即同步到 fileSystemStore（确保文件面板实时更新）
    if (currentFileId) {
      const currentFile = files.find(f => f.id === currentFileId)
      if (currentFile && currentFile.name !== newFileName) {
        renameFile(currentFileId, newFileName)
      }
    }
  }, [updateFileName, currentFileId, files, renameFile])

  // ========== 删除节点 ==========
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDelete = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])

  const handleConfirmDelete = useCallback((mode: DeleteMode) => {
    if (selectedNodeId) {
      if (mode === 'current') {
        // 仅删除当前节点，子节点变为断开节点
        deleteNodeOnly(selectedNodeId)
        toast({ title: t('toast.deleted'), description: t('common.childrenMovedToDetached') })
      } else {
        // 删除当前节点及所有子节点
        deleteNode(selectedNodeId)
        toast({ title: t('toast.deleted') })
      }
      selectNode(null)
      setShowDeleteConfirm(false)
    }
  }, [selectedNodeId, deleteNode, deleteNodeOnly, selectNode, t])

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
                {isVirtualRoot ? t('node.metadata') : t('node.editNode')}
              </h2>
              <p className="text-xs" style={{ color: themeConfig.muted }}>
                {isVirtualRoot ? t('node.metadataDescription') : `H${selectedNode.level} ${t('node.nodeTitle')}`}
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
              onFileNameChange={currentGitDocumentId ? undefined : handleFileNameChange}
              fileNameEditable={!currentGitDocumentId}
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
                  {selectedNode.children.length} {t('node.childNodes')}
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
              {t('common.save')}
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
              {t('common.cancel')}
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
      <DeleteNodeDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        nodeName={selectedNode?.title || t('node.nodeTitle')}
        childrenCount={selectedNode?.children.length || 0}
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}

export default NodeEditPanel
