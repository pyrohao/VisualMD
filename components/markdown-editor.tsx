'use client'

/**
 * Markdown编辑器主组件
 *
 * 整合所有子组件的主编辑器界面
 * 布局：Obsidian 风格（图标栏 | 功能面板 | 可视化画布 | 预览）
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { EditorToolbar } from './editor-toolbar'
import { IconSidebar } from './sidebar/icon-sidebar'
import { PanelContainer } from './sidebar/panel-container'
import { FlowCanvas } from './flow-canvas'
import { MarkdownPreview } from './markdown-preview'
import { NodeEditPanel } from './node-edit-panel'
import { SearchDialog } from './search-dialog'
import { Button } from './ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useTabsStore } from '@/stores/tabsStore'
import { initTheme, useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useSidebarStore as useTemplateStore } from '@/stores/sidebarStore'
import { EmptyTabView } from './empty-tab-view'

/**
 * 默认示例Markdown内容
 */
const defaultMarkdown = `---
name: Markdown Visual Editor
description: A visual editor for markdown documents
author: PyroHao
version: 1.0.0
---

# Markdown可视化编辑器

欢迎使用Markdown可视化编辑器！这是一个创新的工具，将Markdown文档转换为可视化的树状结构。

## 核心功能

本编辑器提供以下主要功能：

### 可视化节点树

- 使用React Flow展示文档结构
- 拖拽节点重新组织内容
- 实时同步更新

### 双向编辑

编辑器支持两种编辑模式：

- **可视化模式**：通过节点图编辑
- **文本模式**：直接编辑Markdown源码

## 技术特性

### 解析引擎

采用统一的解析引擎进行Markdown处理。

### 状态管理

确保画布、文本编辑器和预览视图实时同步。

## 开始使用

1. 在左侧查看文档树结构
2. 在中间画布中可视化编辑节点
3. 在右侧预览最终效果

### 快捷键

- \`Ctrl+S\`: 保存文档
- \`Ctrl+B\`: 加粗文本
- \`Ctrl+I\`: 斜体文本

## 高级功能

### Metadata 支持

文档元数据使用 Metadata (YAML Front Matter) 格式定义。

### 导出选项

支持多种导出格式：

- Markdown (.md)
- HTML
- PDF

## 关于

这是一个展示Markdown文档可视化编辑能力的演示项目。
`

