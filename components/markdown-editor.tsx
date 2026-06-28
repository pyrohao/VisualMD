'use client'

/**
 * Markdown编辑器主组件
 *
 * 整合所有子组件的主编辑器界面
 * 布局：Obsidian 风格（图标栏 | 功能面板 | 可视化画布 | 预览）
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { EditorToolbar } from './editor-toolbar'
import { IconSidebar } from './sidebar/icon-sidebar'
import { PanelContainer } from './sidebar/panel-container'
import { MarkdownPreview } from './markdown-preview'
import { AiChatDock } from './ai-chat-dock'
import { NodeEditPanel } from './node-edit-panel'
import { SearchDialog } from './search-dialog'
import { UnsavedChangesDialog } from './unsaved-changes-dialog'
import { Button } from './ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { useDocumentStore } from '@/stores/documentStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useGitStore } from '@/stores/gitStore'
import { hasUnsavedChanges, saveDirtyEditors } from '@/stores/unsavedChangesStore'
import { useTranslation } from '@/stores/languageStore'
import { SIDEBAR_PANEL_MIN_WIDTH, useSidebarStore } from '@/stores/sidebarStore'
import { useTabsStore } from '@/stores/tabsStore'
import { initTheme, useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useSidebarStore as useTemplateStore } from '@/stores/sidebarStore'
import { MIN_AI_DOCK_WIDTH, useAiDockStore } from '@/stores/aiDockStore'
import { useAiChatStore } from '@/stores/aiChatStore'
import { EmptyTabView } from './empty-tab-view'
import { EditorCanvasShell } from './editor-canvas-shell'
import { persistActiveTabSave, syncActiveDocumentToActiveSource } from '@/lib/editor-persistence'
import { inferGitFileKind, isGitBinaryFileKind } from '@/lib/git/file-kind'
import { useHistoryStore } from '@/stores/historyStore'

/**
 * 默认示例Markdown内容（英文版）
 */
const defaultMarkdownEN = `---
title: Markdown Visual Editor
author: PyroHao
description: A visual node-based editor for markdown documents
---

# Markdown Visual Editor

Welcome to the Markdown Visual Editor! This innovative tool transforms Markdown documents into an interactive node-based tree structure, making document organization intuitive and efficient.

## Core Features

### Visual Node Tree

- **Interactive Canvas**: Drag and drop nodes to reorganize content
- **Real-time Sync**: Changes reflect instantly across all views
- **Node Connections**: Visualize document hierarchy with connected edges
- **Detach & Reattach**: Break connections and reconnect nodes freely

### Dual Editing Modes

Switch between two powerful editing modes:

- **Visual Mode**: Edit through the interactive node graph
- **Text Mode**: Direct Markdown source editing with live preview

### Smart Node Operations

- **Add Child Nodes**: Right-click or drag to create new nodes
- **Batch Creation**: Create multiple child nodes at once
- **Delete Options**: Delete current node only or with all children
- **Move & Reorder**: Drag nodes to new positions or change order

## Getting Started

### Basic Navigation

1. **Left Sidebar**: File explorer and disconnected nodes panel
2. **Center Canvas**: Visual node editing with zoom and pan
3. **Right Panel**: Live preview and node editor

### Creating Content

- Click any node to edit its title and content
- Use Markdown syntax in the content area
- Add child nodes by dragging from connection points
- Disconnect nodes by right-clicking edges

## Advanced Features

### AI Document Generation

The editor includes AI-powered document generation:

- **Multiple Providers**: OpenAI, Volcano Engine, SiliconFlow, etc.
- **Custom Prompts**: Describe what you need, AI generates the structure
- **One-click Import**: Generated documents are automatically saved

### Disconnected Nodes Panel

Manage orphaned nodes efficiently:

- View all disconnected nodes in one place
- Reconnect nodes to any parent
- Organize floating content before integrating

### Metadata Support

Document metadata using YAML Front Matter:

\`\`\`yaml
---
title: Document Title
description: Brief description
date: 2024-01-15
---
\`\`\`

### Multi-language Support

- **Interface Languages**: Switch between Chinese and English

### Template Library

Quickly create documents from predefined templates:

- **Built-in Templates**: Ready-to-use document templates
- **Custom Templates**: Create and save your own templates
- **Import Templates**: Import templates from Markdown files
- **One-click Apply**: Instantly create documents from templates

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| \`Ctrl+S\` | Save document |
| \`Ctrl+Z\` | Undo |
| \`Ctrl+Y\` | Redo |

## Tips & Tricks

### Content Editing

- Write Markdown in node content to create sub-nodes automatically
- Use \`#\` headers in content to generate child hierarchy
- Collapse/expand nodes to focus on specific sections

### Visual Organization

- Use the layout button to auto-arrange nodes
- Zoom in/out for overview or detailed editing
- Select edges to highlight connections

### File Management

- Create folders to organize documents
- Drag files between folders
- Export to Markdown formats

## About

This editor combines the power of Markdown with visual node editing, making document structure management intuitive and efficient. Perfect for documentation, brainstorming, and structured writing.

## Community

Join our community to share ideas, get help, and connect with other users. We welcome feedback and suggestions to make this tool even better.
`

