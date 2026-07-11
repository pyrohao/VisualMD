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
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useTabsStore, type Tab } from '@/stores/tabsStore'
import { useGitStore } from '@/stores/gitStore'
import { useUnsavedChangesStore } from '@/stores/unsavedChangesStore'
import { useThemeStore, themeConfigs, type ThemeMode } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { useAiChatStore } from '@/stores/aiChatStore'
import { getGitProviderClient } from '@/lib/git/providers'
import { inferGitFileKind, inferGitFileMimeType, isGitBinaryFileKind } from '@/lib/git/file-kind'
import { applyMarkdownToDocument, persistMarkdownToActiveSource } from '@/lib/editor-persistence'
import { resolveTabCurrentContent, resolveTabSavedContent } from '@/lib/tab-content'
import {
  memo,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  type RefObject,
  type UIEventHandler,
} from 'react'
import type { PluggableList } from 'unified'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { BookOpen, Columns2, Pencil, Plus, Rows2, SplitSquareHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getMarkdownImagePasteResult, hasClipboardImage } from '@/lib/clipboard-image'
import { getGitMarkdownImagePasteResult } from '@/lib/git-asset-paste'
import { getLocalMarkdownImagePasteResult } from '@/lib/local-asset-paste'
import {
  createMarkdownReferenceHighlightPlugin,
  resolvePreviewHighlightRanges,
} from '@/lib/markdown-preview-highlight'
import {
  createMarkdownSourceAnchorPlugin,
  getPreviewBodyOffset,
} from '@/lib/markdown-preview-anchors'
import {
  getTextareaScrollTopForSourceOffset,
  getTextareaSourceOffsetAtViewportRatio,
} from '@/lib/textarea-viewport-map'
import {
  buildGitImageRuntimeConfig,
  collectGitAssetMap,
  prepareGitHtmlImageSources,
  resolveGitHtmlImageSources,
} from '@/lib/git-image-resolution'
import {
  buildLocalMarkdownPath,
  collectLocalAssetPathSet,
  prepareLocalHtmlImageSources,
  resolveLocalHtmlImageSources,
} from '@/lib/local-image-resolution'
import { renderMarkdownToSanitizedHtml } from '@/lib/render-markdown-html'
import { useMermaidEnhancement } from '@/hooks/use-mermaid-enhancement'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'

/**
 * 预览模式类型
 */
type PreviewMode = 'preview' | 'edit' | 'live'
type LivePreviewLayout = 'side-by-side' | 'stacked'
type EditorSelectionSnapshot = {
  mode: PreviewMode
  start: number
  end: number
  direction: 'forward' | 'backward' | 'none'
  scrollTop: number
  scrollLeft: number
  shouldRefocus: boolean
}

type OutlineJumpDetail = {
  line: number
  index?: number
  sourceOffset?: number
}

const LIVE_PREVIEW_LAYOUT_STORAGE_KEY = 'visualmd-live-preview-layout'
const PREVIEW_MODE_STORAGE_KEY = 'visualmd-preview-mode'
const PREVIEW_SYNC_TARGET_VIEWPORT_RATIO: Record<LivePreviewLayout, number> = {
  'side-by-side': 0.1,
  stacked: 0.24,
}

function isLivePreviewLayout(value: string | null): value is LivePreviewLayout {
  return value === 'side-by-side' || value === 'stacked'
}

function isPreviewMode(value: string | null): value is PreviewMode {
  return value === 'preview' || value === 'edit' || value === 'live'
}

function normalizeEditorComparableMarkdown(value: string) {
  return value.replace(/\r\n/g, '\n')
}

function getLineStartOffset(markdown: string, targetLine: number) {
  if (targetLine <= 0) return 0

  const lines = markdown.split('\n')
  const clampedLine = Math.min(targetLine, Math.max(0, lines.length - 1))
  let offset = 0

  for (let index = 0; index < clampedLine; index += 1) {
    offset += lines[index].length + 1
  }

  return offset
}

function clampPreviewScrollTop(scrollTop: number, target: HTMLElement) {
  const maxScrollTop = Math.max(0, target.scrollHeight - target.clientHeight)
  return Math.min(Math.max(0, scrollTop), maxScrollTop)
}

function getTextareaLineHeight(textarea: HTMLTextAreaElement) {
  const computedStyle = window.getComputedStyle(textarea)
  return Number.parseFloat(computedStyle.lineHeight || '0') || 22
}

function getTextareaViewportAnchorOffset(textarea: HTMLTextAreaElement, layout: LivePreviewLayout) {
  const viewportRatio = PREVIEW_SYNC_TARGET_VIEWPORT_RATIO[layout]
  return textarea.clientHeight * viewportRatio
}

function getTopOverlayInset(
  textarea: HTMLTextAreaElement | null,
  overlay: HTMLElement | null
) {
  if (!textarea || !overlay) {
    return 0
  }

  const textareaRect = textarea.getBoundingClientRect()
  const overlayRect = overlay.getBoundingClientRect()
  const overlap = overlayRect.bottom - textareaRect.top

  return overlap > 0 ? Math.min(overlap, textarea.clientHeight) : 0
}

function getAnchoredPreviewElements(article: HTMLElement) {
  return Array.from(
    article.querySelectorAll<HTMLElement>('[data-source-start][data-source-end]')
  )
}

function parseNodeOffset(value: string | null) {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function getPreviewAnchorSourceRange(anchor: HTMLElement | null) {
  if (!anchor) {
    return null
  }

  const start = parseNodeOffset(anchor.getAttribute('data-source-start'))
  const end = parseNodeOffset(anchor.getAttribute('data-source-end'))

  if (start === null || end === null || end < start) {
    return null
  }

  return { start, end }
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1)
}

function findBestPreviewAnchor(
  article: HTMLElement,
  sourceOffset: number
) {
  const anchoredElements = getAnchoredPreviewElements(article)
  if (anchoredElements.length === 0) {
    return null
  }

  let bestElement: HTMLElement | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const element of anchoredElements) {
    const start = parseNodeOffset(element.getAttribute('data-source-start'))
    const end = parseNodeOffset(element.getAttribute('data-source-end'))
    if (start === null || end === null || end < start) {
      continue
    }

    const score =
      sourceOffset < start
        ? start - sourceOffset
        : sourceOffset > end
          ? sourceOffset - end
          : 0

    if (score < bestScore) {
      bestScore = score
      bestElement = element
      if (score === 0) {
        break
      }
    }
  }

  return bestElement
}

function getPreviewAnchorTop(anchor: HTMLElement, target: HTMLElement) {
  const anchorRect = anchor.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  return anchorRect.top - targetRect.top + target.scrollTop
}

