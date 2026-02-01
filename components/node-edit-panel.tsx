'use client'

/**
 * 节点编辑面板组件 - 现代简约风格
 *
 * 从右侧滑出的面板，用于编辑选中节点的标题和内容
 * 采用现代简约设计，更大的编辑区域，固定的内容展示框
 *
 * 功能：
 * 1. 点击节点后从右侧滑出
 * 2. 显示节点标题编辑区域
 * 3. 显示节点内容编辑区域（固定高度，独立滚动）
 * 4. 保存或取消编辑
 * 5. 现代简约UI风格
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { X, Save, Trash2, Type, FileText, Info, FileJson, Plus, Trash } from 'lucide-react'
import { Button } from './ui/button'
import { useDocumentStore } from '@/stores/documentStore'
import { useThemeStore } from '@/stores/themeStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { ScrollArea } from './ui/scroll-area'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { findNodeInTree } from '@/lib/flow-helpers'
import { toast } from '@/hooks/use-toast'
import { ConfirmDialog } from './ui/confirm-dialog'

export function NodeEditPanel() {
  const {
    document,
    selectedNodeId,
    selectNode,
    updateNode,
    deleteNode,
    updateMetadata,
    markAsSaved
  } = useDocumentStore()

  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()
  const { markFileAsSaved, currentFileId, markFileAsModified } = useFileSystemStore()
  const { editingTemplateId, isTemplateModified, markTemplateAsSaved } = useSidebarStore()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [isVisible, setIsVisible] = useState(false)
  
  // YAML 元数据编辑状态
  const [metadataEntries, setMetadataEntries] = useState<{key: string, value: string}[]>([])
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  
  // 确认对话框状态
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // 获取当前选中的节点
  const selectedNode = selectedNodeId && document
    ? findNodeInTree(document.root, selectedNodeId)
    : null
  
  // 是否为虚拟根节点
  const isVirtualRoot = selectedNode?.isVirtual || selectedNode?.level === 0

  // 当选择节点变化时，加载节点数据
  useEffect(() => {
    if (selectedNode) {
      setTitle(selectedNode.title)
      setContent(selectedNode.content || '')
      
      // 加载 YAML 元数据
      if (document?.metadata) {
        const entries = Object.entries(document.metadata).map(([key, value]) => ({
          key,
          value: String(value)
        }))
        setMetadataEntries(entries)
      } else {
        setMetadataEntries([])
      }
      
      setIsVisible(true)
    } else {
      setIsVisible(false)
    }
  }, [selectedNodeId, selectedNode, document?.metadata])

  // 自动保存的定时器引用
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  // 使用 ref 存储最新的 metadataEntries，避免循环依赖
  const metadataEntriesRef = useRef(metadataEntries)
  metadataEntriesRef.current = metadataEntries

  // 执行保存
  const doSave = useCallback(() => {
    if (!selectedNodeId) return

    // 虚拟根节点保存元数据
    if (isVirtualRoot) {
      const metadata: Record<string, string> = {}
      metadataEntriesRef.current.forEach(({ key, value }) => {
        if (key.trim()) {
          metadata[key.trim()] = value
        }
      })
      updateMetadata(metadata)
      updateNode(selectedNodeId, { title: String(title || '').trim() || '未命名文档' })
      
      // 同步更新文件系统中的文件名（如果标题变化）
      const newTitle = String(title || '').trim() || '未命名文档'
      if (currentFileId) {
        const { files } = useFileSystemStore.getState()
        const currentFile = files.find(f => f.id === currentFileId)
        if (currentFile) {
          // 提取当前文件名（去掉 .md 后缀）
          const currentNameWithoutExt = currentFile.name.replace(/\.md$/, '')
          // 只有当标题真正改变时才更新文件名
          if (currentNameWithoutExt !== newTitle) {
            const newFileName = newTitle.endsWith('.md') ? newTitle : `${newTitle}.md`
            useFileSystemStore.setState((state) => ({
              files: state.files.map(f =>
                f.id === currentFileId
                  ? { ...f, name: newFileName, updatedAt: Date.now() }
                  : f
              ),
            }))
          }
        }
      }
    } else {
      // 普通节点保存
      const trimmedTitle = String(title || '').trim()
      if (trimmedTitle) {
        updateNode(selectedNodeId, { title: trimmedTitle, content: content || undefined })
      }
    }

    // 标记为已保存
    markAsSaved()

    // 同时保存到文件系统或模板 - 获取最新的 markdown 内容并保存
    const { getCurrentMarkdown } = useDocumentStore.getState()
    const latestContent = getCurrentMarkdown()
    const { currentFileId: latestFileId } = useFileSystemStore.getState()
    const { editingTemplateId: latestEditingTemplateId } = useSidebarStore.getState()

    if (latestFileId) {
      // 保存到文件
      useFileSystemStore.setState((state) => ({
        files: state.files.map(f =>
          f.id === latestFileId
            ? { ...f, content: latestContent, isModified: false, updatedAt: Date.now() }
            : f
        ),
      }))
    } else if (latestEditingTemplateId) {
      // 保存到模板
      useSidebarStore.setState((state) => ({
        templates: state.templates.map(t =>
          t.id === latestEditingTemplateId
            ? { ...t, content: latestContent, updatedAt: Date.now() }
            : t
        ),
        isTemplateModified: false,
      }))
    }
  }, [selectedNodeId, title, content, updateNode, isVirtualRoot, updateMetadata, markAsSaved])

  // 使用 ref 追踪上一次的值，用于比较是否真的发生了变化
  const prevTitleRef = useRef(title)
  const prevContentRef = useRef(content)
  const prevMetadataRef = useRef(metadataEntries)
  const prevNodeIdRef = useRef(selectedNodeId)
  
  // 自动保存 - 当输入内容变化时延迟保存
  useEffect(() => {
    if (!selectedNodeId) return

    // 如果切换了节点，重置 ref 并跳过本次检查
    if (selectedNodeId !== prevNodeIdRef.current) {
      prevNodeIdRef.current = selectedNodeId
      prevTitleRef.current = title
      prevContentRef.current = content
      prevMetadataRef.current = metadataEntries
      return
    }

    // 检查内容是否真的发生了变化
    const titleChanged = title !== prevTitleRef.current
    const contentChanged = content !== prevContentRef.current
    const metadataChanged = JSON.stringify(metadataEntries) !== JSON.stringify(prevMetadataRef.current)
    
    // 更新 ref
    prevTitleRef.current = title
    prevContentRef.current = content
    prevMetadataRef.current = metadataEntries
    
    // 如果没有变化，不触发保存
    if (!titleChanged && !contentChanged && !metadataChanged) {
      return
    }

    // 标记文件为已修改（显示左侧边栏的未保存标记）
    if (currentFileId) {
      markFileAsModified(currentFileId)
    }

    // 清除之前的定时器
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    // 设置新的定时器，800ms 后自动保存
    autoSaveTimerRef.current = setTimeout(() => {
      doSave()
    }, 800)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [title, content, metadataEntries, selectedNodeId, doSave, currentFileId, markFileAsModified])

  // 组件卸载时立即保存
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
        doSave()
      }
    }
  }, [])

  // 手动保存（用于保存按钮）
  const handleSave = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }
    doSave()
    toast({
      title: '已保存',
      description: '节点内容已更新',
    })
  }, [doSave])
  
  // 添加元数据字段
  const handleAddMetadata = useCallback(() => {
    if (newKey.trim()) {
      setMetadataEntries([...metadataEntries, { key: newKey.trim(), value: newValue }])
      setNewKey('')
      setNewValue('')
    }
  }, [newKey, newValue, metadataEntries])
  
  // 更新元数据字段
  const handleUpdateMetadata = useCallback((index: number, key: string, value: string) => {
    const updated = [...metadataEntries]
    updated[index] = { key, value }
    setMetadataEntries(updated)
  }, [metadataEntries])
  
  // 删除元数据字段
  const handleDeleteMetadata = useCallback((index: number) => {
    setMetadataEntries(metadataEntries.filter((_, i) => i !== index))
  }, [metadataEntries])

  // 删除节点
  const handleDelete = useCallback(() => {
    setShowDeleteConfirm(true)
  }, [])
  
  // 确认删除
  const handleConfirmDelete = useCallback(() => {
    if (selectedNodeId) {
      deleteNode(selectedNodeId)
      selectNode(null)
      toast({
        title: '节点已删除',
      })
    }
  }, [selectedNodeId, deleteNode, selectNode])

  // 关闭面板
  const handleClose = useCallback(() => {
    selectNode(null)
  }, [selectNode])

  // 如果没有选中节点，不显示面板
  if (!isVisible || !selectedNode) {
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
        {/* 头部 - 现代简约风格 */}
        <div
          className="flex h-16 items-center justify-between px-6 border-b"
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
              <h2
                className="text-base font-semibold"
                style={{ color: themeConfig.heading }}
              >
                {isVirtualRoot ? '文档属性' : '编辑节点'}
              </h2>
              <p className="text-xs" style={{ color: themeConfig.muted }}>
                {isVirtualRoot ? 'YAML Front Matter' : `H${selectedNode.level} 标题`}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{
              color: themeConfig.muted,
            }}
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
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-6">
            {/* 标题编辑 */}
            <div className="space-y-3">
              <label
                className="flex items-center gap-2 text-sm font-medium"
                style={{ color: themeConfig.heading }}
              >
                <Type className="w-4 h-4" style={{ color: isVirtualRoot ? '#8b5cf6' : themeConfig.accent }} />
                {isVirtualRoot ? '文档名称' : '标题'}
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isVirtualRoot ? "输入文档名称..." : "输入节点标题..."}
                className="h-12 text-base border-2 transition-all duration-200"
                style={{
                  backgroundColor: themeConfig.card,
                  borderColor: themeConfig.border,
                  color: themeConfig.text,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = isVirtualRoot ? '#8b5cf6' : themeConfig.accent
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${isVirtualRoot ? '#8b5cf620' : themeConfig.accent + '20'}`
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = themeConfig.border
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>

            {isVirtualRoot ? (
              /* YAML 元数据编辑区域 */
              <div className="space-y-4">
                <label
                  className="flex items-center gap-2 text-sm font-medium"
                  style={{ color: themeConfig.heading }}
                >
                  <FileJson className="w-4 h-4" style={{ color: '#8b5cf6' }} />
                  YAML 元数据
                </label>
                
                {/* 现有元数据列表 */}
                <div className="space-y-2">
                  {metadataEntries.map((entry, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={entry.key}
                        onChange={(e) => handleUpdateMetadata(index, e.target.value, entry.value)}
                        placeholder="键"
                        className="flex-1 h-10 text-sm border-2"
                        style={{
                          backgroundColor: themeConfig.card,
                          borderColor: themeConfig.border,
                          color: themeConfig.text,
                        }}
                      />
                      <span style={{ color: themeConfig.muted }}>:</span>
                      <Input
                        value={entry.value}
                        onChange={(e) => handleUpdateMetadata(index, entry.key, e.target.value)}
                        placeholder="值"
                        className="flex-[2] h-10 text-sm border-2"
                        style={{
                          backgroundColor: themeConfig.card,
                          borderColor: themeConfig.border,
                          color: themeConfig.text,
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteMetadata(index)}
                        className="h-10 w-10 shrink-0"
                        style={{ color: themeConfig.danger }}
                      >
                        <Trash className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                
                {/* 添加新元数据 */}
                <div className="flex items-center gap-2 pt-2 border-t" style={{ borderColor: themeConfig.border }}>
                  <Input
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    placeholder="新键"
                    className="flex-1 h-10 text-sm border-2"
                    style={{
                      backgroundColor: themeConfig.card,
                      borderColor: themeConfig.border,
                      color: themeConfig.text,
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newKey.trim()) {
                        handleAddMetadata()
                      }
                    }}
                  />
                  <span style={{ color: themeConfig.muted }}>:</span>
                  <Input
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    placeholder="值"
                    className="flex-[2] h-10 text-sm border-2"
                    style={{
                      backgroundColor: themeConfig.card,
                      borderColor: themeConfig.border,
                      color: themeConfig.text,
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newKey.trim()) {
                        handleAddMetadata()
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleAddMetadata}
                    disabled={!newKey.trim()}
                    className="h-10 w-10 shrink-0"
                    style={{ 
                      borderColor: '#8b5cf6',
                      color: '#8b5cf6',
                      opacity: newKey.trim() ? 1 : 0.5
                    }}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                
                <p className="text-xs flex items-center gap-1" style={{ color: themeConfig.muted }}>
                  <Info className="w-3 h-3" />
                  这些元数据将保存为 YAML Front Matter 格式
                </p>
              </div>
            ) : (
              /* 普通节点的内容编辑 */
              <div className="space-y-3">
                <label
                  className="flex items-center gap-2 text-sm font-medium"
                  style={{ color: themeConfig.heading }}
                >
                  <FileText className="w-4 h-4" style={{ color: themeConfig.accent }} />
                  内容
                </label>
                {/* 固定高度的内容编辑框 */}
                <div
                  className="rounded-xl border-2 overflow-hidden transition-all duration-200"
                  style={{
                    backgroundColor: themeConfig.card,
                    borderColor: themeConfig.border,
                    height: '360px',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = themeConfig.accent
                    e.currentTarget.style.boxShadow = `0 0 0 3px ${themeConfig.accent}20`
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = themeConfig.border
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="输入节点内容（可选）...\n\n支持 Markdown 格式"
                    className="w-full h-full resize-none border-0 font-mono text-sm leading-relaxed p-4 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                    style={{
                      backgroundColor: 'transparent',
                      color: themeConfig.text,
                    }}
                  />
                </div>
                <p className="text-xs flex items-center gap-1" style={{ color: themeConfig.muted }}>
                  <Info className="w-3 h-3" />
                  支持 Markdown 格式，内容将显示在节点下方
                </p>
              </div>
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
        </ScrollArea>

        {/* 底部操作栏 - 现代风格按钮 */}
        <div
          className="border-t px-6 py-5"
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
          }}
        >
          <div className="flex gap-3">
            {/* 保存按钮 */}
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
            {/* 取消按钮 */}
            <Button
              variant="outline"
              onClick={handleClose}
              className="flex-1 h-11 text-sm font-medium transition-all duration-200"
              style={{
                backgroundColor: themeConfig.buttonSecondaryBg,
                borderColor: themeConfig.border,
                color: themeConfig.text,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = themeConfig.hover
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = themeConfig.buttonSecondaryBg
              }}
            >
              取消
            </Button>
            {/* 删除按钮 */}
            <Button
              variant="outline"
              onClick={handleDelete}
              className="h-11 w-11 p-0 transition-all duration-200"
              style={{
                backgroundColor: 'transparent',
                borderColor: themeConfig.danger,
                color: themeConfig.danger,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = themeConfig.danger
                e.currentTarget.style.color = themeConfig.buttonText
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = themeConfig.danger
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* 删除确认对话框 */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleConfirmDelete}
        title="删除节点"
        description="确定要删除这个节点吗？此操作不可撤销。"
        confirmText="删除"
        cancelText="取消"
        variant="destructive"
      />
    </div>
  )
}

export default NodeEditPanel