/**
 * 默认示例Markdown内容（中文版）
 */
const defaultMarkdownCN = `---
title: Markdown 可视化编辑器
author: PyroHao
description: 基于节点的 Markdown 可视化编辑器
---

# Markdown 可视化编辑器

欢迎使用 Markdown 可视化编辑器！这是一款创新工具，将 Markdown 文档转换为交互式节点树状结构，让文档组织变得直观高效。

## 核心功能

### 可视化节点树

- **交互式画布**：拖拽节点重新组织内容
- **实时同步**：所有视图的更改即时反映
- **节点连接**：用连接线可视化文档层级
- **断开与重连**：自由断开连接并重新连接节点

### 双模式编辑

在两种强大的编辑模式间切换：

- **可视化模式**：通过交互式节点图编辑
- **文本模式**：直接编辑 Markdown 源码并实时预览

### 智能节点操作

- **添加子节点**：右键或拖拽创建新节点
- **批量创建**：一次创建多个子节点
- **删除选项**：仅删除当前节点或删除所有子节点
- **移动与排序**：拖拽节点到新位置或改变顺序

## 开始使用

### 基础导航

1. **左侧边栏**：文件资源管理器和断开节点面板
2. **中央画布**：可视化节点编辑，支持缩放和平移
3. **右侧面板**：实时预览和节点编辑器

### 创建内容

- 点击任意节点编辑标题和内容
- 在内容区域使用 Markdown 语法
- 从连接点拖拽添加子节点
- 右键边线断开节点连接

## 高级功能

### AI 文档生成

编辑器内置 AI 驱动的文档生成功能：

- **多厂商支持**：OpenAI、火山引擎、硅基流动等
- **自定义提示**：描述你的需求，AI 生成文档结构
- **一键导入**：生成的文档自动保存

### 断开节点面板

高效管理孤立节点：

- 在一个地方查看所有断开节点
- 将节点重新连接到任意父节点
- 在整合前组织浮动内容

### 元数据支持

使用 YAML Front Matter 定义文档元数据：

\`\`\`yaml
---
title: 文档标题
description: 简要描述
---
\`\`\`

### 多语言支持

- **界面语言**：中英文界面一键切换

### 模板库

从预定义模板快速创建文档：

- **内置模板**：即用型文档模板
- **自定义模板**：创建并保存你自己的模板
- **导入模板**：从 Markdown 文件导入模板
- **一键应用**：从模板即时创建文档

## 键盘快捷键

| 快捷键 | 功能 |
|--------|------|
| \`Ctrl+S\` | 保存文档 |
| \`Ctrl+Z\` | 撤销 |
| \`Ctrl+Y\` | 重做 |

## 使用技巧

### 内容编辑

- 在节点内容中编写 Markdown 自动创建子节点
- 使用 \`#\` 标题在内容中生成子层级
- 折叠/展开节点以专注于特定章节

### 可视化组织

- 使用布局按钮自动排列节点
- 放大/缩小以概览或精细编辑
- 选中边线高亮显示连接

### 文件管理

- 创建文件夹组织文档
- 在文件夹间拖拽文件
- 导出为 Markdown格式

## 关于

本编辑器结合 Markdown 的强大功能与可视化节点编辑，让文档结构管理变得直观高效。适用于技术文档、头脑风暴和结构化写作。

## 社区

欢迎加入我们的社区，分享使用心得、获取帮助，与其他用户交流。我们期待你的反馈和建议，让这款工具变得更好。
`

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
  const { loadDocument, document, selectedNodeId } = useDocumentStore()
  const { currentFileId, openFile } = useFileSystemStore()
  const { setCurrentDocumentId } = useGitStore()
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
  const isActiveBinaryGitTab =
    activeTabSourceType === 'git' && isGitBinaryFileKind(activeGitFileKind)

  // 使用 ref 保存当前文件 ID，避免自动保存时的闭包问题
  const currentFileIdRef = useRef(currentFileId)
  useEffect(() => {
    currentFileIdRef.current = currentFileId
  }, [currentFileId])

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



  // 监听标签页切换，加载对应内容到编辑器
  useEffect(() => {
    if (!mounted) return

    const latestActiveTab = useTabsStore.getState().getActiveTab()

    if (!hasActiveTab) {
      setCurrentDocumentId(null)
      useFileSystemStore.setState({ currentFileId: null })
      return
    }

    // 处理模板编辑状态
    if (activeTabIsTemplate && activeTabTemplateId) {
      // 切换到模板编辑模式
      setTemplateEditMode({
        isActive: true,
        content: latestActiveTab?.content || '',
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
    if (document?.fileId !== (activeTabFileId || undefined) || document?.fileName !== activeTabFileName) {
      loadDocument(latestActiveTab?.content || '', activeTabFileName, activeTabFileId)
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
    activeGitFileKind,
    activeTabId,
    activeTabIsModified,
    activeTabIsTemplate,
    activeTabSourceType,
    activeTabTemplateId,
    document?.fileId,
    document?.fileName,
    hasActiveTab,
    loadDocument,
    mounted,
    openFile,
    setCurrentDocumentId,
  ])

  // 创建默认文件（只在客户端挂载后且确实没有文件时执行一次）
  useEffect(() => {
    if (!mounted) return

    // 延迟执行，确保 persist 中间件已完成数据恢复
    const timer = setTimeout(() => {
      const { files } = useFileSystemStore.getState()
      if (files.length === 0) {
        const { importFile } = useFileSystemStore.getState()
        // 同时导入中英文两个示例文档
        importFile('Welcome.md', defaultMarkdownEN, null)
        importFile('欢迎使用.md', defaultMarkdownCN, null)
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [mounted])

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
  }, [document?.isModified, templateEditMode.isActive])

  // 处理保存
  const handleSave = useCallback(async () => {
    await saveDirtyEditors()

    // 获取最新的 markdown 内容（从 store 实时获取，避免闭包问题）
    const { getCurrentMarkdown: getLatestMarkdown, markAsSaved } = useDocumentStore.getState()
    const latestMarkdown = getLatestMarkdown()
    
    // 从 ref 获取最新的 templateEditMode（避免闭包问题）
    const currentTemplateEditMode = templateEditModeRef.current
    const currentFileId = currentFileIdRef.current
    const { activeTabId, tabs } = useTabsStore.getState()
    const currentTab = tabs.find(t => t.id === activeTabId)

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
      const currentGitKind =
        currentTab.gitMeta?.fileKind || (currentTab.gitMeta?.path ? inferGitFileKind(currentTab.gitMeta.path) : 'text')
      if (isGitBinaryFileKind(currentGitKind)) {
        return
      }
      persistActiveTabSave()
      toast({
        title: t('git.draftSaved'),
      })
      return
    }

    if (currentFileId) {
      persistActiveTabSave()
      markAsSaved()
    }
  }, [t]) // 空依赖数组，使用 ref 获取最新状态

  // 监听 Ctrl+S 保存
  useEffect(() => {
    const runDocumentHistoryShortcut = (type: 'undo' | 'redo') => {
      const documentStore = useDocumentStore.getState()
      const applied = type === 'undo' ? documentStore.undo() : documentStore.redo()
      if (!applied) return false

      syncActiveDocumentToActiveSource({ markSaved: false })
      useAiChatStore.getState().syncToolUndoStackWithMarkdown(documentStore.getCurrentMarkdown())
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
        const shouldPreferNativeTextUndo = isTextEditingTarget(e.target) && targetHistoryDescription !== 'AI agent apply_tool'
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
        useSidebarStore.getState().setActivePanel('outline')
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault()
        useSidebarStore.getState().setActivePanel('templates')
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '4') {
        e.preventDefault()
        useSidebarStore.getState().setActivePanel('ai')
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '5') {
        e.preventDefault()
        useSidebarStore.getState().setActivePanel('git')
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

