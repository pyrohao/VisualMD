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
import { useTabsStore, type Tab } from '@/stores/tabsStore'
import { useGitStore } from '@/stores/gitStore'
import { useThemeStore, themeConfigs, type ThemeMode } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { useAiChatStore } from '@/stores/aiChatStore'
import { getGitProviderClient } from '@/lib/git/providers'
import { inferGitFileKind, inferGitFileMimeType, isGitBinaryFileKind } from '@/lib/git/file-kind'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { BookOpen, Pencil, Plus, SplitSquareHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getMarkdownImagePasteResult, hasClipboardImage } from '@/lib/clipboard-image'
import { buildMarkdownBlockIndex } from '@/lib/ai-doc-chat'
import { getGitMarkdownImagePasteResult } from '@/lib/git-asset-paste'
import {
  buildGitImageRuntimeConfig,
  collectGitAssetMap,
  prepareGitHtmlImageSources,
  resolveGitHtmlImageSources,
} from '@/lib/git-image-resolution'
import { toast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'

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

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function injectPreviewBlockAttributes(markdown: string, html: string) {
  const blocks = buildMarkdownBlockIndex(markdown)
  const eligibleBlocks = blocks.filter((block) =>
    ['heading', 'paragraph', 'list', 'table', 'code', 'image'].includes(block.blockType)
  )

  if (!eligibleBlocks.length) {
    return html
  }

  const tagRegex = /<(h[1-6]|p|ul|ol|blockquote|pre|table|img)(\s|>)/gi
  let matchIndex = 0

  return html.replace(tagRegex, (match, tagName, suffix) => {
    const block = eligibleBlocks[matchIndex]
    matchIndex += 1

    if (!block) {
      return match
    }

    return `<${tagName} data-ai-block-index="${block.blockIndex}" data-ai-block-type="${escapeHtmlAttribute(block.blockType)}"${suffix}`
  })
}

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
  const { document, updateFromMarkdown } = useDocumentStore()
  const addEditorSelectionReference = useAiChatStore((state) => state.addEditorSelectionReference)
  const addPreviewReference = useAiChatStore((state) => state.addPreviewReference)
  const selectionCandidate = useAiChatStore((state) => state.selectionCandidate)
  const selectionHint = useAiChatStore((state) => state.selectionHint)
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
  const stagedChanges = useGitStore((state) => state.stagedChanges)
  const pendingAssetChanges = useGitStore((state) => state.pendingAssetChanges)
  const { theme, getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  const [mode, setMode] = useState<PreviewMode>('preview')
  const [html, setHtml] = useState('')
  const [editContent, setEditContent] = useState('')
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const liveEditorRef = useRef<HTMLTextAreaElement | null>(null)
  const previewContainerRef = useRef<HTMLDivElement | null>(null)
  const livePreviewRef = useRef<HTMLDivElement | null>(null)
  const isSyncingLiveScrollRef = useRef(false)
  const previousDocumentKeyRef = useRef<string>('')
  const skipLiveSyncRef = useRef(false)
  const gitImageCacheRef = useRef<Map<string, string>>(new Map())
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const { t, currentLanguage } = useTranslation()

  useEffect(() => {
    setMounted(true)
  }, [])

  const activeGitFileKind =
    activeTab?.sourceType === 'git' && activeTab.gitMeta?.path
      ? activeTab.gitMeta.fileKind || inferGitFileKind(activeTab.gitMeta.path)
      : 'text'
  const isActiveBinaryGitTab =
    activeTab?.sourceType === 'git' && isGitBinaryFileKind(activeGitFileKind)

  // 从Store获取当前Markdown
  const markdown = useDocumentStore.getState().getCurrentMarkdown()
  const isEditingMode = mode === 'edit' || mode === 'live'
  const renderMarkdown = mode === 'live' ? editContent : markdown
  const documentKey = `${activeTabId || ''}\u0000${document?.fileId || ''}\u0000${document?.fileName || ''}`
  const selectedReferences = useMemo(
    () => {
      const currentReferences = currentConversationId ? referencesByConversation[currentConversationId] || [] : []
      return currentReferences.filter((reference) => selectedReferenceIds.includes(reference.id))
    },
    [currentConversationId, referencesByConversation, selectedReferenceIds]
  )

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
      
      const rawHtml = injectPreviewBlockAttributes(renderMarkdown, String(result))
      const immediateHtml = activeGitMeta?.path
        ? prepareGitHtmlImageSources(rawHtml, activeGitMeta.path, gitAssets)
        : rawHtml
      if (!cancelled) {
        setHtml(immediateHtml)
      }

      void resolveGitImageSources(immediateHtml).then((resolvedHtml) => {
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
  }, [activeGitMeta?.path, gitAssets, renderMarkdown, resolveGitImageSources])

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

  const handleAddTextareaSelection = useCallback((textarea: HTMLTextAreaElement | null, sourceMarkdown: string) => {
    if (!textarea) return
    const selectionStart = textarea.selectionStart ?? 0
    const selectionEnd = textarea.selectionEnd ?? 0
    if (selectionStart === selectionEnd) return
    if (sourceMarkdown !== useDocumentStore.getState().getCurrentMarkdown()) {
      updateFromMarkdown(sourceMarkdown)
    }
    void addEditorSelectionReference(
      selectionStart,
      selectionEnd,
      sourceMarkdown
    )
  }, [addEditorSelectionReference, updateFromMarkdown])

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
      : await getMarkdownImagePasteResult({
          clipboardData: e.clipboardData,
          value: sourceValue,
          selectionStart,
          selectionEnd,
        })

    if (!result) return

    setEditContent(result.nextValue)
    if (mode === 'live') {
      updateFromMarkdown(result.nextValue)
    }

    if (isGitTab) {
      persistGitDraftAfterPaste(result.nextValue)
    }

    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }, [mode, persistGitDraftAfterPaste, updateFromMarkdown])

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

  useEffect(() => {
    const rootNodes = [previewContainerRef.current, livePreviewRef.current]

    rootNodes.forEach((rootNode) => {
      if (!rootNode) return
      const blockNodes = rootNode.querySelectorAll<HTMLElement>('[data-ai-block-index]')
      blockNodes.forEach((node) => {
        const blockIndexValue = node.dataset.aiBlockIndex
        const blockIndex = blockIndexValue ? Number(blockIndexValue) : NaN
        if (!Number.isFinite(blockIndex)) return

        const isCandidate =
          !!selectionCandidate &&
          blockIndex >= selectionCandidate.startBlockIndex &&
          blockIndex < selectionCandidate.startBlockIndex + selectionCandidate.blockCount
        const isSelected = selectedReferences.some(
          (reference) =>
            blockIndex >= reference.startBlockIndex &&
            blockIndex < reference.startBlockIndex + reference.blockCount
        )

        node.style.transition = 'background-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease'
        node.style.borderRadius = '10px'
        node.style.boxShadow = 'none'
        node.style.backgroundColor = 'transparent'
        node.style.opacity = '1'

        if (isSelected) {
          node.style.backgroundColor = `${themeConfig.primary}12`
          node.style.boxShadow = `inset 0 0 0 1px ${themeConfig.primary}30`
        }

        if (isCandidate) {
          node.style.backgroundColor = `${themeConfig.primary}18`
          node.style.boxShadow = `inset 0 0 0 1px ${themeConfig.primary}55`
        }
      })
    })

    return () => {
      rootNodes.forEach((rootNode) => {
        if (!rootNode) return
        const blockNodes = rootNode.querySelectorAll<HTMLElement>('[data-ai-block-index]')
        blockNodes.forEach((node) => {
          node.style.backgroundColor = ''
          node.style.boxShadow = ''
          node.style.opacity = ''
          node.style.borderRadius = ''
          node.style.transition = ''
        })
      })
    }
  }, [html, selectedReferences, selectionCandidate, themeConfig.primary])

  useEffect(() => {
    if (!selectionCandidate) {
      return
    }

    const applySelection = (textarea: HTMLTextAreaElement | null) => {
      if (!textarea) return
      textarea.setSelectionRange(selectionCandidate.startOffset, selectionCandidate.endOffset)
    }

    if (mode === 'edit') {
      applySelection(editTextareaRef.current)
      return
    }

    if (mode === 'live') {
      applySelection(liveEditorRef.current)
    }
  }, [mode, selectionCandidate])

  const handlePreviewClickCapture = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement | null
    if (!target) return

    const blockElement = target.closest<HTMLElement>('[data-ai-block-index]')
    if (!blockElement) return

    const blockIndexValue = blockElement.dataset.aiBlockIndex
    const blockIndex = blockIndexValue ? Number(blockIndexValue) : NaN
    if (!Number.isFinite(blockIndex)) return

    const tagName = blockElement.tagName?.toLowerCase()
    const text =
      tagName === 'img'
        ? blockElement.getAttribute('alt')?.trim() || 'image'
        : blockElement.innerText?.trim()

    if (!text) return
    void addPreviewReference(text, tagName, blockIndex)
  }, [addPreviewReference])

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
      </div>

      {/* 内容区域 */}
      <div className="relative flex flex-1 overflow-hidden">
        {(selectionCandidate || selectionHint) && (
          <div
            className="absolute left-5 right-5 top-5 z-20 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-sm"
            style={{
              borderColor: themeConfig.border,
              backgroundColor: themeConfig.card,
            }}
          >
            <div className="min-w-0 text-sm" style={{ color: themeConfig.textMuted }}>
              {selectionCandidate
                ? selectionHint || (
                    currentLanguage === 'zh'
                      ? '已选择段落，点击加入对话或按 Ctrl+L'
                      : 'Block selected. Add to chat or press Ctrl+L'
                  )
                : selectionHint}
            </div>
            {selectionCandidate && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 rounded-full px-3 hover:bg-transparent focus-visible:ring-0"
                  style={{
                    color: themeConfig.textMuted,
                    backgroundColor: 'transparent',
                  }}
                  onClick={() => clearSelectionCandidate()}
                >
                  <X className="mr-1 h-4 w-4" />
                  {currentLanguage === 'zh' ? '取消' : 'Dismiss'}
                </Button>
                <Button
                  type="button"
                  className="h-9 rounded-full px-4 shadow-none hover:opacity-90"
                  style={{
                    backgroundColor: `${themeConfig.primary}14`,
                    color: themeConfig.primary,
                  }}
                  onClick={() => void commitSelectionCandidate()}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {currentLanguage === 'zh' ? '加入对话' : 'Add to chat'}
                </Button>
              </div>
            )}
          </div>
        )}

        {mode === 'preview' && (
          <div ref={previewContainerRef} className="h-full w-full overflow-y-auto overflow-x-hidden">
            <div className="max-w-none p-8">
              <style>{getThemeStyles(theme)}</style>
              <article
                className="markdown-body max-w-none"
                onClick={handlePreviewClickCapture}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          </div>
        )}

        {mode === 'edit' && (
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
            onMouseUp={(event) => handleAddTextareaSelection(event.currentTarget, editContent)}
            onKeyUp={(event) => handleAddTextareaSelection(event.currentTarget, editContent)}
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
                onMouseUp={(event) => handleAddTextareaSelection(event.currentTarget, editContent)}
                onKeyUp={(event) => handleAddTextareaSelection(event.currentTarget, editContent)}
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
                  onClick={handlePreviewClickCapture}
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
