'use client'

/**
 * 全局搜索对话框
 *
 * 搜索文件和模板内容
 */

import { useState, useMemo, useEffect } from 'react'
import { Search, FileText, LayoutTemplate, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useTabsStore } from '@/stores/tabsStore'
import { cn } from '@/lib/utils'

interface SearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const { templates } = useSidebarStore()
  const { files, openFile } = useFileSystemStore()
  const { getThemeConfig } = useThemeStore()
  const { activeTabId, getActiveTab, openFileInCurrentTab, openFileInTab } = useTabsStore()
  const [mounted, setMounted] = useState(false)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light

  useEffect(() => {
    setMounted(true)
  }, [])

  const [searchQuery, setSearchQuery] = useState('')

  // 搜索结果
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []

    const query = searchQuery.toLowerCase()
    const results: Array<{
      id: string
      type: 'file' | 'template'
      name: string
      preview: string
    }> = []

    // 搜索文件
    files.forEach((file) => {
      if (
        file.name.toLowerCase().includes(query) ||
        file.content.toLowerCase().includes(query)
      ) {
        const contentPreview = file.content
          .toLowerCase()
          .includes(query)
          ? file.content
          : ''
        results.push({
          id: file.id,
          type: 'file',
          name: file.name,
          preview: contentPreview.slice(0, 100) + '...',
        })
      }
    })

    // 搜索模板
    templates.forEach((template) => {
      if (
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.content.toLowerCase().includes(query)
      ) {
        const contentPreview = template.content
          .toLowerCase()
          .includes(query)
          ? template.content
          : template.description
        results.push({
          id: template.id,
          type: 'template',
          name: template.name,
          preview: contentPreview.slice(0, 100) + '...',
        })
      }
    })

    return results.slice(0, 20) // 限制结果数量
  }, [searchQuery, files, templates])

  const handleResultClick = (result: { id: string; type: string }) => {
    if (result.type === 'file') {
      const file = files.find((f) => f.id === result.id)
      if (file) {
        const activeTab = getActiveTab()
        // 如果当前是空白标签页，在当前标签打开；否则创建新标签
        if (activeTab?.isNew && !activeTab?.content?.trim()) {
          openFileInCurrentTab(activeTabId!, file.name, file.content, file.id)
        } else {
          openFileInTab(file.name, file.content, file.id)
        }
        openFile(result.id)
      }
      onOpenChange(false)
    }
    // 模板点击可以切换到模板面板并选中
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[600px] p-0 gap-0 overflow-hidden"
        style={{
          backgroundColor: themeConfig.card,
          borderColor: themeConfig.border,
        }}
      >
        {/* 搜索头部 */}
        <DialogHeader className="p-4 pb-0">
          <DialogTitle
            className="flex items-center gap-2 text-lg"
            style={{ color: themeConfig.text }}
          >
            <Search className="w-5 h-5" style={{ color: themeConfig.primary }} />
            全局搜索
          </DialogTitle>
        </DialogHeader>

        {/* 搜索输入 */}
        <div className="p-4">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: themeConfig.textMuted }}
            />
            <Input
              placeholder="搜索文件和模板..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9 h-10 text-sm"
              style={{
                backgroundColor: themeConfig.background,
                borderColor: themeConfig.border,
                color: themeConfig.text,
              }}
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: themeConfig.textMuted }}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 搜索结果 */}
        <div
          className="max-h-[400px] overflow-y-auto px-4 pb-4"
          style={{ backgroundColor: themeConfig.background }}
        >
          {!searchQuery.trim() ? (
            <div
              className="flex flex-col items-center justify-center h-32 text-center"
              style={{ color: themeConfig.textMuted }}
            >
              <Search className="w-10 h-10 mb-3 opacity-50" />
              <span className="text-sm">输入关键词开始搜索</span>
              <span className="text-xs mt-1 opacity-70">
                支持搜索文件和模板内容
              </span>
            </div>
          ) : searchResults.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center h-32 text-center"
              style={{ color: themeConfig.textMuted }}
            >
              <Search className="w-10 h-10 mb-3 opacity-50" />
              <span className="text-sm">未找到匹配结果</span>
            </div>
          ) : (
            <div className="space-y-2 py-2">
              <div
                className="text-xs px-2 py-1 sticky top-0"
                style={{
                  color: themeConfig.textMuted,
                  backgroundColor: themeConfig.background,
                }}
              >
                找到 {searchResults.length} 个结果
              </div>
              <AnimatePresence>
                {searchResults.map((result) => (
                  <motion.div
                    key={`${result.type}-${result.id}`}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={cn(
                      'p-3 rounded-lg border cursor-pointer transition-all duration-200',
                      'hover:shadow-md'
                    )}
                    style={{
                      backgroundColor: themeConfig.card,
                      borderColor: themeConfig.border,
                    }}
                    onClick={() => handleResultClick(result)}
                  >
                    <div className="flex items-start gap-3">
                      {result.type === 'file' ? (
                        <FileText
                          className="w-4 h-4 mt-0.5 flex-shrink-0"
                          style={{ color: themeConfig.primary }}
                        />
                      ) : (
                        <LayoutTemplate
                          className="w-4 h-4 mt-0.5 flex-shrink-0"
                          style={{ color: themeConfig.accent }}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm font-medium truncate"
                          style={{ color: themeConfig.text }}
                        >
                          {result.name}
                        </div>
                        <div
                          className="text-xs mt-1 line-clamp-2"
                          style={{ color: themeConfig.textMuted }}
                        >
                          {result.preview}
                        </div>
                        <div
                          className="text-[10px] mt-1 uppercase"
                          style={{ color: themeConfig.muted }}
                        >
                          {result.type === 'file' ? '文件' : '模板'}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
