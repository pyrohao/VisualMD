'use client'

/**
 * Markdown编辑器主组件
 *
 * 整合所有子组件的主编辑器界面
 * 布局：Obsidian 风格（图标栏 | 功能面板 | 可视化画布 | 预览）
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { EditorToolbar } from './editor-toolbar'
import { IconSidebar } from './sidebar/icon-sidebar'
import { PanelContainer } from './sidebar/panel-container'
import { MarkdownPreview } from './markdown-preview'
import { AiChatDock } from './ai-chat-dock'
import { NodeEditPanel } from './node-edit-panel'
import { SearchDialog } from './search-dialog'
import { UnsavedChangesDialog } from './unsaved-changes-dialog'
import { GitConflictView } from './git-conflict-view'
import { Button } from './ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useDocumentStore } from '@/stores/documentStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useGitStore } from '@/stores/gitStore'
import { hasUnsavedChanges, saveDirtyEditors, useUnsavedChangesStore } from '@/stores/unsavedChangesStore'
import { useTranslation } from '@/stores/languageStore'
import { SIDEBAR_PANEL_MIN_WIDTH, useSidebarStore } from '@/stores/sidebarStore'
import { useTabsStore } from '@/stores/tabsStore'
import { initTheme, useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useSidebarStore as useTemplateStore } from '@/stores/sidebarStore'
import { MIN_AI_DOCK_WIDTH, useAiDockStore } from '@/stores/aiDockStore'
import { useAiChatStore } from '@/stores/aiChatStore'
import { EmptyTabView } from './empty-tab-view'
import { EditorCanvasShell } from './editor-canvas-shell'
import { persistActiveTabSave, persistMarkdownToActiveSource, syncActiveDocumentToActiveSource } from '@/lib/editor-persistence'
import { inferGitFileKind, isGitBinaryFileKind } from '@/lib/git/file-kind'
import { buildGitTabDraftState } from '@/lib/git/tab-state'
import { resolveTabCurrentContent, syncTabContentFromSource } from '@/lib/tab-content'
import { useHistoryStore } from '@/stores/historyStore'
import { DEFAULT_WELCOME_DOCUMENTS } from '@/lib/default-documents'
import { isAiDocumentHistoryDescription } from '@/lib/ai-document-history'

type OutlineJumpDetail = {
  line: number
  index?: number
  sourceOffset?: number
}

type PreviewOpenDetail = {
  mode?: 'preview' | 'edit' | 'live'
}
const LEFT_ICON_BAR_WIDTH = 48
const RIGHT_PANEL_INITIAL_WIDTH_RATIO = 0.42
const RIGHT_PANEL_MIN_WIDTH_RATIO = 0.28
const RIGHT_PANEL_MIN_WIDTH_FALLBACK = 360
const CENTER_PANEL_MIN_WIDTH_RATIO = 0.24
const CENTER_PANEL_MIN_WIDTH_FALLBACK = 260
const RESIZE_HANDLE_HIT_AREA = 14
const AI_DOCK_RESIZE_HIT_AREA = 16
const AI_DOCK_DEFAULT_WIDTH_RATIO = 0.5

const getRatioWidth = (containerWidth: number, ratio: number, fallback: number) => {
  if (containerWidth <= 0) {
    return fallback
  }

  return Math.round(containerWidth * ratio)
}

const getRightPanelMinWidth = (containerWidth: number) =>
  getRatioWidth(containerWidth, RIGHT_PANEL_MIN_WIDTH_RATIO, RIGHT_PANEL_MIN_WIDTH_FALLBACK)

const getCenterPanelMinWidth = (containerWidth: number) =>
  getRatioWidth(containerWidth, CENTER_PANEL_MIN_WIDTH_RATIO, CENTER_PANEL_MIN_WIDTH_FALLBACK)

const getInitialRightPanelWidth = (containerWidth: number) =>
  getRatioWidth(containerWidth, RIGHT_PANEL_INITIAL_WIDTH_RATIO, RIGHT_PANEL_MIN_WIDTH_FALLBACK)

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tagName = target.tagName.toLowerCase()
  return target.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

type TextControlSnapshot = {
  element: HTMLInputElement | HTMLTextAreaElement
  start: number
  end: number
  direction?: 'forward' | 'backward' | 'none'
  scrollTop: number
  scrollLeft: number
}

function captureTextControlSnapshot(target: EventTarget | null): TextControlSnapshot | null {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
    return null
  }

  return {
    element: target,
    start: target.selectionStart ?? 0,
    end: target.selectionEnd ?? 0,
    direction: target.selectionDirection ?? 'none',
    scrollTop: target.scrollTop,
    scrollLeft: target.scrollLeft,
  }
}

function restoreTextControlSnapshot(snapshot: TextControlSnapshot | null) {
  if (!snapshot) {
    return
  }

  window.requestAnimationFrame(() => {
    const { element } = snapshot
    if (!element.isConnected) {
      return
    }

    const nextLength = element.value.length
    const nextStart = Math.min(snapshot.start, nextLength)
    const nextEnd = Math.min(snapshot.end, nextLength)

    element.focus({ preventScroll: true })
    element.setSelectionRange(nextStart, nextEnd, snapshot.direction)
    element.scrollTop = snapshot.scrollTop
    element.scrollLeft = snapshot.scrollLeft
  })
}

function BinaryGitCanvasPlaceholder({
  fileName,
  themeConfig,
}: {
  fileName: string
  themeConfig: typeof themeConfigs.light
}) {
  const { t } = useTranslation()

  return (
    <div
      className="flex h-full items-center justify-center px-8"
      style={{ backgroundColor: themeConfig.background }}
    >
      <div
        className="max-w-md rounded-2xl border px-6 py-8 text-center"
        style={{
          borderColor: themeConfig.border,
          backgroundColor: themeConfig.card,
          boxShadow: `0 20px 40px ${themeConfig.border}22`,
        }}
      >
        <div className="text-lg font-semibold" style={{ color: themeConfig.heading }}>
          {fileName}
        </div>
        <div className="mt-3 text-sm leading-6" style={{ color: themeConfig.muted }}>
          {t('git.binaryReadonly')}
          <br />
          {t('git.binaryReadonlyHint')}
        </div>
      </div>
    </div>
  )
}

export function MarkdownEditor() {
  // 面板收起状态
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_PANEL_MIN_WIDTH_FALLBACK)
  const [isResizing, setIsResizing] = useState(false)
  const [isAiDockResizing, setIsAiDockResizing] = useState(false)
  // 客户端挂载状态，用于避免 hydration 不匹配
  const [mounted, setMounted] = useState(false)
  // 模板编辑模式
  const [templateEditMode, setTemplateEditMode] = useState<{
    isActive: boolean
    content: string
    templateName: string
    templateId: string | null
  }>({ isActive: false, content: '', templateName: '', templateId: null })
  // 搜索对话框状态
  const [searchDialogOpen, setSearchDialogOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const pendingOutlineJumpRef = useRef<OutlineJumpDetail | null>(null)
  const pendingPreviewOpenRef = useRef<PreviewOpenDetail | null>(null)
  const leftPanelMinWidthRef = useRef(LEFT_ICON_BAR_WIDTH + SIDEBAR_PANEL_MIN_WIDTH)
  const resizeHandleRef = useRef<HTMLDivElement | null>(null)
  const aiResizeHandleRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{
    side: 'left' | 'right'
    startX: number
    startLeftWidth: number
    startRightWidth: number
    pointerId: number
  } | null>(null)
  const aiDragStateRef = useRef<{
    startX: number
    startWidth: number
    startRightWidth: number
    pointerId: number
  } | null>(null)

  // 获取Store
  const { loadDocument, clearDocument, document, selectedNodeId } = useDocumentStore()
  const { currentFileId, openFile, files, initializeWelcomeDocs } = useFileSystemStore()
  const {
    setCurrentDocumentId,
    drafts,
    resolveConflictUsingContent,
    acceptRemoteVersion,
    acceptLocalVersion,
    commitCurrentFile,
    pendingCommitMessage,
    clearPendingCommit,
  } = useGitStore()
  const {
    isOpen: isAiDockOpen,
    width: aiDockWidth,
    hasCustomWidth: aiDockHasCustomWidth,
    setOpen: setAiDockOpen,
    setWidth: setAiDockWidth,
    primeWidth: primeAiDockWidth,
  } = useAiDockStore()
  const { isPanelExpanded, panelWidth, setPanelWidth, togglePanel, setActivePanel } = useSidebarStore()
  const { activeTabId, getActiveTab, tabs } = useTabsStore()
  const { t } = useTranslation()

  // 获取当前激活的标签页
  const activeTab = getActiveTab()
  const hasActiveTab = Boolean(activeTab)
  const activeTabFileName = activeTab?.fileName || ''
  const activeTabFileId = activeTab?.fileId || undefined
  const activeTabSourceType = activeTab?.sourceType
  const activeTabIsTemplate = Boolean(activeTab?.isTemplate)
  const activeTabTemplateId = activeTab?.templateId || null
  const activeTabIsModified = Boolean(activeTab?.isModified)
  const activeTabGitPath = activeTab?.gitMeta?.path || ''
  const activeTabGitFileKind = activeTab?.gitMeta?.fileKind
  const activeGitFileKind =
    activeTabSourceType === 'git' && activeTabGitPath
      ? activeTabGitFileKind || inferGitFileKind(activeTabGitPath)
      : 'text'
  const activeGitDraft =
    activeTabSourceType === 'git' && activeTabFileId
      ? drafts[activeTabFileId] || null
      : null
  const activeGitConflict = Boolean(activeGitDraft?.hasConflict)
  const activeTabCurrentContent = useMemo(
    () => resolveTabCurrentContent(activeTab, { gitDrafts: drafts, localFiles: files }),
    [activeTab, drafts, files]
  )
  const conflictedDrafts = useMemo(
    () => Object.values(drafts).filter((draft) => draft.status === 'conflict'),
    [drafts]
  )
  const isActiveBinaryGitTab =
    activeTabSourceType === 'git' && isGitBinaryFileKind(activeGitFileKind)

  const openGitDraftByDocumentId = useCallback((documentId: string) => {
    const targetDraft = useGitStore.getState().drafts[documentId]
    if (!targetDraft) return

    useTabsStore.getState().openGitFileInTab(buildGitTabDraftState(targetDraft))
    setCurrentDocumentId(targetDraft.documentId)
    loadDocument(targetDraft.draftContent, targetDraft.name, targetDraft.documentId)
  }, [loadDocument, setCurrentDocumentId])

  const continuePendingGitCommit = useCallback(async (documentId: string, fallbackFileName: string) => {
    const commitMessage = useGitStore.getState().pendingCommitMessage
    if (!commitMessage) {
      return
    }

    const latestState = useGitStore.getState()
    const latestDraft = latestState.drafts[documentId]
    const nextConflictDraft = Object.values(latestState.drafts).find((draft) => draft.status === 'conflict')
    const hasDraftChange = Boolean(latestDraft?.isDirty || latestDraft?.isNew)
    const hasStagedChanges = latestState.stagedChanges.length > 0

    if (nextConflictDraft) {
      openGitDraftByDocumentId(nextConflictDraft.documentId)
      return
    }

    if (!hasDraftChange && !hasStagedChanges) {
      clearPendingCommit()
      if (activeTabId) {
        useTabsStore.getState().markTabAsSaved(activeTabId, latestDraft?.name || fallbackFileName)
      }
      return
    }

    try {
      await commitCurrentFile(commitMessage)
      const nextDraft = useGitStore.getState().drafts[documentId]
      if (activeTabId) {
        if (nextDraft) {
          useTabsStore.getState().updateTabContent(activeTabId, nextDraft.draftContent)
          loadDocument(nextDraft.draftContent, nextDraft.name, nextDraft.documentId)
        }
        useTabsStore.getState().markTabAsSaved(activeTabId, nextDraft?.name || fallbackFileName)
      }
      clearPendingCommit()
      toast({ title: t('git.commitSuccess') })
    } catch {
      const latestConflictDraft = Object.values(useGitStore.getState().drafts).find((draft) => draft.status === 'conflict')
      if (latestConflictDraft) {
        openGitDraftByDocumentId(latestConflictDraft.documentId)
      }
      // handled by store
    }
  }, [activeTabId, clearPendingCommit, commitCurrentFile, loadDocument, openGitDraftByDocumentId, t])

  // 使用 ref 保存 templateEditMode，避免 handleSave 的闭包问题
  const templateEditModeRef = useRef(templateEditMode)
  useEffect(() => {
    templateEditModeRef.current = templateEditMode
  }, [templateEditMode])

  // 获取主题配置
  const { getThemeConfig } = useThemeStore()
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light

  // 初始化加载
  useEffect(() => {
    setMounted(true)
    initTheme()
  }, [])

  useEffect(() => {
    const handleOutlineJump = (event: Event) => {
      const detail = (event as CustomEvent<OutlineJumpDetail>).detail
      if (!detail || typeof detail.line !== 'number' || !rightCollapsed) return

      pendingOutlineJumpRef.current = detail
      setRightCollapsed(false)
    }

    window.addEventListener('outline-jump', handleOutlineJump)
    return () => {
      window.removeEventListener('outline-jump', handleOutlineJump)
    }
  }, [rightCollapsed])

  useEffect(() => {
    if (rightCollapsed || !pendingOutlineJumpRef.current) return

    const detail = pendingOutlineJumpRef.current
    pendingOutlineJumpRef.current = null

    window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('outline-jump', { detail }))
    })
  }, [rightCollapsed])

  useEffect(() => {
    const handlePreviewOpen = (event: Event) => {
      const detail = (event as CustomEvent<PreviewOpenDetail>).detail
      if (!detail?.mode || !rightCollapsed) return

      pendingPreviewOpenRef.current = detail
      setRightCollapsed(false)
    }

    window.addEventListener('visualmd:open-preview', handlePreviewOpen)
    return () => {
      window.removeEventListener('visualmd:open-preview', handlePreviewOpen)
    }
  }, [rightCollapsed])

  useEffect(() => {
    if (rightCollapsed || !pendingPreviewOpenRef.current) return

    const detail = pendingPreviewOpenRef.current
    pendingPreviewOpenRef.current = null

    window.requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('visualmd:open-preview', { detail }))
    })
  }, [rightCollapsed])



  // 监听标签页切换，加载对应内容到编辑器
  useEffect(() => {
    if (!mounted) return

    syncTabContentFromSource(activeTab)

    if (!hasActiveTab) {
      setCurrentDocumentId(null)
      useFileSystemStore.setState({ currentFileId: null })
      clearDocument()
      return
    }

    // 处理模板编辑状态
    if (activeTabIsTemplate && activeTabTemplateId) {
      // 切换到模板编辑模式
      setTemplateEditMode({
        isActive: true,
        content: activeTabCurrentContent,
        templateName: activeTabFileName,
        templateId: activeTabTemplateId,
      })
      useTemplateStore.setState({
        editingTemplateId: activeTabTemplateId,
        isTemplateModified: activeTabIsModified,
      })
    } else {
      // 非模板标签，退出模板编辑模式
      setTemplateEditMode({ isActive: false, content: '', templateName: '', templateId: null })
      useTemplateStore.setState({ editingTemplateId: null, isTemplateModified: false })
    }

    if (activeTabSourceType === 'git' && isGitBinaryFileKind(activeGitFileKind)) {
      loadDocument('', activeTabFileName)
      setCurrentDocumentId(null)
      useFileSystemStore.setState({ currentFileId: null })
      return
    }

    // 只在标签身份切换时加载文档。内容更新由编辑器/AI 写回事务显式同步，避免 tab 内容变化反复触发 loadDocument。
    const currentDocumentMarkdown = useDocumentStore.getState().getCurrentMarkdown()
    if (
      document?.fileId !== (activeTabFileId || undefined) ||
      document?.fileName !== activeTabFileName ||
      currentDocumentMarkdown !== activeTabCurrentContent
    ) {
      loadDocument(activeTabCurrentContent, activeTabFileName, activeTabFileId)
    }

    // 同步文件面板选中状态
    if (activeTabSourceType === 'git') {
      setCurrentDocumentId(activeTabFileId || null)
      useFileSystemStore.setState({ currentFileId: null })
    } else if (activeTabFileId) {
      openFile(activeTabFileId)
      setCurrentDocumentId(null)
    } else {
      useFileSystemStore.setState({ currentFileId: null })
      setCurrentDocumentId(null)
    }
  }, [
    activeTabFileId,
    activeTabFileName,
    activeTabCurrentContent,
    activeGitFileKind,
    activeTabId,
    activeTabIsModified,
    activeTabIsTemplate,
    activeTabSourceType,
    activeTabTemplateId,
    clearDocument,
    document?.fileId,
    document?.fileName,
    hasActiveTab,
    loadDocument,
    mounted,
    openFile,
    setCurrentDocumentId,
    activeTab,
  ])

  // 仅在工作区首次加载时初始化欢迎文档，避免用户后续删除后被重新创建
  useEffect(() => {
    if (!mounted) return

    const timer = setTimeout(() => {
      initializeWelcomeDocs(DEFAULT_WELCOME_DOCUMENTS)
    }, 100)

    return () => clearTimeout(timer)
  }, [initializeWelcomeDocs, mounted])

  // 监听文档修改状态，在模板编辑模式下标记模板和标签为已修改
  useEffect(() => {
    const { document: currentDoc } = useDocumentStore.getState()
    const isDocModified = currentDoc?.isModified ?? false
    const currentTemplateEditMode = templateEditModeRef.current

    // 如果在模板编辑模式下文档被修改，标记模板和标签为已修改
    if (isDocModified && currentTemplateEditMode.isActive && currentTemplateEditMode.templateId) {
      useTemplateStore.setState({ isTemplateModified: true })
      
      // 同时更新标签页的修改状态
      const { tabs, activeTabId } = useTabsStore.getState()
      const currentTab = tabs.find(t => t.id === activeTabId)
      if (currentTab && currentTab.isTemplate && !currentTab.isModified) {
        useTabsStore.setState((state) => ({
          tabs: state.tabs.map(t =>
            t.id === activeTabId ? { ...t, isModified: true } : t
          ),
        }))
      }
      return
    }

    const { tabs, activeTabId } = useTabsStore.getState()
    const currentTab = tabs.find(t => t.id === activeTabId)
    if (isDocModified && currentTab && !currentTab.isModified) {
      useTabsStore.getState().markTabAsModified(currentTab.id, true)
    }

    if (
      isDocModified &&
      currentTab?.sourceType !== 'git' &&
      currentTab?.fileId
    ) {
      const currentFile = useFileSystemStore.getState().files.find((file) => file.id === currentTab.fileId)
      if (currentFile && !currentFile.isModified) {
        useFileSystemStore.getState().markFileAsModified(currentTab.fileId)
      }
    }
  }, [document?.isModified, templateEditMode.isActive])

  // 处理保存
  const handleSave = useCallback(async () => {
    await saveDirtyEditors()

    const getLatestState = () => {
      const { activeTabId, tabs } = useTabsStore.getState()
      const currentTab = tabs.find(t => t.id === activeTabId)
      const { getCurrentMarkdown, getIsModified } = useDocumentStore.getState()

      return {
        currentTab,
        latestMarkdown: getCurrentMarkdown(),
        documentModified: getIsModified(),
      }
    }

    let { currentTab, latestMarkdown, documentModified } = getLatestState()

    if (currentTab?.sourceType === 'git' && currentTab.fileId && currentTab.isModified && !documentModified) {
      const markdownPreviewSave = useUnsavedChangesStore.getState().editors['markdown-preview']?.save
      if (markdownPreviewSave) {
        await markdownPreviewSave()
        const refreshedState = getLatestState()
        currentTab = refreshedState.currentTab
        latestMarkdown = refreshedState.latestMarkdown
        documentModified = refreshedState.documentModified
      }
    }

    // 从 ref 获取最新的 templateEditMode（避免闭包问题）
    const currentTemplateEditMode = templateEditModeRef.current
    const { activeTabId } = useTabsStore.getState()

    if (currentTemplateEditMode.isActive && currentTemplateEditMode.templateId) {
      // 保存模板编辑到模板存储 - 直接使用 setState 避免闭包问题
      const templateId = currentTemplateEditMode.templateId

      useTemplateStore.setState((state) => ({
        templates: state.templates.map(t =>
          t.id === templateId
            ? { ...t, content: latestMarkdown, updatedAt: Date.now() }
            : t
        ),
      }))

      // 更新标签页状态 - 标记为已保存并更新内容
      const { tabs, activeTabId } = useTabsStore.getState()
      const currentTab = tabs.find(t => t.id === activeTabId)
      if (currentTab && currentTab.isTemplate) {
        useTabsStore.setState((state) => ({
          tabs: state.tabs.map(t =>
            t.id === activeTabId
              ? { ...t, content: latestMarkdown, isModified: false }
              : t
          ),
        }))
      }

      // 标记模板为已保存
      useTemplateStore.setState({ isTemplateModified: false })

      // 不关闭模板编辑模式，保持标签页打开
      toast({
        title: '模板已保存',
      })
      return
    }

    if (currentTab?.sourceType === 'git' && currentTab.fileId) {
      const activeGitDraft = useGitStore.getState().drafts[currentTab.fileId]
      const shouldPersistGitDraft =
        documentModified ||
        currentTab.isModified ||
        (activeGitDraft ? activeGitDraft.draftContent !== latestMarkdown : true)

      if (!shouldPersistGitDraft) {
        toast({
          title: t('git.draftSaved'),
        })
        return
      }

      persistMarkdownToActiveSource(latestMarkdown, currentTab.fileName, {
        markSaved: true,
        markDocumentSaved: true,
      })
      toast({
        title: t('git.draftSaved'),
      })
      return
    }

    if (documentModified) {
      persistActiveTabSave()
    }
  }, [t]) // 空依赖数组，使用 ref 获取最新状态

  // 监听 Ctrl+S 保存
  useEffect(() => {
    const runDocumentHistoryShortcut = (type: 'undo' | 'redo') => {
      const focusSnapshot = captureTextControlSnapshot(globalThis.document?.activeElement ?? null)
      const documentStore = useDocumentStore.getState()
      const applied = type === 'undo' ? documentStore.undo() : documentStore.redo()
      if (!applied) return false

      syncActiveDocumentToActiveSource({ markSaved: false })
      useAiChatStore.getState().syncToolUndoStackWithMarkdown(documentStore.getCurrentMarkdown())
      restoreTextControlSnapshot(focusSnapshot)
      return true
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      const isUndoKey = (e.ctrlKey || e.metaKey) && !e.shiftKey && key === 'z'
      const isRedoKey = (e.ctrlKey || e.metaKey) && (key === 'y' || (e.shiftKey && key === 'z'))

      if (isUndoKey || isRedoKey) {
        const historyStore = useHistoryStore.getState()
        const targetHistoryDescription = isUndoKey
          ? historyStore.getCurrentDescription()
          : historyStore.getRedoDescription()
        const shouldPreferNativeTextUndo = isTextEditingTarget(e.target) && !isAiDocumentHistoryDescription(targetHistoryDescription)
        if (!shouldPreferNativeTextUndo) {
          const applied = runDocumentHistoryShortcut(isUndoKey ? 'undo' : 'redo')
          if (applied) {
            e.preventDefault()
            e.stopPropagation()
          }
        }
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault()
        setActivePanel('files')
        setSearchDialogOpen(true)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setSearchDialogOpen(true)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        togglePanel()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
        const aiChatStore = useAiChatStore.getState()
        if (aiChatStore.selectionCandidate) {
          e.preventDefault()
          void aiChatStore.commitSelectionCandidate()
        }
      }
      // 面板切换快捷键
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault()
        useSidebarStore.getState().setActivePanel('files')
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault()
        useSidebarStore.getState().setActivePanel('git-files')
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault()
        useSidebarStore.getState().setActivePanel('outline')
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '4') {
        e.preventDefault()
        useSidebarStore.getState().setActivePanel('templates')
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '5') {
        e.preventDefault()
        useSidebarStore.getState().setActivePanel('git')
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '6') {
        e.preventDefault()
        useSidebarStore.getState().setActivePanel('ai')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, setActivePanel, togglePanel])

  // 处理编辑模板
  const handleEditTemplate = useCallback((content: string, templateName: string, templateId: string) => {
    // 清除当前文件ID，避免文件切换useEffect覆盖模板内容
    useFileSystemStore.setState({ currentFileId: null })

    // 设置正在编辑的模板ID（用于自动保存状态跟踪）
    useTemplateStore.setState({
      editingTemplateId: templateId,
      isTemplateModified: false,
    })

    // 创建一个新的标签页来编辑模板
    const { createTab, tabs } = useTabsStore.getState()
    
    // 检查是否已经有相同模板ID的标签页
    const existingTab = tabs.find(t => t.templateId === templateId)
    if (existingTab) {
      // 如果已存在，切换到该标签页
      useTabsStore.setState({ activeTabId: existingTab.id })
      loadDocument(content, templateName)
      setTemplateEditMode({ isActive: true, content, templateName, templateId })
      return
    }
    
    // 创建新标签页
    const newTabId = createTab(templateName, content)
    
    // 标记为模板编辑标签
    useTabsStore.setState((state) => ({
      tabs: state.tabs.map(t =>
        t.id === newTabId
          ? { ...t, templateId, isTemplate: true }
          : t
      ),
    }))
    
    // 加载模板内容
    loadDocument(content, templateName)
    setTemplateEditMode({ isActive: true, content, templateName, templateId })
  }, [loadDocument])

  // 处理预览模板
  const handlePreviewTemplate = useCallback((content: string, templateName: string) => {
    // 预览模式：加载模板内容但不进入编辑模式
    // 先清空当前文档，确保重新加载
    loadDocument('', 'temp')
    // 使用 setTimeout 确保状态更新后再加载新内容
    setTimeout(() => {
      loadDocument(content, templateName)
      // 不设置 templateEditMode，保持普通预览模式
      setTemplateEditMode({ isActive: false, content: '', templateName: '', templateId: null })
    }, 0)
  }, [loadDocument])

  // 服务端渲染时使用默认 light 主题，避免 hydration 不匹配
  const safeThemeConfig = mounted ? themeConfig : themeConfigs.light

  // 计算左侧面板总宽度
  const leftPanelWidth = isPanelExpanded ? LEFT_ICON_BAR_WIDTH + panelWidth : LEFT_ICON_BAR_WIDTH
  const visibleAiDockWidth = isAiDockOpen ? aiDockWidth : 0
  const visiblePreviewWidth = rightCollapsed ? 0 : rightPanelWidth
  const rightSidebarOccupiedWidth = visiblePreviewWidth + visibleAiDockWidth

  const getMaxSidebarWidths = useCallback(() => {
    const containerWidth = containerRef.current?.clientWidth ?? 0
    const centerPanelMinWidth = getCenterPanelMinWidth(containerWidth)
    const rightPanelMinWidth = getRightPanelMinWidth(containerWidth)
    const availableWidth = Math.max(0, containerWidth - centerPanelMinWidth)

    return {
      left: Math.max(leftPanelMinWidthRef.current, availableWidth - rightSidebarOccupiedWidth),
      right: Math.max(rightPanelMinWidth, availableWidth - leftPanelWidth - visibleAiDockWidth),
      ai: Math.max(MIN_AI_DOCK_WIDTH, availableWidth - leftPanelWidth - visiblePreviewWidth),
    }
  }, [leftPanelWidth, rightSidebarOccupiedWidth, visibleAiDockWidth, visiblePreviewWidth])

  const getInitialAiDockWidth = useCallback(() => {
    const containerWidth = containerRef.current?.clientWidth ?? 0
    const centerPanelMinWidth = getCenterPanelMinWidth(containerWidth)
    const availableWidth = Math.max(
      MIN_AI_DOCK_WIDTH,
      containerWidth - leftPanelWidth - visiblePreviewWidth - centerPanelMinWidth
    )

    return Math.max(MIN_AI_DOCK_WIDTH, Math.round(availableWidth * AI_DOCK_DEFAULT_WIDTH_RATIO))
  }, [leftPanelWidth, visiblePreviewWidth])

  useEffect(() => {
    if (!mounted) {
      return
    }

    const containerWidth = containerRef.current?.clientWidth ?? 0
    setRightPanelWidth((currentWidth) => Math.max(currentWidth, getInitialRightPanelWidth(containerWidth)))
  }, [mounted])

  useEffect(() => {
    const { left, right, ai } = getMaxSidebarWidths()

    if (leftPanelWidth > left && isPanelExpanded) {
      setPanelWidth(Math.max(leftPanelMinWidthRef.current - LEFT_ICON_BAR_WIDTH, left - LEFT_ICON_BAR_WIDTH))
    }

    if (rightPanelWidth > right) {
      setRightPanelWidth(right)
    }

    if (isAiDockOpen && aiDockWidth > ai) {
      setAiDockWidth(ai)
    }
  }, [aiDockWidth, getMaxSidebarWidths, isAiDockOpen, isPanelExpanded, leftPanelWidth, rightPanelWidth, setAiDockWidth, setPanelWidth])

  useEffect(() => {
    if (!mounted || aiDockHasCustomWidth) {
      return
    }

    primeAiDockWidth(getInitialAiDockWidth())
  }, [aiDockHasCustomWidth, getInitialAiDockWidth, mounted, primeAiDockWidth])

  const clearResizeState = useCallback(() => {
    const dragState = dragStateRef.current
    const handle = resizeHandleRef.current

    if (dragState && handle?.hasPointerCapture?.(dragState.pointerId)) {
      handle.releasePointerCapture(dragState.pointerId)
    }

    dragStateRef.current = null

    const body = globalThis.document?.body ?? null
    if (body) {
      body.style.cursor = ''
      body.style.userSelect = ''
    }

    resizeHandleRef.current = null
    setIsResizing(false)
  }, [])

  const clearAiResizeState = useCallback(() => {
    const dragState = aiDragStateRef.current
    const handle = aiResizeHandleRef.current

    if (dragState && handle?.hasPointerCapture?.(dragState.pointerId)) {
      handle.releasePointerCapture(dragState.pointerId)
    }

    aiDragStateRef.current = null

    const body = globalThis.document?.body ?? null
    if (body) {
      body.style.cursor = ''
      body.style.userSelect = ''
    }

    aiResizeHandleRef.current = null
    setIsAiDockResizing(false)
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current
      const container = containerRef.current
      if (!dragState || !container) return

      const totalWidth = container.getBoundingClientRect().width
      const centerPanelMinWidth = getCenterPanelMinWidth(totalWidth)
      const rightPanelMinWidth = getRightPanelMinWidth(totalWidth)

      if (dragState.side === 'left') {
        const nextLeftWidth = dragState.startLeftWidth + (event.clientX - dragState.startX)
        const maxLeftWidth = Math.max(
          leftPanelMinWidthRef.current,
          totalWidth - dragState.startRightWidth - centerPanelMinWidth
        )
        const clampedLeftWidth = Math.min(Math.max(leftPanelMinWidthRef.current, nextLeftWidth), maxLeftWidth)
        setPanelWidth(clampedLeftWidth - LEFT_ICON_BAR_WIDTH)
        return
      }

      const nextRightWidth = dragState.startRightWidth + (dragState.startX - event.clientX)
      const maxRightWidth = Math.max(
        rightPanelMinWidth,
        totalWidth - dragState.startLeftWidth - centerPanelMinWidth
      )
      const clampedRightWidth = Math.min(Math.max(rightPanelMinWidth, nextRightWidth), maxRightWidth)
      setRightPanelWidth(clampedRightWidth)
    }

    const handleAiPointerMove = (event: PointerEvent) => {
      const dragState = aiDragStateRef.current
      const container = containerRef.current
      if (!dragState || !container) return

      const totalWidth = container.getBoundingClientRect().width
      const centerPanelMinWidth = getCenterPanelMinWidth(totalWidth)
      const rightPanelMinWidth = rightCollapsed ? 0 : getRightPanelMinWidth(totalWidth)
      const maxWidth = Math.max(
        MIN_AI_DOCK_WIDTH,
        totalWidth - leftPanelWidth - rightPanelMinWidth - centerPanelMinWidth
      )
      const nextWidth = dragState.startWidth + (dragState.startX - event.clientX)
      const clampedWidth = Math.min(Math.max(MIN_AI_DOCK_WIDTH, nextWidth), maxWidth)

      if (!rightCollapsed) {
        const totalRightAvailable = Math.max(
          rightPanelMinWidth,
          totalWidth - leftPanelWidth - centerPanelMinWidth
        )
        const nextRightWidth = Math.max(rightPanelMinWidth, totalRightAvailable - clampedWidth)
        setRightPanelWidth(nextRightWidth)
      }

      setAiDockWidth(clampedWidth)
    }

    const handlePointerUp = () => clearResizeState()
    const handlePointerCancel = () => clearResizeState()
    const handleWindowBlur = () => clearResizeState()
    const handleAiPointerUp = () => clearAiResizeState()
    const handleAiPointerCancel = () => clearAiResizeState()
    const handleAiWindowBlur = () => clearAiResizeState()

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointermove', handleAiPointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointerup', handleAiPointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    window.addEventListener('pointercancel', handleAiPointerCancel)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('blur', handleAiWindowBlur)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointermove', handleAiPointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointerup', handleAiPointerUp)
      window.removeEventListener('pointercancel', handlePointerCancel)
      window.removeEventListener('pointercancel', handleAiPointerCancel)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('blur', handleAiWindowBlur)
    }
  }, [clearAiResizeState, clearResizeState, leftPanelWidth, rightCollapsed, setAiDockWidth, setPanelWidth])

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) {
        return
      }

      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  const startResize = useCallback((side: 'left' | 'right', event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    resizeHandleRef.current = handle
    dragStateRef.current = {
      side,
      startX: event.clientX,
      startLeftWidth: leftPanelWidth,
      startRightWidth: rightPanelWidth,
      pointerId: event.pointerId,
    }
    const body = globalThis.document?.body ?? null
    if (body) {
      body.style.cursor = 'col-resize'
      body.style.userSelect = 'none'
    }
    setIsResizing(true)
  }, [leftPanelWidth, rightPanelWidth])

  const startAiResize = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    aiResizeHandleRef.current = handle
    aiDragStateRef.current = {
      startX: event.clientX,
      startWidth: aiDockWidth,
      startRightWidth: rightPanelWidth,
      pointerId: event.pointerId,
    }
    const body = globalThis.document?.body ?? null
    if (body) {
      body.style.cursor = 'col-resize'
      body.style.userSelect = 'none'
    }
    setIsAiDockResizing(true)
  }, [aiDockWidth, rightPanelWidth])

  return (
    <div className="flex h-screen flex-col" style={{ backgroundColor: safeThemeConfig.background }}>
      {/* 工具栏 */}
      <EditorToolbar
        onSearch={() => setSearchDialogOpen(true)}
        onToggleAiDock={() => setAiDockOpen(!isAiDockOpen)}
        aiDockOpen={isAiDockOpen}
      />

      {/* 搜索对话框 */}
      <SearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
      />
      <UnsavedChangesDialog />

      {/* 主内容区 */}
      <div ref={containerRef} className="relative flex flex-1 overflow-hidden">
        {/* 左侧 Obsidian 风格侧边栏 */}
        <div
          className="flex h-full flex-shrink-0 transition-all duration-300"
          style={{
            width: leftPanelWidth,
            backgroundColor: safeThemeConfig.sidebar,
          }}
        >
          {/* 图标栏 */}
          <IconSidebar />

          {/* 功能面板 */}
          <PanelContainer onEditTemplate={handleEditTemplate} onPreviewTemplate={handlePreviewTemplate} />
        </div>

        {/* 中间面板 - React Flow画布或空白页 */}
        {isPanelExpanded && (
          <div
            className="absolute inset-y-0 z-20"
            style={{
              left: leftPanelWidth - RESIZE_HANDLE_HIT_AREA / 2,
              width: RESIZE_HANDLE_HIT_AREA,
              cursor: 'col-resize',
            }}
            onPointerDown={(event) => startResize('left', event)}
            onMouseEnter={(event) => {
              event.currentTarget.style.backgroundColor = `${safeThemeConfig.border}22`
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.backgroundColor = 'transparent'
            }}
          />
        )}

        <div
          className="absolute inset-y-0 min-w-0"
          style={{
            left: leftPanelWidth,
            right: visibleAiDockWidth + visiblePreviewWidth,
            backgroundColor: safeThemeConfig.background,
            transition: 'left 0.3s ease, right 0.3s ease',
          }}
        >
          {(() => {
            const showEmptyView = !activeTabId || (!isActiveBinaryGitTab && activeTab?.isNew && !activeTab?.content?.trim())
            return showEmptyView ? (
              <EmptyTabView tabId={activeTabId || 'blank'} onOpenSearch={() => setSearchDialogOpen(true)} />
            ) : activeGitConflict && activeGitDraft ? (
              <GitConflictView
                draft={activeGitDraft}
                pendingConflictCount={conflictedDrafts.length}
                onUseLocal={async () => {
                  acceptLocalVersion(activeGitDraft.documentId)
                  const latestDraft = useGitStore.getState().drafts[activeGitDraft.documentId]
                  const nextContent = latestDraft?.draftContent || activeGitDraft.draftContent
                  if (activeTabId) {
                    useTabsStore.getState().updateTabContent(activeTabId, nextContent)
                    useTabsStore.getState().markTabAsModified(activeTabId, true)
                  }
                  loadDocument(nextContent, activeGitDraft.name, activeGitDraft.documentId)
                  await continuePendingGitCommit(activeGitDraft.documentId, activeGitDraft.name)
                }}
                onUseRemote={async () => {
                  acceptRemoteVersion(activeGitDraft.documentId)
                  const latestDraft = useGitStore.getState().drafts[activeGitDraft.documentId]
                  const nextContent = latestDraft?.draftContent || activeGitDraft.remoteContent || ''
                  if (activeTabId) {
                    useTabsStore.getState().updateTabContent(activeTabId, nextContent)
                    if (pendingCommitMessage) {
                      useTabsStore.getState().markTabAsModified(activeTabId, true)
                    } else {
                      useTabsStore.getState().markTabAsSaved(activeTabId, activeGitDraft.name)
                    }
                  }
                  loadDocument(nextContent, activeGitDraft.name, activeGitDraft.documentId)
                  await continuePendingGitCommit(activeGitDraft.documentId, activeGitDraft.name)
                }}
                onApplyMerged={async (content) => {
                  resolveConflictUsingContent(activeGitDraft.documentId, content)
                  if (activeTabId) {
                    useTabsStore.getState().updateTabContent(activeTabId, content)
                    useTabsStore.getState().markTabAsModified(activeTabId, true)
                  }
                  loadDocument(content, activeGitDraft.name, activeGitDraft.documentId)
                  await continuePendingGitCommit(activeGitDraft.documentId, activeGitDraft.name)
                }}
              />
            ) : isActiveBinaryGitTab ? (
              <BinaryGitCanvasPlaceholder fileName={activeTab?.fileName || 'Binary File'} themeConfig={safeThemeConfig} />
            ) : (
              <EditorCanvasShell document={document} />
            )
          })()}
        </div>

        {/* 右侧面板 - 预览 */}
        {(isResizing || isAiDockResizing) && (
          <div
            className="absolute inset-0 z-30"
            style={{ cursor: 'col-resize' }}
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
          />
        )}

        {isAiDockOpen && (
          <div
            className="absolute right-0 top-0 bottom-0 overflow-hidden border-l transition-all duration-300"
            style={{
              width: aiDockWidth,
              backgroundColor: safeThemeConfig.card,
              borderColor: safeThemeConfig.border,
            }}
          >
            <div
              className="absolute inset-y-0 left-0 z-20"
              style={{
                width: AI_DOCK_RESIZE_HIT_AREA,
                transform: `translateX(-${AI_DOCK_RESIZE_HIT_AREA / 2}px)`,
                cursor: 'col-resize',
              }}
              onPointerDown={startAiResize}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = `${safeThemeConfig.border}22`
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = 'transparent'
              }}
            />
            <AiChatDock onClose={() => setAiDockOpen(false)} />
          </div>
        )}

        {!rightCollapsed && (
          <div
            className="absolute right-0 top-0 bottom-0 border-l transition-all duration-300"
            style={{
              right: visibleAiDockWidth,
              width: rightPanelWidth,
              backgroundColor: safeThemeConfig.card,
              borderColor: safeThemeConfig.border,
            }}
          >
            <div
              className="absolute inset-y-0 left-0 z-20"
              style={{
                width: RESIZE_HANDLE_HIT_AREA,
                transform: `translateX(-${RESIZE_HANDLE_HIT_AREA / 2}px)`,
                cursor: 'col-resize',
              }}
              onPointerDown={(event) => startResize('right', event)}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor = `${safeThemeConfig.border}22`
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = 'transparent'
              }}
            />

            <Button
              variant="ghost"
              size="icon"
              className="absolute -left-3 top-1/2 z-20 h-8 w-6 -translate-y-1/2 rounded-l-md rounded-r-none border p-0 shadow-sm transition-all hover:shadow-md"
              style={{
                backgroundColor: safeThemeConfig.card,
                borderColor: safeThemeConfig.border,
                color: safeThemeConfig.text,
              }}
              onClick={() => setRightCollapsed(true)}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>

            <div className="h-full min-w-0 overflow-auto">
              <MarkdownPreview />
            </div>
          </div>
        )}

        {/* 右侧面板展开按钮 */}
        {rightCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 top-1/2 z-20 h-8 w-5 -translate-y-1/2 rounded-l-md rounded-r-none border p-0 shadow-sm transition-all hover:shadow-md"
            style={{
              backgroundColor: safeThemeConfig.card,
              borderColor: safeThemeConfig.border,
              color: safeThemeConfig.text,
            }}
            onClick={() => setRightCollapsed(false)}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
        )}

        {/* 节点编辑面板 - 独立显示，不受右侧面板折叠影响 */}
        {selectedNodeId && <NodeEditPanel />}
      </div>
    </div>
  )
}