export function MarkdownEditor() {
  // 面板收起状态
  const [rightCollapsed, setRightCollapsed] = useState(false)
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

  // 获取Store
  const { loadDocument, document, selectedNodeId, getCurrentMarkdown, getIsModified, updateNode } = useDocumentStore()
  const { currentFileId, files, saveFile, markFileAsSaved, openFile, createFile } = useFileSystemStore()
  const { isPanelExpanded, panelWidth } = useSidebarStore()
  const { activeTabId, getActiveTab, tabs } = useTabsStore()
  const currentMarkdown = getCurrentMarkdown()
  const isModified = getIsModified()

  // 获取当前激活的标签页
  const activeTab = getActiveTab()

  // 计算当前文件
  const currentFile = files.find(f => f.id === currentFileId) || null

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
    if (!mounted || !activeTab) return

    // 如果标签页有内容，加载到编辑器（传入 fileId 以恢复状态）
    if (activeTab.content) {
      loadDocument(activeTab.content, activeTab.fileName, activeTab.fileId || undefined)
    }

    // 同步文件面板选中状态
    if (activeTab.fileId) {
      openFile(activeTab.fileId)
    }
  }, [activeTabId, mounted, loadDocument, openFile])

  // 创建默认文件（只在客户端挂载后且确实没有文件时执行一次）
  useEffect(() => {
    if (!mounted) return

    // 延迟执行，确保 persist 中间件已完成数据恢复
    const timer = setTimeout(() => {
      const { files } = useFileSystemStore.getState()
      if (files.length === 0) {
        const { importFile } = useFileSystemStore.getState()
        importFile('欢迎使用.md', defaultMarkdown, null)
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [mounted])

  // 当切换文件时，加载文档到编辑器
  useEffect(() => {
    if (currentFileId) {
      // 如果正在编辑模板，先退出模板编辑模式
      if (templateEditMode.isActive) {
        setTemplateEditMode({ isActive: false, content: '', templateName: '', templateId: null })
      }
      
      // 保存之前文件的状态（如果有）
      const previousFileId = currentFileIdRef.current
      if (previousFileId && previousFileId !== currentFileId) {
        const { markAsSaved } = useDocumentStore.getState()
        markAsSaved()
      }
      
      // 直接从 store 获取最新的文件内容，而不是使用闭包中的 currentFile
      const { files: latestFiles } = useFileSystemStore.getState()
      const latestFile = latestFiles.find(f => f.id === currentFileId)
      if (latestFile) {
        loadDocument(latestFile.content, latestFile.name, latestFile.id)
      }
    }
  }, [currentFileId, loadDocument, templateEditMode.isActive])

  // 监听文档修改状态，在模板编辑模式下标记模板为已修改
  useEffect(() => {
    const { document: currentDoc } = useDocumentStore.getState()
    const isDocModified = currentDoc?.isModified ?? false
    const currentTemplateEditMode = templateEditModeRef.current

    // 如果在模板编辑模式下文档被修改，标记模板为已修改
    if (isDocModified && currentTemplateEditMode.isActive && currentTemplateEditMode.templateId) {
      useTemplateStore.setState({ isTemplateModified: true })
    }
  }, [document?.isModified, templateEditMode.isActive])

  // 自动保存逻辑已移至 node-edit-panel.tsx
  // 这里保留 markAsSaved 用于手动保存（Ctrl+S）
  const handleAutoSave = useCallback(() => {
    const { document } = useDocumentStore.getState()
    if (document?.fileId) {
      const { markAsSaved } = useDocumentStore.getState()
      markAsSaved()
    }
  }, [])



  // 处理保存
  const handleSave = useCallback(() => {
    // 获取最新的 markdown 内容（从 store 实时获取，避免闭包问题）
    const { getCurrentMarkdown: getLatestMarkdown } = useDocumentStore.getState()
    const latestMarkdown = getLatestMarkdown()
    
    // 从 ref 获取最新的 templateEditMode（避免闭包问题）
    const currentTemplateEditMode = templateEditModeRef.current
    const currentFileId = currentFileIdRef.current

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

      // 标记模板为已保存
      useTemplateStore.setState({ isTemplateModified: false })

      setTemplateEditMode({ isActive: false, content: '', templateName: '', templateId: null })
      toast({
        title: '模板已保存',
      })
      return
    }

    if (currentFileId) {
      // 先保存文件内容到 store
      useFileSystemStore.setState((state) => ({
        files: state.files.map(f =>
          f.id === currentFileId
            ? { ...f, content: latestMarkdown, isModified: false, updatedAt: Date.now() }
            : f
        ),
      }))

      // 再保存编辑器状态（断开节点等）
      const { markAsSaved } = useDocumentStore.getState()
      markAsSaved()
    }
  }, []) // 空依赖数组，使用 ref 获取最新状态

  // 监听 Ctrl+S 保存
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
      // 面板切换快捷键
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault()
        useSidebarStore.getState().setActivePanel('files')
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '2') {
        e.preventDefault()
        useSidebarStore.getState().setActivePanel('templates')
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '3') {
        e.preventDefault()
        useSidebarStore.getState().setActivePanel('ai')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  // 处理编辑模板
  const handleEditTemplate = useCallback((content: string, templateName: string, templateId: string) => {
    // 清除当前文件ID，避免文件切换useEffect覆盖模板内容
    useFileSystemStore.setState({ currentFileId: null })

    // 设置正在编辑的模板ID（用于自动保存状态跟踪）
    useTemplateStore.setState({
      editingTemplateId: templateId,
      isTemplateModified: false,
    })

    // 直接进入模板编辑模式，不创建文件
    // 先清空当前文档，确保重新加载
    loadDocument('', 'temp')
    // 使用 setTimeout 确保状态更新后再加载新内容
    setTimeout(() => {
      loadDocument(content, templateName)
      setTemplateEditMode({ isActive: true, content, templateName, templateId })
    }, 0)
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
  const leftPanelWidth = isPanelExpanded ? 48 + panelWidth : 48

  return (
    <div className="flex h-screen flex-col" style={{ backgroundColor: safeThemeConfig.background }}>
      {/* 工具栏 */}
      <EditorToolbar
        onToggleRight={() => setRightCollapsed(!rightCollapsed)}
        rightCollapsed={rightCollapsed}
        onSearch={() => setSearchDialogOpen(true)}
      />

      {/* 搜索对话框 */}
      <SearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
      />

      {/* 主内容区 */}
      <div className="relative flex flex-1 overflow-hidden">
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
        <div
          className="absolute inset-y-0"
          style={{
            left: leftPanelWidth,
            right: rightCollapsed ? 0 : 480,
            backgroundColor: safeThemeConfig.background,
            transition: 'left 0.3s ease, right 0.3s ease',
          }}
        >
          {(() => {
            const showEmptyView = !activeTabId || (activeTab?.isNew && !activeTab?.content?.trim())
            return showEmptyView ? (
              <EmptyTabView tabId={activeTabId || 'blank'} onOpenSearch={() => setSearchDialogOpen(true)} />
            ) : (
              <ReactFlowProvider>
                <FlowCanvas />
              </ReactFlowProvider>
            )
          })()}
        </div>

        {/* 右侧面板 - 预览 */}
        <div
          className={`absolute right-0 top-0 bottom-0 border-l transition-all duration-300 ${
            rightCollapsed ? 'w-0 overflow-hidden opacity-0' : 'w-[480px] opacity-100'
          }`}
          style={{
            backgroundColor: safeThemeConfig.card,
            borderColor: safeThemeConfig.border,
          }}
        >
          {/* 右侧面板收起按钮 */}
          {!rightCollapsed && (
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
          )}

          {/* 右侧内容 - Markdown预览 */}
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-auto">
              <MarkdownPreview />
            </div>
          </div>
        </div>

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

// 添加缺失的导入
import { toast } from '@/hooks/use-toast'
