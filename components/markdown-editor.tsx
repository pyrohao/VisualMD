'use client'

/**
 * Markdown编辑器主组件
 *
 * 整合所有子组件的主编辑器界面
 * 布局：三栏式（文件管理 | 可视化画布 | 预览）
 *
 * 对应技术文档6.1节 - 主编辑器组件
 */

import { useState, useEffect, useCallback } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { EditorToolbar } from './editor-toolbar'
import { FileSidebar } from './file-sidebar'
import { FlowCanvas } from './flow-canvas'
import { MarkdownPreview } from './markdown-preview'
import { NodeEditPanel } from './node-edit-panel'
import { Button } from './ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { initTheme, useThemeStore, themeConfigs } from '@/stores/themeStore'

/**
 * 默认示例Markdown内容
 */
const defaultMarkdown = `---
name: Markdown Visual Editor
description: A visual editor for markdown documents
author: AI Assistant
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

### Front Matter支持

文档元数据使用YAML Front Matter格式定义。

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
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  // 客户端挂载状态，用于避免 hydration 不匹配
  const [mounted, setMounted] = useState(false)

  // 获取Store
  const { loadDocument, document, selectedNodeId, getCurrentMarkdown, getIsModified } = useDocumentStore()
  const { currentFileId, files, saveFile, markFileAsSaved } = useFileSystemStore()
  const currentMarkdown = getCurrentMarkdown()
  const isModified = getIsModified()
  
  // 计算当前文件
  const currentFile = files.find(f => f.id === currentFileId) || null

  // 获取主题配置
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()

  // 初始化加载
  useEffect(() => {
    setMounted(true)
    initTheme()
  }, [])

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
    if (currentFile) {
      loadDocument(currentFile.content, currentFile.name)
    }
  }, [currentFileId, loadDocument])

  // 当文档内容变化时，保存到文件系统
  useEffect(() => {
    if (currentFile && isModified) {
      const timeoutId = setTimeout(() => {
        saveFile(currentFile.id, currentMarkdown)
      }, 1000) // 防抖 1 秒
      return () => clearTimeout(timeoutId)
    }
  }, [currentMarkdown, currentFile, isModified, saveFile])

  // 处理保存
  const handleSave = useCallback(() => {
    if (currentFile) {
      saveFile(currentFile.id, currentMarkdown)
      markFileAsSaved(currentFile.id)
    }
  }, [currentFile, currentMarkdown, saveFile, markFileAsSaved])

  // 监听 Ctrl+S 保存
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  // 服务端渲染时使用默认 light 主题，避免 hydration 不匹配
  const safeThemeConfig = mounted ? themeConfig : themeConfigs.light

  return (
    <div className="flex h-screen flex-col" style={{ backgroundColor: safeThemeConfig.background }}>
      {/* 工具栏 */}
      <EditorToolbar
        onToggleLeft={() => setLeftCollapsed(!leftCollapsed)}
        onToggleRight={() => setRightCollapsed(!rightCollapsed)}
        leftCollapsed={leftCollapsed}
        rightCollapsed={rightCollapsed}
        onSave={handleSave}
      />

      {/* 主内容区 */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* 左侧面板 - 文件管理 */}
        <div
          className={`relative border-r transition-all duration-300 ${
            leftCollapsed ? 'w-0 overflow-hidden opacity-0' : 'w-64 opacity-100'
          }`}
          style={{
            backgroundColor: safeThemeConfig.card,
            borderColor: safeThemeConfig.border,
            flexShrink: 0,
          }}
        >
          <FileSidebar />

          {/* 左侧面板收起按钮 */}
          {!leftCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute -right-3 top-1/2 z-20 h-8 w-6 -translate-y-1/2 rounded-l-none rounded-r-md border p-0 shadow-sm transition-all hover:shadow-md"
              style={{
                backgroundColor: safeThemeConfig.card,
                borderColor: safeThemeConfig.border,
                color: safeThemeConfig.text,
              }}
              onClick={() => setLeftCollapsed(true)}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* 左侧面板展开按钮 */}
        {leftCollapsed && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-0 top-1/2 z-20 h-8 w-5 -translate-y-1/2 rounded-l-none rounded-r-md border p-0 shadow-sm transition-all hover:shadow-md"
            style={{
              backgroundColor: safeThemeConfig.card,
              borderColor: safeThemeConfig.border,
              color: safeThemeConfig.text,
            }}
            onClick={() => setLeftCollapsed(false)}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        )}

        {/* 中间面板 - React Flow画布 */}
        <div
          className="absolute inset-y-0"
          style={{
            left: leftCollapsed ? 0 : 256,
            right: rightCollapsed ? 0 : 480,
            backgroundColor: safeThemeConfig.background,
            transition: 'left 0.3s ease, right 0.3s ease',
          }}
        >
          <ReactFlowProvider>
            <FlowCanvas />
          </ReactFlowProvider>
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
