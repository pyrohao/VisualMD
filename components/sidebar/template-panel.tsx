'use client'

/**
 * 模板面板组件
 *
 * 展示所有可用模板，支持筛选、右键操作
 * 支持导入模板和新增模板
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { Plus, LayoutTemplate, Upload, FilePlus } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useThemeStore } from '@/stores/themeStore'
import { TemplateCard } from './template-card'
import { Button } from '@/components/ui/button'
import { toast } from '@/hooks/use-toast'
import { DeleteConfirmDialog } from '@/components/delete-confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface TemplatePanelProps {
  onEditTemplate?: (content: string, templateName: string, templateId: string) => void
  onPreviewTemplate?: (content: string, templateName: string) => void
}

export function TemplatePanel({ onEditTemplate, onPreviewTemplate }: TemplatePanelProps) {
  const {
    templates,
    selectedTemplateId,
    selectTemplate,
    loadBuiltInTemplates,
    deleteTemplate,
    getTemplateContent,
    addTemplate,
    updateTemplate,
    editingTemplateId,
    isTemplateModified,
    setEditingTemplate,
    markTemplateAsSaved,
    setActivePanel,
  } = useSidebarStore()
  const { createFile, importFile, files } = useFileSystemStore()
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()

  const [isLoading, setIsLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 删除确认对话框状态
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null)

  // 加载内置模板
  useEffect(() => {
    const loadTemplates = async () => {
      setIsLoading(true)
      await loadBuiltInTemplates()
      setIsLoading(false)
    }
    loadTemplates()
  }, [loadBuiltInTemplates])

  // 生成唯一的文件名
  const generateUniqueFileName = useCallback(
    (baseName: string) => {
      let index = 1
      let fileName = `${baseName}-${index}.md`

      while (files.some((f) => f.name === fileName)) {
        index++
        fileName = `${baseName}-${index}.md`
      }

      return fileName
    },
    [files]
  )

  // 使用模板
  const handleUseTemplate = useCallback(
    (templateId: string) => {
      const content = getTemplateContent(templateId)
      if (!content) {
        toast({
          title: '错误',
          description: '无法加载模板内容',
          variant: 'destructive',
        })
        return
      }

      const template = templates.find((t) => t.id === templateId)
      const baseName = template?.name || '模板'
      const fileName = generateUniqueFileName(baseName)

      // 使用 importFile 直接创建带模板内容的文件
      importFile(fileName, content, null)

      // 切换到文件面板
      setActivePanel('files')

      toast({
        title: '模板已应用',
        description: `已创建文件：${fileName}`,
      })
    },
    [getTemplateContent, templates, generateUniqueFileName, importFile, setActivePanel]
  )

  // 编辑模板
  const handleEditTemplate = useCallback(
    (templateId: string) => {
      // 直接从 store 获取最新内容，避免闭包问题
      const { templates: latestTemplates } = useSidebarStore.getState()
      const template = latestTemplates.find((t) => t.id === templateId)
      const content = template?.content || null
      
      console.log('[template-panel] handleEditTemplate:', { templateId, contentLength: content?.length, templateFound: !!template })
      if (!content || !template) return

      if (onEditTemplate) {
        console.log('[template-panel] 调用 onEditTemplate:', { templateName: template.name, templateId, contentLength: content.length })
        onEditTemplate(content, template.name, templateId)
      }
    },
    [onEditTemplate]
  )

  // 点击模板 - 直接进入编辑模式
  const handleSelectTemplate = useCallback(
    (templateId: string) => {
      selectTemplate(templateId)
      
      // 直接从 store 获取最新内容，避免闭包问题
      const { templates: latestTemplates } = useSidebarStore.getState()
      const template = latestTemplates.find((t) => t.id === templateId)
      const content = template?.content || null
      
      // 点击直接进入编辑模式，而不是预览
      if (content && onEditTemplate && template) {
        onEditTemplate(content, template.name, templateId)
      }
    },
    [selectTemplate, onEditTemplate]
  )

  // 打开删除确认对话框
  const handleDeleteClick = useCallback(
    (templateId: string) => {
      // 允许删除所有模板（包括内置模板）
      setTemplateToDelete(templateId)
      setDeleteDialogOpen(true)
    },
    []
  )

  // 确认删除模板
  const handleConfirmDelete = useCallback(() => {
    if (templateToDelete) {
      const template = templates.find((t) => t.id === templateToDelete)
      deleteTemplate(templateToDelete)
      toast({
        title: '模板已删除',
        description: `模板"${template?.name}"已被删除`,
      })
      setTemplateToDelete(null)
      setDeleteDialogOpen(false)
    }
  }, [deleteTemplate, templateToDelete, templates])

  // 取消删除
  const handleCancelDelete = useCallback(() => {
    setTemplateToDelete(null)
    setDeleteDialogOpen(false)
  }, [])

  // 导入模板
  const handleImportTemplate = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // 处理文件选择
  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      try {
        const content = await file.text()
        const fileName = file.name.replace('.md', '').replace('.markdown', '')

        // 检查是否是有效的 Markdown 文件
        if (!file.name.endsWith('.md') && !file.name.endsWith('.markdown')) {
          toast({
            title: '格式错误',
            description: '请选择 Markdown 文件 (.md 或 .markdown)',
            variant: 'destructive',
          })
          return
        }

        addTemplate({
          name: fileName,
          description: `从文件导入的模板：${file.name}`,
          content,
        })

        toast({
          title: '模板导入成功',
          description: `已导入模板：${fileName}`,
        })
      } catch (error) {
        toast({
          title: '导入失败',
          description: '无法读取文件内容',
          variant: 'destructive',
        })
      }

      // 重置 input
      e.target.value = ''
    },
    [addTemplate]
  )

  // 新建空白模板
  const handleCreateNewTemplate = useCallback(() => {
    const defaultTemplateContent = `---
name: 新模板
description: 模板描述
---

# 新模板

在这里编辑你的模板内容...
`
    addTemplate({
      name: '新模板',
      description: '自定义模板',
      content: defaultTemplateContent,
    })

    toast({
      title: '模板创建成功',
      description: '已创建新模板，右键点击编辑内容',
    })
  }, [addTemplate])

  // 获取要删除的模板信息
  const templateToDeleteInfo = templateToDelete
    ? templates.find((t) => t.id === templateToDelete)
    : null

  return (
    <div
      className="h-full flex flex-col"
      style={{ backgroundColor: themeConfig.sidebar }}
    >
      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={templateToDeleteInfo?.name || ''}
        title="确认删除模板"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      {/* 头部 */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: themeConfig.border }}
      >
        <div className="flex items-center gap-2">
          <LayoutTemplate
            className="w-5 h-5"
            style={{ color: themeConfig.primary }}
          />
          <span
            className="font-medium"
            style={{ color: themeConfig.text }}
          >
            模板库
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: themeConfig.primary + '20',
              color: themeConfig.primary,
            }}
          >
            {templates.length}
          </span>
          {/* 新增模板按钮 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1.5 rounded hover:bg-white/10 transition-colors"
                title="新增模板"
              >
                <Plus className="w-4 h-4" style={{ color: themeConfig.primary }} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={handleCreateNewTemplate} className="gap-2">
                <FilePlus className="w-4 h-4" />
                <span>新建空白模板</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleImportTemplate} className="gap-2">
                <Upload className="w-4 h-4" />
                <span>导入模板文件</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* 模板列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div
            className="flex items-center justify-center h-32"
            style={{ color: themeConfig.textMuted }}
          >
            <span className="text-sm">加载模板中...</span>
          </div>
        ) : templates.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center h-32 text-center"
            style={{ color: themeConfig.textMuted }}
          >
            <LayoutTemplate className="w-8 h-8 mb-2 opacity-50" />
            <span className="text-sm mb-1">暂无模板</span>
            <div className="flex flex-col gap-2 mt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCreateNewTemplate}
                className="text-xs"
              >
                <FilePlus className="w-3 h-3 mr-1" />
                新建模板
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleImportTemplate}
                className="text-xs"
              >
                <Upload className="w-3 h-3 mr-1" />
                导入模板
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            <AnimatePresence mode="popLayout">
              {templates.map((template) => (
                <motion.div
                  key={template.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <TemplateCard
                    template={template}
                    isSelected={selectedTemplateId === template.id}
                    isModified={editingTemplateId === template.id && isTemplateModified}
                    onSelect={() => handleSelectTemplate(template.id)}
                    onUse={() => handleUseTemplate(template.id)}
                    onDelete={() => handleDeleteClick(template.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* 底部提示 */}
      <div
        className="px-4 py-2 border-t text-xs text-center"
        style={{
          borderColor: themeConfig.border,
          color: themeConfig.textMuted,
        }}
      >
        右键点击模板查看更多选项
      </div>
    </div>
  )
}
