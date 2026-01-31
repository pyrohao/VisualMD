'use client'

/**
 * Markdown编辑器主组件
 *
 * 整合所有子组件的主编辑器界面
 * 布局：三栏式（大纲视图 | 可视化画布 | 文档预览）
 *
 * 对应技术文档6.1节 - 主编辑器组件
 */

import { useState, useEffect } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { EditorToolbar } from './editor-toolbar'
import { TreeView } from './tree-view'
import { FlowCanvas } from './flow-canvas'
import { MarkdownPreview } from './markdown-preview'
import { NodeEditPanel } from './node-edit-panel'
import { Button } from './ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useDocumentStore } from '@/stores/documentStore'
import { initTheme } from '@/stores/themeStore'

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

  // 获取Store中的加载文档方法
  const { loadDocument, document, selectedNodeId } = useDocumentStore()

  // 初始化加载默认文档和主题
  useEffect(() => {
    // 初始化主题
    initTheme()

    if (!document) {
      loadDocument(defaultMarkdown, 'example.md')
    }
  }, [document, loadDocument])

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* 工具栏 */}
      <EditorToolbar
        onToggleLeft={() => setLeftCollapsed(!leftCollapsed)}
        onToggleRight={() => setRightCollapsed(!rightCollapsed)}
        leftCollapsed={leftCollapsed}
        rightCollapsed={rightCollapsed}
      />

      {/* 主内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧面板 - 大纲视图 */}
        <div
          className={`border-r border-slate-200 bg-white transition-all duration-300 ${
            leftCollapsed ? 'w-0 overflow-hidden' : 'w-80'
          }`}
        >
          <TreeView />
        </div>

        {/* 左侧面板收起按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute left-0 top-1/2 z-10 h-12 w-6 -translate-y-1/2 rounded-l-none rounded-r-md border border-l-0 border-slate-200 bg-white hover:bg-slate-100"
          onClick={() => setLeftCollapsed(!leftCollapsed)}
        >
          {leftCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>

        {/* 中间面板 - React Flow画布 */}
        <div className="flex-1 bg-slate-50">
          <ReactFlowProvider>
            <FlowCanvas />
          </ReactFlowProvider>
        </div>

        {/* 右侧面板收起按钮 */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-0 top-1/2 z-10 h-12 w-6 -translate-y-1/2 rounded-l-md rounded-r-none border border-r-0 border-slate-200 bg-white hover:bg-slate-100"
          onClick={() => setRightCollapsed(!rightCollapsed)}
        >
          {rightCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>

        {/* 右侧面板 - 文档预览（全屏） */}
        <div
          className={`border-l border-slate-200 bg-white transition-all duration-300 ${
            rightCollapsed ? 'w-0 overflow-hidden' : 'w-[560px]'
          }`}
        >
          <MarkdownPreview />
        </div>

        {/* 节点编辑面板 - 从右侧滑出 */}
        <NodeEditPanel />
      </div>
    </div>
  )
}

export default MarkdownEditor
