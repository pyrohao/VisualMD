'use client'

/**
 * Markdown预览组件
 *
 * 右侧预览面板，支持预览/编辑模式切换
 * - 预览模式：使用 remark 渲染 Markdown
 * - 编辑模式：直接编辑原始 Markdown 源码
 *
 * 对应技术文档6.1节
 */

import { useDocumentStore } from '@/stores/documentStore'
import { useTabsStore } from '@/stores/tabsStore'
import { useThemeStore, themeConfigs, type ThemeMode } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { useEffect, useState, useCallback, useRef } from 'react'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { BookOpen, Pencil, SplitSquareHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 预览模式类型
 */
type PreviewMode = 'preview' | 'edit' | 'live'

/**
 * 根据主题生成CSS变量样式
 */
function getThemeStyles(theme: ThemeMode): string {
  const config = themeConfigs[theme]
  
  return `
    .markdown-body {
      color: ${config.text};
      font-size: 16px;
      line-height: 1.75;
    }
    .markdown-body h1 {
      color: ${config.heading};
      font-size: 2.25rem;
      font-weight: 700;
      margin-top: 2rem;
      margin-bottom: 1.5rem;
      letter-spacing: -0.025em;
    }
    .markdown-body h2 {
      color: ${config.heading};
      font-size: 1.875rem;
      font-weight: 700;
      margin-top: 2rem;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid ${config.border};
      letter-spacing: -0.025em;
    }
    .markdown-body h3 {
      color: ${config.heading};
      font-size: 1.5rem;
      font-weight: 600;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
      letter-spacing: -0.025em;
    }
    .markdown-body h4 {
      color: ${config.heading};
      font-size: 1.25rem;
      font-weight: 600;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
      letter-spacing: -0.025em;
    }
    .markdown-body h5 {
      color: ${config.heading};
      font-size: 1.125rem;
      font-weight: 600;
      margin-top: 1rem;
      margin-bottom: 0.5rem;
      letter-spacing: -0.025em;
    }
    .markdown-body h6 {
      color: ${config.heading};
      font-size: 1rem;
      font-weight: 600;
      margin-top: 1rem;
      margin-bottom: 0.5rem;
      letter-spacing: -0.025em;
    }
    .markdown-body p {
      margin-bottom: 1.25rem;
      line-height: 1.75;
    }
    .markdown-body strong {
      color: ${config.heading};
      font-weight: 700;
    }
    .markdown-body em {
      color: ${config.muted};
      font-style: italic;
    }
    .markdown-body code {
      background-color: ${config.code};
      color: ${config.heading};
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.875rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .markdown-body pre {
      background-color: ${config.code};
      padding: 1.25rem;
      border-radius: 0.5rem;
      overflow-x: auto;
      margin: 1.5rem 0;
    }
    .markdown-body pre code {
      background-color: transparent;
      color: ${config.text};
      padding: 0;
      font-size: 0.875rem;
      line-height: 1.5;
    }
    .markdown-body a {
      color: ${config.link};
      text-decoration: underline;
      text-underline-offset: 2px;
      font-weight: 500;
    }
    .markdown-body a:hover {
      opacity: 0.8;
    }
    .markdown-body ul {
      list-style-type: disc;
      padding-left: 1.5rem;
      margin-bottom: 1rem;
    }
    .markdown-body ol {
      list-style-type: decimal;
      padding-left: 1.5rem;
      margin-bottom: 1rem;
    }
    .markdown-body li {
      margin-bottom: 0.25rem;
    }
    .markdown-body blockquote {
      border-left: 4px solid ${config.accent};
      background-color: ${config.code};
      padding: 0.75rem 1.25rem;
      margin: 1.25rem 0;
      font-style: italic;
      border-radius: 0 0.25rem 0.25rem 0;
    }
    .markdown-body hr {
      border: none;
      border-top: 2px solid ${config.border};
      margin: 2rem 0;
    }
    .markdown-body img {
      max-width: 100%;
      height: auto;
      border-radius: 0.5rem;
      margin: 1.5rem 0;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }
    .markdown-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
    }
    .markdown-body th,
    .markdown-body td {
      border: 1px solid ${config.border};
      padding: 0.75rem;
      text-align: left;
    }
    .markdown-body th {
      background-color: ${config.code};
      font-weight: 600;
    }
  `
}

/**
 * 移除 Metadata (YAML Front Matter)
 */
function removeMetadata(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, '')
}