function getPreviewAnchorScrollTop(
  anchor: HTMLElement,
  target: HTMLElement,
  layout: LivePreviewLayout,
  sourceOffset: number
) {
  const viewportRatio = PREVIEW_SYNC_TARGET_VIEWPORT_RATIO[layout]
  const anchorTop = getPreviewAnchorTop(anchor, target)
  const sourceRange = getPreviewAnchorSourceRange(anchor)
  const sourceLength = sourceRange ? Math.max(1, sourceRange.end - sourceRange.start) : 1
  const sourceProgress = sourceRange
    ? clamp01((sourceOffset - sourceRange.start) / sourceLength)
    : 0
  const desiredTop =
    anchorTop + anchor.offsetHeight * sourceProgress - target.clientHeight * viewportRatio
  return clampPreviewScrollTop(desiredTop, target)
}

function getPreviewAnchorCenterY(anchor: HTMLElement, preview: HTMLElement) {
  const anchorRect = anchor.getBoundingClientRect()
  const previewRect = preview.getBoundingClientRect()
  return anchorRect.top - previewRect.top + preview.scrollTop + anchorRect.height / 2
}

function findBestPreviewAnchorByViewport(
  article: HTMLElement,
  preview: HTMLElement,
  layout: LivePreviewLayout
) {
  const anchoredElements = getAnchoredPreviewElements(article)
  if (anchoredElements.length === 0) {
    return null
  }

  const targetY =
    preview.scrollTop + preview.clientHeight * PREVIEW_SYNC_TARGET_VIEWPORT_RATIO[layout]
  let bestElement: HTMLElement | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (const element of anchoredElements) {
    const elementTop = getPreviewAnchorTop(element, preview)
    const elementBottom = elementTop + Math.max(element.offsetHeight, 1)

    if (targetY >= elementTop && targetY <= elementBottom) {
      return element
    }

    const distance = Math.abs(getPreviewAnchorCenterY(element, preview) - targetY)
    if (distance < bestDistance) {
      bestDistance = distance
      bestElement = element
    }
  }

  return bestElement
}

/**
 * 根据主题生成CSS变量样式
 */