export function MarkdownPreview() {
  const { document, updateFromMarkdown } = useDocumentStore()
  const activeTabId = useTabsStore((state) => state.activeTabId)
  const { theme, getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  const [mode, setMode] = useState<PreviewMode>('preview')
  const [html, setHtml] = useState('')
  const [editContent, setEditContent] = useState('')
  const liveEditorRef = useRef<HTMLTextAreaElement | null>(null)
  const livePreviewRef = useRef<HTMLDivElement | null>(null)
  const isSyncingLiveScrollRef = useRef(false)
  const previousDocumentKeyRef = useRef<string>('')
  const skipLiveSyncRef = useRef(false)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const { t, currentLanguage } = useTranslation()

  useEffect(() => {
    setMounted(true)
  }, [])

  // 从Store获取当前Markdown
  const markdown = useDocumentStore.getState().getCurrentMarkdown()
  const isEditingMode = mode === 'edit' || mode === 'live'
  const renderMarkdown = mode === 'live' ? editContent : markdown
  const documentKey = `${activeTabId || ''}\u0000${document?.fileId || ''}\u0000${document?.fileName || ''}`

  // 当 markdown 变化时，更新编辑内容
  useEffect(() => {
    if (!isEditingMode) {
      setEditContent(markdown)
    }
  }, [isEditingMode, markdown])

  useEffect(() => {
    if (documentKey === previousDocumentKeyRef.current) {
      return
    }

    previousDocumentKeyRef.current = documentKey
    skipLiveSyncRef.current = true
    setEditContent(markdown)
  }, [documentKey, markdown])

  // 使用 remark 处理 markdown
  useEffect(() => {
    let cancelled = false

    const processMarkdown = async () => {
      const content = removeMetadata(renderMarkdown)
      
      const result = await unified()
        .use(remarkParse)
        .use(remarkGfm) // 支持 GitHub Flavored Markdown
        .use(remarkRehype, { allowDangerousHtml: true })
        .use(rehypeStringify, { allowDangerousHtml: true })
        .process(content)
      
      if (!cancelled) {
        setHtml(String(result))
      }
    }
    
    processMarkdown()

    return () => {
      cancelled = true
    }
  }, [renderMarkdown])

  // 处理模式切换
  const handleModeChange = useCallback((newMode: PreviewMode) => {
    if (newMode === mode) return

    const leavingEditingToPreview = (mode === 'edit' || mode === 'live') && newMode === 'preview'
    if (leavingEditingToPreview) {
      updateFromMarkdown(editContent)
    }

    const enteringEditing = mode === 'preview' && (newMode === 'edit' || newMode === 'live')
    if (enteringEditing) {
      setEditContent(markdown)
    }

    setMode(newMode)
  }, [mode, editContent, markdown, updateFromMarkdown])

  // 处理编辑内容变化
  const handleEditChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value)
  }, [])

  const liveLabels =
    currentLanguage === 'zh'
      ? { short: '实时', mode: '实时模式', title: '实时编辑预览' }
      : { short: 'Live', mode: 'Live mode', title: 'Live Edit & Preview' }

  const syncLiveScrollByRatio = useCallback((source: HTMLElement, target: HTMLElement) => {
    const sourceScrollable = source.scrollHeight - source.clientHeight
    const targetScrollable = target.scrollHeight - target.clientHeight

    if (sourceScrollable <= 0 || targetScrollable <= 0) {
      target.scrollTop = 0
      return
    }

    const progress = source.scrollTop / sourceScrollable
    target.scrollTop = progress * targetScrollable
  }, [])

  const withLiveScrollSyncGuard = useCallback((syncAction: () => void) => {
    if (isSyncingLiveScrollRef.current) {
      return
    }

    isSyncingLiveScrollRef.current = true
    syncAction()
    window.requestAnimationFrame(() => {
      isSyncingLiveScrollRef.current = false
    })
  }, [])

  const handleLiveEditorScroll = useCallback(() => {
    const source = liveEditorRef.current
    const target = livePreviewRef.current
    if (!source || !target || mode !== 'live') {
      return
    }

    withLiveScrollSyncGuard(() => {
      syncLiveScrollByRatio(source, target)
    })
  }, [mode, syncLiveScrollByRatio, withLiveScrollSyncGuard])

  const handleLivePreviewScroll = useCallback(() => {
    const source = livePreviewRef.current
    const target = liveEditorRef.current
    if (!source || !target || mode !== 'live') {
      return
    }

    withLiveScrollSyncGuard(() => {
      syncLiveScrollByRatio(source, target)
    })
  }, [mode, syncLiveScrollByRatio, withLiveScrollSyncGuard])

  useEffect(() => {
    if (mode !== 'live') return
    if (skipLiveSyncRef.current) {
      skipLiveSyncRef.current = false
      return
    }

    const timer = setTimeout(() => {
      if (editContent !== markdown) {
        updateFromMarkdown(editContent)
      }
    }, 180)

    return () => {
      clearTimeout(timer)
    }
  }, [editContent, markdown, mode, updateFromMarkdown])

  // 如果没有文档，显示空状态
  if (!document) {
    return (
      <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.background }}>
        <div className="flex h-14 items-center border-b px-5" style={{ backgroundColor: themeConfig.card, borderColor: themeConfig.border }}>
          <h2 className="text-lg font-semibold" style={{ color: themeConfig.heading }}>{mounted ? t('preview.preview') : '文档预览'}</h2>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p style={{ color: themeConfig.muted }}>{mounted ? t('preview.noContent') : '没有可预览的内容'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.background }}>
      {/* 头部 */}
      <div className="flex h-14 items-center justify-between gap-4 border-b px-5" style={{ backgroundColor: themeConfig.card, borderColor: themeConfig.border }}>
        <div className="flex min-w-0 flex-1 items-center">
          <h2 className="flex-shrink-0 whitespace-nowrap text-lg font-semibold" style={{ color: themeConfig.heading }}>
            {mode === 'preview'
              ? (mounted ? t('preview.preview') : '文档预览')
              : mode === 'edit'
                ? (mounted ? t('preview.edit') : '编辑文档')
                : liveLabels.title}
          </h2>
          <span
            className="ml-3 block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm"
            style={{ color: themeConfig.muted }}
            title={document.fileName || (mounted ? t('file.untitled') : '鏈懡鍚?')}
          >
            {document.fileName || (mounted ? t('file.untitled') : '未命名')}
          </span>
        </div>

        {/* 模式切换按钮 */}
        <div
          className="flex flex-shrink-0 items-center rounded-lg p-1"
          style={{ backgroundColor: themeConfig.background }}
        >
          <button
            onClick={() => handleModeChange('preview')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
              mode === 'preview'
                ? 'shadow-sm'
                : 'hover:opacity-80'
            )}
            style={{
              backgroundColor: mode === 'preview' ? themeConfig.card : 'transparent',
              color: mode === 'preview' ? themeConfig.heading : themeConfig.muted,
            }}
            title={mounted ? t('preview.previewMode') : '预览模式'}
          >
            <BookOpen className="h-4 w-4" />
            <span>{mounted ? t('preview.read') : '阅读'}</span>
          </button>
          <button
            onClick={() => handleModeChange('edit')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
              mode === 'edit'
                ? 'shadow-sm'
                : 'hover:opacity-80'
            )}
            style={{
              backgroundColor: mode === 'edit' ? themeConfig.card : 'transparent',
              color: mode === 'edit' ? themeConfig.heading : themeConfig.muted,
            }}
            title={mounted ? t('preview.editMode') : '编辑模式'}
          >
            <Pencil className="h-4 w-4" />
            <span>{mounted ? t('preview.edit') : '编辑'}</span>
          </button>
          <button
            onClick={() => handleModeChange('live')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
              mode === 'live'
                ? 'shadow-sm'
                : 'hover:opacity-80'
            )}
            style={{
              backgroundColor: mode === 'live' ? themeConfig.card : 'transparent',
              color: mode === 'live' ? themeConfig.heading : themeConfig.muted,
            }}
            title={liveLabels.mode}
          >
            <SplitSquareHorizontal className="h-4 w-4" />
            <span>{liveLabels.short}</span>
          </button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex flex-1 overflow-hidden">
        {mode === 'preview' && (
          <div className="h-full w-full overflow-y-auto overflow-x-hidden">
            <div className="max-w-none p-8">
              <style>{getThemeStyles(theme)}</style>
              <article
                className="markdown-body max-w-none"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          </div>
        )}

        {mode === 'edit' && (
          <textarea
            value={editContent}
            onChange={handleEditChange}
            className="h-full w-full resize-none border-0 p-6 font-mono text-sm outline-none"
            style={{
              backgroundColor: themeConfig.background,
              color: themeConfig.text,
              lineHeight: 1.6,
            }}
            placeholder={mounted ? t('preview.editPlaceholder') : '在此编辑 Markdown 文档...'}
            spellCheck={false}
          />
        )}

        {mode === 'live' && (
          <>
            <div
              className="h-full w-1/2 border-r"
              style={{ borderColor: themeConfig.border }}
            >
              <textarea
                ref={liveEditorRef}
                value={editContent}
                onChange={handleEditChange}
                onScroll={handleLiveEditorScroll}
                className="h-full w-full resize-none border-0 p-5 font-mono text-sm outline-none"
                style={{
                  backgroundColor: themeConfig.background,
                  color: themeConfig.text,
                  lineHeight: 1.6,
                }}
                placeholder={mounted ? t('preview.editPlaceholder') : '在此编辑 Markdown 文档...'}
                spellCheck={false}
              />
            </div>
            <div
              ref={livePreviewRef}
              onScroll={handleLivePreviewScroll}
              className="h-full w-1/2 overflow-y-auto overflow-x-hidden"
            >
              <div className="max-w-none p-5">
                <style>{getThemeStyles(theme)}</style>
                <article
                  className="markdown-body max-w-none"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default MarkdownPreview