function getThemeStyles(theme: ThemeMode): string {
  const config = themeConfigs[theme]
  const selectionColor = theme === 'dark'
    ? 'rgba(58, 96, 130, 0.48)'
    : theme === 'reading'
      ? 'rgba(177, 139, 74, 0.26)'
      : 'rgba(86, 156, 214, 0.34)'
  
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
    .markdown-body .mermaid-diagram {
      margin: 1.5rem 0;
      overflow-x: auto;
      border: 1px solid ${config.border};
      border-radius: 0.75rem;
      background-color: ${config.card};
      padding: 1rem;
    }
    .markdown-body .mermaid-diagram svg {
      display: block;
      max-width: 100%;
      height: auto;
      margin: 0 auto;
    }
    .markdown-body .mermaid-error {
      margin: 1rem 0 0.5rem;
      border-left: 3px solid ${config.warning};
      padding-left: 0.75rem;
      color: ${config.warning};
      font-size: 0.875rem;
    }
    .markdown-body table {
      width: 100%;
      border-collapse: collapse;
      margin: 1.5rem 0;
    }
    .markdown-body span.visualmd-reference-highlight {
      border-radius: 0.22rem;
      padding: 0.04rem 0.12rem;
      background-color: ${selectionColor};
      box-shadow: none;
      -webkit-box-decoration-break: clone;
      box-decoration-break: clone;
    }
    .markdown-body pre.visualmd-reference-highlight,
    .markdown-body code.visualmd-reference-highlight,
    .markdown-body img.visualmd-reference-highlight,
    .markdown-body table.visualmd-reference-highlight {
      border-radius: 0.28rem;
      outline: none;
      background-color: ${selectionColor};
      box-shadow: none;
    }
    .markdown-body pre.visualmd-reference-highlight,
    .markdown-body table.visualmd-reference-highlight {
      padding: 0.45rem 0.65rem;
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

const RenderedMarkdownPane = memo(function RenderedMarkdownPane({
  containerRef,
  articleRef,
  html,
  theme,
  className,
  contentClassName,
  borderColor,
  onScroll,
}: {
  containerRef: RefObject<HTMLDivElement | null>
  articleRef: RefObject<HTMLElement | null>
  html: string
  theme: ThemeMode
  className: string
  contentClassName: string
  borderColor?: string
  onScroll?: UIEventHandler<HTMLDivElement>
}) {
  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      className={className}
      style={borderColor ? { borderColor } : undefined}
    >
      <div className={contentClassName}>
        <style>{getThemeStyles(theme)}</style>
        <article
          ref={articleRef}
          className="markdown-body max-w-none"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}, (prevProps, nextProps) => (
  prevProps.containerRef === nextProps.containerRef &&
  prevProps.articleRef === nextProps.articleRef &&
  prevProps.html === nextProps.html &&
  prevProps.theme === nextProps.theme &&
  prevProps.className === nextProps.className &&
  prevProps.contentClassName === nextProps.contentClassName &&
  prevProps.borderColor === nextProps.borderColor &&
  prevProps.onScroll === nextProps.onScroll
))

function GitBinaryPreview({
  fileName,
  gitMeta,
}: {
  fileName: string
  gitMeta: NonNullable<Tab['gitMeta']>
}) {
  const gitConfig = useGitStore((state) => state.config)
  const { getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef<Map<string, string>>(new Map())
  const { t, currentLanguage } = useTranslation()
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const fileKind = gitMeta.fileKind || inferGitFileKind(gitMeta.path)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    let cancelled = false

    const loadPreview = async () => {
      if (!isGitBinaryFileKind(fileKind)) {
        setPreviewUrl('')
        setLoading(false)
        setError(null)
        return
      }

      const runtimeConfig = buildGitImageRuntimeConfig(gitConfig, gitMeta)
      if (!runtimeConfig) {
        setPreviewUrl('')
        setLoading(false)
        setError(t('git.previewMissingToken'))
        return
      }

      const cacheKey = `${runtimeConfig.provider}:${runtimeConfig.ownerOrNamespace}/${runtimeConfig.repo}:${runtimeConfig.branch}:${gitMeta.path}`
      const cached = cacheRef.current.get(cacheKey)
      if (cached) {
        setPreviewUrl(cached)
        setLoading(false)
        setError(null)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const getBinaryFile = getGitProviderClient(runtimeConfig).getBinaryFile
        if (!getBinaryFile) {
          throw new Error(t('git.binaryPreviewUnsupported'))
        }

        const binary = await getBinaryFile(runtimeConfig, gitMeta.path)
        if (!binary?.contentBase64) {
          throw new Error(t('git.binaryPreviewEmptyContent'))
        }

        const nextPreviewUrl = `data:${inferGitFileMimeType(gitMeta.path, binary.mimeType || gitMeta.mimeType)};base64,${binary.contentBase64}`
        cacheRef.current.set(cacheKey, nextPreviewUrl)
        if (!cancelled) {
          setPreviewUrl(nextPreviewUrl)
          setLoading(false)
        }
      } catch (loadError) {
        if (!cancelled) {
          setPreviewUrl('')
          setLoading(false)
          setError(loadError instanceof Error ? loadError.message : t('git.binaryPreviewFailed'))
        }
      }
    }

    void loadPreview()

    return () => {
      cancelled = true
    }
  }, [currentLanguage, fileKind, gitConfig, gitMeta, t])

  const typeLabel = {
    text: t('git.filePreview'),
    image: t('git.imagePreview'),
    audio: t('git.audioPreview'),
    video: t('git.videoPreview'),
    pdf: t('git.pdfPreview'),
    binary: t('git.binaryPreview'),
  }

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.background }}>
      <div
        className="flex h-14 items-center justify-between gap-4 border-b px-5"
        style={{ backgroundColor: themeConfig.card, borderColor: themeConfig.border }}
      >
        <div className="min-w-0">
          <div className="text-lg font-semibold" style={{ color: themeConfig.heading }}>
            {typeLabel[fileKind]}
          </div>
          <div className="truncate text-sm" style={{ color: themeConfig.muted }} title={gitMeta.path}>
            {gitMeta.path}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm" style={{ color: themeConfig.muted }}>
            {t('git.loadingPreview')}
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <div
              className="max-w-md rounded-2xl border px-6 py-6 text-center text-sm"
              style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.card, color: themeConfig.muted }}
            >
              {error}
            </div>
          </div>
        ) : fileKind === 'image' ? (
          <div className="flex min-h-full items-center justify-center">
            <img src={previewUrl} alt={fileName} className="max-h-full max-w-full rounded-xl object-contain shadow-lg" />
          </div>
        ) : fileKind === 'audio' ? (
          <div className="flex min-h-full items-center justify-center">
            <audio controls src={previewUrl} className="w-full max-w-xl" />
          </div>
        ) : fileKind === 'video' ? (
          <div className="flex min-h-full items-center justify-center">
            <video controls src={previewUrl} className="max-h-full max-w-full rounded-xl shadow-lg" />
          </div>
        ) : fileKind === 'pdf' ? (
          <iframe title={fileName} src={previewUrl} className="h-full min-h-[70vh] w-full rounded-xl border-0" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <div
              className="max-w-md rounded-2xl border px-6 py-6 text-center"
              style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.card }}
            >
              <div className="text-base font-semibold" style={{ color: themeConfig.heading }}>
                {fileName}
              </div>
              <div className="mt-2 text-sm" style={{ color: themeConfig.muted }}>
                {t('git.inlinePreviewUnavailable')}
              </div>
              <a
                href={previewUrl}
                download={fileName}
                className="mt-4 inline-flex rounded-md border px-4 py-2 text-sm transition-opacity hover:opacity-80"
                style={{ borderColor: themeConfig.border, color: themeConfig.text }}
              >
                {t('git.downloadFile')}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function MarkdownPreview() {
  const { document } = useDocumentStore()
  const externalRevision = useDocumentStore((state) => state.externalRevision)
  const addEditorSelectionReference = useAiChatStore((state) => state.addEditorSelectionReference)
  const selectionCandidate = useAiChatStore((state) => state.selectionCandidate)
  const commitSelectionCandidate = useAiChatStore((state) => state.commitSelectionCandidate)
  const clearSelectionCandidate = useAiChatStore((state) => state.clearSelectionCandidate)
  const currentConversationId = useAiChatStore((state) => state.currentConversationId)
  const referencesByConversation = useAiChatStore((state) => state.referencesByConversation)
  const selectedReferenceIds = useAiChatStore((state) => state.selectedReferenceIds)
  const activeTabId = useTabsStore((state) => state.activeTabId)
  const activeTab = useTabsStore((state) => state.tabs.find((item) => item.id === state.activeTabId) || null)
  const activeGitMeta = useTabsStore((state) => {
    const activeTab = state.tabs.find((item) => item.id === state.activeTabId)
    if (!activeTab || activeTab.sourceType !== 'git' || !activeTab.gitMeta?.path) {
      return null
    }
    return activeTab.gitMeta
  })
  const gitConfig = useGitStore((state) => state.config)
  const gitDrafts = useGitStore((state) => state.drafts)
  const stagedChanges = useGitStore((state) => state.stagedChanges)
  const pendingAssetChanges = useGitStore((state) => state.pendingAssetChanges)
  const { theme, getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  const [mode, setMode] = useState<PreviewMode>('preview')
  const [liveLayout, setLiveLayout] = useState<LivePreviewLayout>('side-by-side')
  const [html, setHtml] = useState('')
  const [editContent, setEditContent] = useState('')
  const [persistedEditContent, setPersistedEditContent] = useState('')
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const liveEditorRef = useRef<HTMLTextAreaElement | null>(null)
  const livePreviewRef = useRef<HTMLDivElement | null>(null)
  const previewScrollRef = useRef<HTMLDivElement | null>(null)
  const previewArticleRef = useRef<HTMLElement | null>(null)
  const livePreviewArticleRef = useRef<HTMLElement | null>(null)
  const selectionPromptRef = useRef<HTMLDivElement | null>(null)
  const selectionTimerRef = useRef<number | null>(null)
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isSyncingLiveScrollRef = useRef(false)
  const previousDocumentKeyRef = useRef<string>('')
  const skipLiveSyncRef = useRef(false)
  const lastLiveScrollDriverRef = useRef<'editor' | 'preview'>('editor')
  const isPersistingDraftRef = useRef(false)
  const gitImageCacheRef = useRef<Map<string, string>>(new Map())
  const editContentRef = useRef(editContent)
  const persistedEditContentRef = useRef(persistedEditContent)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const { t, currentLanguage } = useTranslation()
  const mermaidErrorMessage = currentLanguage === 'zh'
    ? 'Mermaid 图表渲染失败，已回退为原始代码块。'
    : 'Mermaid rendering failed. Falling back to the code block.'

  useMermaidEnhancement(previewArticleRef, mode === 'preview' ? html : '', theme, mermaidErrorMessage)
  useMermaidEnhancement(livePreviewArticleRef, mode === 'live' ? html : '', theme, mermaidErrorMessage)

  useEffect(() => {
    setMounted(true)
    const storedMode = window.localStorage.getItem(PREVIEW_MODE_STORAGE_KEY)
    const storedLayout = window.localStorage.getItem(LIVE_PREVIEW_LAYOUT_STORAGE_KEY)
    if (isPreviewMode(storedMode)) {
      setMode(storedMode)
    }
    if (isLivePreviewLayout(storedLayout)) {
      setLiveLayout(storedLayout)
    }
  }, [])

  useEffect(() => {
    const handleOpenPreview = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: PreviewMode }>).detail
      const nextMode = detail?.mode
      if (!nextMode || !isPreviewMode(nextMode)) {
        return
      }

      setMode(nextMode)
      window.localStorage.setItem(PREVIEW_MODE_STORAGE_KEY, nextMode)
    }

    window.addEventListener('visualmd:open-preview', handleOpenPreview)
    return () => {
      window.removeEventListener('visualmd:open-preview', handleOpenPreview)
    }
  }, [])

  const handleLiveLayoutChange = useCallback((nextLayout: LivePreviewLayout) => {
    setLiveLayout(nextLayout)
    window.localStorage.setItem(LIVE_PREVIEW_LAYOUT_STORAGE_KEY, nextLayout)
  }, [])

  const captureEditorSelectionSnapshot = useCallback((): EditorSelectionSnapshot | null => {
    const textarea = mode === 'live' ? liveEditorRef.current : mode === 'edit' ? editTextareaRef.current : null
    if (!textarea) {
      return null
    }

    const activeElement = globalThis.document?.activeElement ?? null

    return {
      mode,
      start: textarea.selectionStart ?? 0,
      end: textarea.selectionEnd ?? 0,
      direction: textarea.selectionDirection ?? 'none',
      scrollTop: textarea.scrollTop,
      scrollLeft: textarea.scrollLeft,
      shouldRefocus: activeElement === textarea,
    }
  }, [mode])

  const restoreEditorSelectionSnapshot = useCallback((
    snapshot: EditorSelectionSnapshot | null,
    nextMarkdown: string
  ) => {
    if (!snapshot || snapshot.mode === 'preview') {
      return
    }

    window.requestAnimationFrame(() => {
      const textarea = snapshot.mode === 'live' ? liveEditorRef.current : editTextareaRef.current
      if (!textarea) {
        return
      }

      const nextLength = nextMarkdown.length
      const nextStart = Math.min(snapshot.start, nextLength)
      const nextEnd = Math.min(snapshot.end, nextLength)

      if (snapshot.shouldRefocus) {
        textarea.focus({ preventScroll: true })
      }

      textarea.setSelectionRange(nextStart, nextEnd, snapshot.direction)
      textarea.scrollTop = snapshot.scrollTop
      textarea.scrollLeft = snapshot.scrollLeft
    })
  }, [])

  const getEditorViewportInsets = useCallback((textarea: HTMLTextAreaElement | null) => ({
    topInset: getTopOverlayInset(textarea, selectionPromptRef.current),
    bottomInset: 0,
  }), [])

  useEffect(() => {
    return () => {
      if (selectionTimerRef.current !== null) {
        window.clearTimeout(selectionTimerRef.current)
      }
    }
  }, [])

  const activeGitFileKind =
    activeTab?.sourceType === 'git' && activeTab.gitMeta?.path
      ? activeTab.gitMeta.fileKind || inferGitFileKind(activeTab.gitMeta.path)
      : 'text'
  const isActiveBinaryGitTab =
    activeTab?.sourceType === 'git' && isGitBinaryFileKind(activeGitFileKind)

  // 从Store获取当前Markdown
  const markdown = useDocumentStore.getState().getCurrentMarkdown()
  const latestMarkdownRef = useRef(markdown)
  const latestExternalRevisionRef = useRef(externalRevision)
  const isEditingMode = mode === 'edit' || mode === 'live'
  const renderMarkdown = mode === 'live' ? editContent : markdown
  const previewBodyOffset = useMemo(() => getPreviewBodyOffset(renderMarkdown), [renderMarkdown])
  const hasPendingEditorChanges = isEditingMode && (
    normalizeEditorComparableMarkdown(editContent) !== normalizeEditorComparableMarkdown(persistedEditContent)
  )
  const documentKey = `${activeTabId || ''}\u0000${document?.fileId || ''}\u0000${document?.fileName || ''}`
  const activeReferences = useMemo(() => {
    if (!currentConversationId || selectedReferenceIds.length === 0) {
      return []
    }

    const selectedReferenceIdSet = new Set(selectedReferenceIds)
    return (referencesByConversation[currentConversationId] || []).filter((reference) =>
      selectedReferenceIdSet.has(reference.id)
    )
  }, [currentConversationId, referencesByConversation, selectedReferenceIds])
  const localFiles = useFileSystemStore((state) => state.files)
  const localFolders = useFileSystemStore((state) => state.folders)
  const localAssets = useFileSystemStore((state) => state.assets)
  const activeTabHasSavedContent = activeTab?.savedContent !== undefined
  const activeTabCurrentContent = useMemo(
    () => resolveTabCurrentContent(activeTab, { gitDrafts, localFiles }),
    [activeTab, gitDrafts, localFiles]
  )
  const activeTabSavedContent = useMemo(
    () => resolveTabSavedContent(activeTab, { gitDrafts, localFiles }),
    [activeTab, gitDrafts, localFiles]
  )
  const localAssetPaths = useMemo(() => collectLocalAssetPathSet(localAssets), [localAssets])
  const activeLocalMarkdownPath = useMemo(() => {
    if (activeTab?.sourceType !== 'local' || !activeTab.fileId) {
      return null
    }

    return buildLocalMarkdownPath(activeTab.fileId, localFiles, localFolders)
  }, [activeTab?.fileId, activeTab?.sourceType, localFiles, localFolders])
  const localImageCacheRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    editContentRef.current = editContent
    persistedEditContentRef.current = persistedEditContent
  }, [editContent, persistedEditContent])

  useEffect(() => {
    if (!selectionCandidate || !isEditingMode) {
      return
    }

    const nextSelectedText = editContent.slice(selectionCandidate.startOffset, selectionCandidate.endOffset)
    if (nextSelectedText === selectionCandidate.expectedText) {
      return
    }

    clearSelectionCandidate()
  }, [clearSelectionCandidate, editContent, isEditingMode, selectionCandidate])

  // 当 markdown 变化时，更新编辑内容
  useEffect(() => {
    if (isPersistingDraftRef.current) {
      return
    }

    if (externalRevision !== latestExternalRevisionRef.current) {
      const selectionSnapshot = isEditingMode ? captureEditorSelectionSnapshot() : null
      latestExternalRevisionRef.current = externalRevision
      latestMarkdownRef.current = markdown
      skipLiveSyncRef.current = true
      setEditContent(markdown)
      setPersistedEditContent(markdown)
      restoreEditorSelectionSnapshot(selectionSnapshot, markdown)
      return
    }

    const previousMarkdown = latestMarkdownRef.current
    latestMarkdownRef.current = markdown
    if (!isEditingMode || editContent === previousMarkdown) {
      setEditContent(markdown)
    }
  }, [captureEditorSelectionSnapshot, editContent, externalRevision, isEditingMode, markdown, restoreEditorSelectionSnapshot])

  useEffect(() => {
    if (documentKey === previousDocumentKeyRef.current) {
      return
    }

    previousDocumentKeyRef.current = documentKey
    skipLiveSyncRef.current = true
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
      autoSaveTimeoutRef.current = null
    }
    const sourceMarkdown = activeTabHasSavedContent
      ? activeTabSavedContent
      : activeTabCurrentContent || latestMarkdownRef.current
    setEditContent(sourceMarkdown)
    setPersistedEditContent(sourceMarkdown)
    clearSelectionCandidate()
  }, [activeTabCurrentContent, activeTabHasSavedContent, activeTabSavedContent, clearSelectionCandidate, documentKey])

  const commitDraftToDocument = useCallback((nextMarkdown: string) => {
    return applyMarkdownToDocument(nextMarkdown)
  }, [])

  const persistEditorDraft = useCallback(() => {
    const nextMarkdown = editContentRef.current
    const activeTab = useTabsStore.getState().getActiveTab()
    const editingTemplateId = useSidebarStore.getState().editingTemplateId
    const selectionSnapshot = captureEditorSelectionSnapshot()

    if (!document || !commitDraftToDocument(nextMarkdown)) {
      return false
    }

    isPersistingDraftRef.current = true
    const documentStore = useDocumentStore.getState()
    const latestMarkdown = documentStore.getCurrentMarkdown()
    const latestFileName = documentStore.document?.fileName

    if (editingTemplateId) {
      useSidebarStore.setState((state) => ({
        templates: state.templates.map((template) =>
          template.id === editingTemplateId
            ? { ...template, content: latestMarkdown, updatedAt: Date.now() }
            : template
        ),
        isTemplateModified: false,
      }))

      if (activeTab) {
        useTabsStore.setState((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === activeTab.id
              ? {
                  ...tab,
                  fileName: latestFileName || tab.fileName,
                  content: nextMarkdown,
                  savedContent: nextMarkdown,
                  isModified: false,
                }
              : tab
          ),
        }))
      }

      documentStore.markAsSaved()
      editContentRef.current = nextMarkdown
      persistedEditContentRef.current = nextMarkdown
      setEditContent(nextMarkdown)
      setPersistedEditContent(nextMarkdown)
      restoreEditorSelectionSnapshot(selectionSnapshot, nextMarkdown)
      window.requestAnimationFrame(() => {
        isPersistingDraftRef.current = false
      })
      useUnsavedChangesStore.getState().setEditorDirty('markdown-preview', false)
      return true
    }

    if (activeTab?.sourceType === 'git' && activeTab.fileId) {
      persistMarkdownToActiveSource(nextMarkdown, latestFileName, {
        markSaved: true,
        markDocumentSaved: true,
      })
      editContentRef.current = nextMarkdown
      persistedEditContentRef.current = nextMarkdown
      setEditContent(nextMarkdown)
      setPersistedEditContent(nextMarkdown)
      restoreEditorSelectionSnapshot(selectionSnapshot, nextMarkdown)
      window.requestAnimationFrame(() => {
        isPersistingDraftRef.current = false
      })
      useUnsavedChangesStore.getState().setEditorDirty('markdown-preview', false)
      return true
    }

    if (activeTab?.fileId) {
      persistMarkdownToActiveSource(nextMarkdown, latestFileName, { markSaved: true })
      editContentRef.current = nextMarkdown
      persistedEditContentRef.current = nextMarkdown
      setEditContent(nextMarkdown)
      setPersistedEditContent(nextMarkdown)
      restoreEditorSelectionSnapshot(selectionSnapshot, nextMarkdown)
      window.requestAnimationFrame(() => {
        isPersistingDraftRef.current = false
      })
      useUnsavedChangesStore.getState().setEditorDirty('markdown-preview', false)
      return true
    }

    window.requestAnimationFrame(() => {
      isPersistingDraftRef.current = false
    })
    return false
  }, [captureEditorSelectionSnapshot, commitDraftToDocument, document, restoreEditorSelectionSnapshot])

  useEffect(() => {
    const getOutlineJumpViewportRatio = () => {
      if (mode === 'live') {
        return PREVIEW_SYNC_TARGET_VIEWPORT_RATIO[liveLayout]
      }

      return 0.16
    }

    const jumpToTextareaSourceOffset = (line: number, sourceOffset?: number) => {
      const textarea = mode === 'live' ? liveEditorRef.current : mode === 'edit' ? editTextareaRef.current : null
      if (!textarea) return false

      const offset = typeof sourceOffset === 'number'
        ? Math.max(0, Math.min(sourceOffset, editContentRef.current.length))
        : getLineStartOffset(editContentRef.current, line)
      const nextScrollTop = getTextareaScrollTopForSourceOffset(
        textarea,
        editContentRef.current,
        offset,
        getOutlineJumpViewportRatio(),
        getEditorViewportInsets(textarea)
      )

      textarea.focus({ preventScroll: true })
      textarea.setSelectionRange(offset, offset)
      textarea.scrollTop = nextScrollTop
      return true
    }

    const jumpToPreviewHeading = (index?: number, sourceOffset?: number) => {
      const article = mode === 'live' ? livePreviewArticleRef.current : mode === 'preview' ? previewArticleRef.current : null
      const scrollContainer = mode === 'live' ? livePreviewRef.current : mode === 'preview' ? previewScrollRef.current : null
      if (!article || !scrollContainer) return false

      let targetHeading: HTMLElement | undefined

      if (typeof sourceOffset === 'number') {
        const previewSourceOffset = Math.max(
          0,
          sourceOffset - getPreviewBodyOffset(mode === 'live' ? editContentRef.current : latestMarkdownRef.current)
        )
        const headings = Array.from(article.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
        targetHeading = headings.find((heading) => {
          const start = parseNodeOffset(heading.getAttribute('data-source-start'))
          return start === previewSourceOffset
        })

        if (!targetHeading) {
          const fallback = findBestPreviewAnchor(article, previewSourceOffset)
          if (fallback && /^H[1-6]$/.test(fallback.tagName)) {
            targetHeading = fallback
          }
        }
      }

      if (!targetHeading && index !== undefined) {
        const headings = article.querySelectorAll('h1, h2, h3, h4, h5, h6')
        targetHeading = headings[index] as HTMLElement | undefined
      }

      if (!targetHeading) return false

      scrollContainer.scrollTo({
        top: getPreviewAnchorScrollTop(
          targetHeading,
          scrollContainer,
          mode === 'live' ? liveLayout : 'stacked',
          Math.max(
            0,
            (parseNodeOffset(targetHeading.getAttribute('data-source-start')) || 0)
          )
        ),
        behavior: 'smooth',
      })
      return true
    }

    const handleOutlineJump = (event: Event) => {
      const detail = (event as CustomEvent<OutlineJumpDetail>).detail
      if (!detail || typeof detail.line !== 'number') return

      if (mode === 'preview') {
        jumpToPreviewHeading(detail.index, detail.sourceOffset)
        return
      }

      const jumped = jumpToTextareaSourceOffset(detail.line, detail.sourceOffset)
      if (mode === 'live' && !jumped) {
        jumpToPreviewHeading(detail.index, detail.sourceOffset)
      }
    }

    window.addEventListener('outline-jump', handleOutlineJump)
    return () => {
      window.removeEventListener('outline-jump', handleOutlineJump)
    }
  }, [getEditorViewportInsets, liveLayout, mode])

  const gitAssets = useMemo(
    () => collectGitAssetMap(stagedChanges, pendingAssetChanges),
    [pendingAssetChanges, stagedChanges]
  )

  const resolveGitImageSources = useCallback(async (rawHtml: string) => {
    if (!activeGitMeta?.path) {
      return rawHtml
    }

    const preparedHtml = prepareGitHtmlImageSources(rawHtml, activeGitMeta.path, gitAssets)

    return resolveGitHtmlImageSources({
      rawHtml: preparedHtml,
      markdownPath: activeGitMeta.path,
      gitAssets,
      runtimeConfig: buildGitImageRuntimeConfig(gitConfig, activeGitMeta),
      cache: gitImageCacheRef.current,
    })
  }, [activeGitMeta, gitAssets, gitConfig])

  const resolveLocalImageSources = useCallback(async (rawHtml: string) => {
    if (!activeLocalMarkdownPath) {
      return rawHtml
    }

    return resolveLocalHtmlImageSources({
      rawHtml,
      markdownPath: activeLocalMarkdownPath,
      assetPaths: localAssetPaths,
      cache: localImageCacheRef.current,
    })
  }, [activeLocalMarkdownPath, localAssetPaths])

  // 使用 remark 处理 markdown
  useEffect(() => {
    let cancelled = false

    const processMarkdown = async () => {
      const { body: content, ranges: referenceHighlightRanges } = resolvePreviewHighlightRanges(
        renderMarkdown,
        activeReferences
      )
      const remarkPlugins: PluggableList = [remarkMath]

      if (referenceHighlightRanges.length > 0) {
        remarkPlugins.push(createMarkdownReferenceHighlightPlugin(referenceHighlightRanges))
      }

      remarkPlugins.push(createMarkdownSourceAnchorPlugin())

      const sanitizedHtml = await renderMarkdownToSanitizedHtml(content, {
        remarkPlugins,
        rehypePlugins: [rehypeKatex],
      })
      const immediateHtml = activeGitMeta?.path
        ? prepareGitHtmlImageSources(sanitizedHtml, activeGitMeta.path, gitAssets)
        : activeLocalMarkdownPath
          ? prepareLocalHtmlImageSources(sanitizedHtml, activeLocalMarkdownPath, localAssetPaths)
          : sanitizedHtml
      if (!cancelled) {
        setHtml(immediateHtml)
      }

      const resolver = activeGitMeta?.path ? resolveGitImageSources : activeLocalMarkdownPath ? resolveLocalImageSources : null
      if (!resolver) {
        return
      }

      void resolver(immediateHtml).then((resolvedHtml) => {
        if (cancelled || resolvedHtml === immediateHtml) {
          return
        }
        setHtml(resolvedHtml)
      })
    }
    
    processMarkdown()

    return () => {
      cancelled = true
    }
  }, [activeGitMeta?.path, activeLocalMarkdownPath, activeReferences, gitAssets, localAssetPaths, renderMarkdown, resolveGitImageSources, resolveLocalImageSources])

  // 处理模式切换
  const handleModeChange = useCallback((newMode: PreviewMode) => {
    if (newMode === mode) return

    const leavingEditingToPreview = (mode === 'edit' || mode === 'live') && newMode === 'preview'
    if (leavingEditingToPreview) {
      persistEditorDraft()
    }

    const enteringEditing = mode === 'preview' && (newMode === 'edit' || newMode === 'live')
    if (enteringEditing) {
      const sourceMarkdown = activeTabHasSavedContent
        ? activeTabSavedContent
        : activeTabCurrentContent || markdown
      setEditContent(sourceMarkdown)
      setPersistedEditContent(sourceMarkdown)
    }

    setMode(newMode)
    window.localStorage.setItem(PREVIEW_MODE_STORAGE_KEY, newMode)
  }, [activeTabCurrentContent, activeTabHasSavedContent, activeTabSavedContent, markdown, mode, persistEditorDraft])

  // 处理编辑内容变化
  const handleEditChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value)
  }, [])

  useEffect(() => {
    useUnsavedChangesStore.getState().registerEditor('markdown-preview', {
      save: () => {
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current)
          autoSaveTimeoutRef.current = null
        }
        persistEditorDraft()
      },
      discard: () => {
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current)
          autoSaveTimeoutRef.current = null
        }

        const activeTab = useTabsStore.getState().getActiveTab()
        const discardContent = activeTabHasSavedContent
          ? resolveTabSavedContent(activeTab)
          : resolveTabCurrentContent(activeTab) || useDocumentStore.getState().getCurrentMarkdown()
        editContentRef.current = discardContent
        setEditContent(discardContent)
        setPersistedEditContent(discardContent)
        useUnsavedChangesStore.getState().setEditorDirty('markdown-preview', false)
      },
    })

    return () => {
      useUnsavedChangesStore.getState().unregisterEditor('markdown-preview')
    }
  }, [activeTabHasSavedContent, persistEditorDraft])

  useEffect(() => {
    const unsavedStore = useUnsavedChangesStore.getState()
    const currentDirty = unsavedStore.editors['markdown-preview']?.dirty ?? false
    if (currentDirty !== hasPendingEditorChanges) {
      unsavedStore.setEditorDirty('markdown-preview', hasPendingEditorChanges)
    }

    if (!hasPendingEditorChanges || !activeTab) {
      return
    }

    if (!activeTab.isModified) {
      useTabsStore.getState().markTabAsModified(activeTab.id, true)
    }

    if (activeTab.isTemplate || useSidebarStore.getState().editingTemplateId) {
      if (!useSidebarStore.getState().isTemplateModified) {
        useSidebarStore.getState().markTemplateAsModified()
      }
      return
    }

    if (activeTab.sourceType === 'git') {
      return
    }

    if (activeTab.fileId) {
      const currentFile = useFileSystemStore.getState().files.find((item) => item.id === activeTab.fileId)
      if (currentFile && !currentFile.isModified) {
        useFileSystemStore.getState().markFileAsModified(activeTab.fileId)
      }
    }
  }, [activeTab, hasPendingEditorChanges])

  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
      autoSaveTimeoutRef.current = null
    }

    if (!hasPendingEditorChanges) {
      return
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      persistEditorDraft()
    }, 1500)

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
        autoSaveTimeoutRef.current = null
      }
    }
  }, [activeTab?.sourceType, editContent, hasPendingEditorChanges, persistEditorDraft])

  const handleAddTextareaSelection = useCallback((textarea: HTMLTextAreaElement | null, delay = 0) => {
    if (!textarea) return

    const submitSelection = () => {
      const sourceMarkdown = textarea.value
      const selectionStart = textarea.selectionStart ?? 0
      const selectionEnd = textarea.selectionEnd ?? 0
      if (selectionStart === selectionEnd) return
      if (sourceMarkdown !== editContent) {
        setEditContent(sourceMarkdown)
      }
      void addEditorSelectionReference(
        selectionStart,
        selectionEnd,
        sourceMarkdown
      )
    }

    if (selectionTimerRef.current !== null) {
      window.clearTimeout(selectionTimerRef.current)
      selectionTimerRef.current = null
    }

    if (delay > 0) {
      selectionTimerRef.current = window.setTimeout(() => {
        selectionTimerRef.current = null
        submitSelection()
      }, delay)
      return
    }

    submitSelection()
  }, [addEditorSelectionReference, editContent])

  const bindTextareaSelection = useCallback(() => ({
    onSelect: (event: React.SyntheticEvent<HTMLTextAreaElement>) => {
      handleAddTextareaSelection(event.currentTarget, 120)
    },
    onMouseUp: (event: React.MouseEvent<HTMLTextAreaElement>) => {
      handleAddTextareaSelection(event.currentTarget)
    },
    onKeyUp: (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      handleAddTextareaSelection(event.currentTarget)
    },
  }), [handleAddTextareaSelection])

  const persistGitDraftAfterPaste = useCallback((nextValue: string) => {
    const activeTab = useTabsStore.getState().getActiveTab()
    if (!activeTab || activeTab.sourceType !== 'git' || !activeTab.fileId) {
      return
    }

    useGitStore.getState().updateDraftContent(activeTab.fileId, nextValue)
    useTabsStore.getState().updateTabContent(activeTab.id, nextValue)
    useTabsStore.getState().markTabAsModified(activeTab.id, true)
  }, [])

  const handleEditPaste = useCallback(async (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    sourceValue: string,
    textareaRef: React.RefObject<HTMLTextAreaElement | null>
  ) => {
    if (!hasClipboardImage(e.clipboardData)) return

    e.preventDefault()

    const target = e.currentTarget
    const activeTab = useTabsStore.getState().getActiveTab()
    const isGitTab = activeTab?.sourceType === 'git' && !!activeTab.fileId
    const isLocalTab = activeTab?.sourceType === 'local' && !!activeTab.fileId

    const selectionStart = target.selectionStart ?? sourceValue.length
    const selectionEnd = target.selectionEnd ?? sourceValue.length

    const result = isGitTab && activeTab.fileId
      ? await getGitMarkdownImagePasteResult({
          documentId: activeTab.fileId,
          clipboardData: e.clipboardData,
          value: sourceValue,
          selectionStart,
          selectionEnd,
        })
      : isLocalTab && activeTab.fileId
        ? await getLocalMarkdownImagePasteResult({
            fileId: activeTab.fileId,
            clipboardData: e.clipboardData,
            value: sourceValue,
            selectionStart,
            selectionEnd,
          })
      : await getMarkdownImagePasteResult({
          clipboardData: e.clipboardData,
          value: sourceValue,
          selectionStart,
          selectionEnd,
        })

    if (!result) return

    setEditContent(result.nextValue)
    if (isGitTab) {
      persistGitDraftAfterPaste(result.nextValue)
    }

    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }, [persistGitDraftAfterPaste])

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

  const syncLiveScrollFromEditor = useCallback(() => {
    const editor = liveEditorRef.current
    const preview = livePreviewRef.current
    const article = livePreviewArticleRef.current

    if (!editor || !preview || !article) {
      return
    }

    const sourceOffset = Math.max(
      0,
      getTextareaSourceOffsetAtViewportRatio(
        editor,
        editContentRef.current,
        PREVIEW_SYNC_TARGET_VIEWPORT_RATIO[liveLayout],
        getEditorViewportInsets(editor)
      ) - previewBodyOffset
    )
    const anchor = findBestPreviewAnchor(article, sourceOffset)

    if (!anchor) {
      syncLiveScrollByRatio(editor, preview)
      return
    }

    preview.scrollTop = getPreviewAnchorScrollTop(anchor, preview, liveLayout, sourceOffset)
  }, [getEditorViewportInsets, liveLayout, previewBodyOffset, syncLiveScrollByRatio])

  const syncLiveScrollFromPreview = useCallback(() => {
    const preview = livePreviewRef.current
    const article = livePreviewArticleRef.current
    const editor = liveEditorRef.current

    if (!preview || !article || !editor) {
      return
    }

    const anchor = findBestPreviewAnchorByViewport(article, preview, liveLayout)
    const sourceRange = getPreviewAnchorSourceRange(anchor)
    if (!anchor || !sourceRange) {
      syncLiveScrollByRatio(preview, editor)
      return
    }

    const viewportAnchorY =
      preview.scrollTop + preview.clientHeight * PREVIEW_SYNC_TARGET_VIEWPORT_RATIO[liveLayout]
    const anchorTop = getPreviewAnchorTop(anchor, preview)
    const anchorHeight = Math.max(anchor.offsetHeight, 1)
    const previewProgress = clamp01((viewportAnchorY - anchorTop) / anchorHeight)
    const sourceOffset = Math.round(
      sourceRange.start + (sourceRange.end - sourceRange.start) * previewProgress
    ) + previewBodyOffset
    editor.scrollTop = getTextareaScrollTopForSourceOffset(
      editor,
      editContentRef.current,
      sourceOffset,
      PREVIEW_SYNC_TARGET_VIEWPORT_RATIO[liveLayout],
      getEditorViewportInsets(editor)
    )
  }, [getEditorViewportInsets, liveLayout, previewBodyOffset, syncLiveScrollByRatio])

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

    lastLiveScrollDriverRef.current = 'editor'
    withLiveScrollSyncGuard(() => {
      syncLiveScrollFromEditor()
    })
  }, [mode, syncLiveScrollFromEditor, withLiveScrollSyncGuard])

  const handleLivePreviewScroll = useCallback(() => {
    const source = livePreviewRef.current
    const target = liveEditorRef.current
    if (!source || !target || mode !== 'live') {
      return
    }

    lastLiveScrollDriverRef.current = 'preview'
    withLiveScrollSyncGuard(() => {
      syncLiveScrollFromPreview()
    })
  }, [mode, syncLiveScrollFromPreview, withLiveScrollSyncGuard])

  useEffect(() => {
    if (mode !== 'live') return
    if (skipLiveSyncRef.current) {
      skipLiveSyncRef.current = false
    }
  }, [liveLayout, mode])

  useEffect(() => {
    if (mode !== 'live') {
      return
    }

    if (skipLiveSyncRef.current) {
      skipLiveSyncRef.current = false
      return
    }

    window.requestAnimationFrame(() => {
      if (lastLiveScrollDriverRef.current === 'preview') {
        withLiveScrollSyncGuard(() => {
          syncLiveScrollFromPreview()
        })
        return
      }

      withLiveScrollSyncGuard(() => {
        syncLiveScrollFromEditor()
      })
    })
  }, [editContent, html, liveLayout, mode, syncLiveScrollFromEditor, syncLiveScrollFromPreview, withLiveScrollSyncGuard])

  const candidatePreview = useMemo(() => {
    if (!selectionCandidate) return ''
    const normalized = selectionCandidate.expectedText
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !/^[-*_]{3,}$/.test(line))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    return normalized
  }, [selectionCandidate])

  const selectionPrompt = selectionCandidate ? (
    <div
      ref={selectionPromptRef}
      className="pointer-events-auto absolute left-4 right-4 top-4 z-20 flex items-center justify-between gap-3 rounded-xl border px-3 py-2 shadow-sm"
      style={{
        borderColor: themeConfig.border,
        backgroundColor: themeConfig.card,
      }}
    >
      <div className="min-w-0 truncate text-xs" title={candidatePreview} style={{ color: themeConfig.textMuted }}>
        {currentLanguage === 'zh'
          ? `已选择文本：${candidatePreview || '空白选区'}`
          : `Selected text: ${candidatePreview || 'Empty selection'}`}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 rounded-full px-2.5 hover:bg-transparent focus-visible:ring-0"
          style={{
            color: themeConfig.textMuted,
            backgroundColor: 'transparent',
          }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => clearSelectionCandidate()}
        >
          <X className="mr-1 h-3.5 w-3.5" />
          {currentLanguage === 'zh' ? '取消' : 'Cancel'}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-full px-3 shadow-none hover:opacity-90"
          style={{
            backgroundColor: `${themeConfig.primary}14`,
            color: themeConfig.primary,
          }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void commitSelectionCandidate()}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {currentLanguage === 'zh' ? '加入' : 'Add'}
        </Button>
      </div>
    </div>
  ) : null

  // 如果没有文档，显示空状态
  if (isActiveBinaryGitTab && activeTab?.gitMeta) {
    return <GitBinaryPreview fileName={activeTab.fileName} gitMeta={activeTab.gitMeta} />
  }

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

        {mode === 'live' && (
          <div
            className="flex flex-shrink-0 items-center rounded-lg p-1"
            style={{ backgroundColor: themeConfig.background }}
          >
            <button
              type="button"
              onClick={() => handleLiveLayoutChange('side-by-side')}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md transition-all duration-200',
                liveLayout === 'side-by-side' ? 'shadow-sm' : 'hover:opacity-80'
              )}
              style={{
                backgroundColor: liveLayout === 'side-by-side' ? themeConfig.card : 'transparent',
                color: liveLayout === 'side-by-side' ? themeConfig.heading : themeConfig.muted,
              }}
              title={currentLanguage === 'zh' ? '左右分屏' : 'Side by side'}
            >
              <Columns2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleLiveLayoutChange('stacked')}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-md transition-all duration-200',
                liveLayout === 'stacked' ? 'shadow-sm' : 'hover:opacity-80'
              )}
              style={{
                backgroundColor: liveLayout === 'stacked' ? themeConfig.card : 'transparent',
                color: liveLayout === 'stacked' ? themeConfig.heading : themeConfig.muted,
              }}
              title={currentLanguage === 'zh' ? '上下分屏' : 'Stacked'}
            >
              <Rows2 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* 内容区域 */}
      <div className="relative flex flex-1 overflow-hidden">
        {mode === 'preview' && (
          <RenderedMarkdownPane
            containerRef={previewScrollRef}
            articleRef={previewArticleRef}
            html={html}
            theme={theme}
            className="h-full w-full overflow-y-auto overflow-x-hidden"
            contentClassName="max-w-none p-8"
          />
        )}

        {mode === 'edit' && (
          <div className="relative h-full w-full">
            {selectionPrompt}
            <textarea
              ref={editTextareaRef}
              value={editContent}
              onChange={handleEditChange}
              onPaste={(e) => {
                void handleEditPaste(e, editContent, editTextareaRef)
              }}
              className="h-full w-full resize-none border-0 p-6 font-mono text-sm outline-none"
              style={{
                backgroundColor: themeConfig.background,
                color: themeConfig.text,
                lineHeight: 1.6,
              }}
              placeholder={mounted ? t('preview.editPlaceholder') : '在此编辑 Markdown 文档...'}
              spellCheck={false}
              {...bindTextareaSelection()}
            />
          </div>
        )}

        {mode === 'live' && (
          <div className={cn('flex h-full w-full min-w-0', liveLayout === 'stacked' ? 'flex-col' : 'flex-row')}>
            <div
              className={cn(
                liveLayout === 'stacked'
                  ? 'h-1/2 w-full'
                  : 'h-full w-1/2'
              )}
            >
              <RenderedMarkdownPane
                containerRef={livePreviewRef}
                articleRef={livePreviewArticleRef}
                html={html}
                theme={theme}
                onScroll={handleLivePreviewScroll}
                className={cn(
                  'min-h-0 min-w-0 h-full w-full overflow-y-auto overflow-x-hidden',
                  liveLayout === 'stacked' ? 'border-b' : 'border-r'
                )}
                contentClassName="max-w-none p-5"
                borderColor={themeConfig.border}
              />
            </div>
            <div
              className={cn(
                'relative min-h-0 min-w-0',
                liveLayout === 'stacked' ? 'h-1/2 w-full' : 'h-full w-1/2'
              )}
            >
              {selectionPrompt}
              <textarea
                ref={liveEditorRef}
                value={editContent}
                onChange={handleEditChange}
                onPaste={(e) => {
                  void handleEditPaste(e, editContent, liveEditorRef)
                }}
                onScroll={handleLiveEditorScroll}
                className="h-full w-full resize-none border-0 p-5 font-mono text-sm outline-none"
                style={{
                  backgroundColor: themeConfig.background,
                  color: themeConfig.text,
                  lineHeight: 1.6,
                }}
                placeholder={mounted ? t('preview.editPlaceholder') : '在此编辑 Markdown 文档...'}
                spellCheck={false}
                {...bindTextareaSelection()}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MarkdownPreview
