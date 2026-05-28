'use client'

import { useDocumentStore } from '@/stores/documentStore'
import { useFileSystemStore } from '@/stores/fileSystemStore'
import { useUnsavedChangesStore } from '@/stores/unsavedChangesStore'
import { useThemeStore, themeConfigs, type ThemeMode } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { useEffect, useState, useCallback, useRef } from 'react'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { BookOpen, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  getMarkdownImagePasteResult,
  hasClipboardImage,
} from '@/lib/clipboard-image'
import { useTabsStore } from '@/stores/tabsStore'
import { useGitStore } from '@/stores/gitStore'
import { joinGitPath, normalizeGitPath } from '@/lib/git/utils'
import { getGitProviderClient } from '@/lib/git/providers'
import { decryptSecret } from '@/lib/secret-storage'
import { getGitMarkdownImagePasteResult } from '@/lib/git-asset-paste'
import { persistActiveTabSave } from '@/lib/editor-persistence'
import type { GitDraftFile, StagedGitChange } from '@/lib/git/types'
import type { Tab } from '@/stores/tabsStore'

type PreviewMode = 'preview' | 'edit'

const previewSanitizeSchema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https', 'data'],
  },
}

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

function removeMetadata(markdown: string) {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, '')
}

function base64ToBlobUrl(contentBase64: string, mimeType: string) {
  const binary = atob(contentBase64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  const blob = new Blob([bytes], { type: mimeType })
  return URL.createObjectURL(blob)
}

function guessMimeType(path: string) {
  const extension = path.split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'bmp':
      return 'image/bmp'
    default:
      return 'application/octet-stream'
  }
}

async function resolveGitImageUrls(
  html: string,
  activeTab: Tab | null,
  currentDraft: GitDraftFile | null,
  stagedChanges: StagedGitChange[]
) {
  if (activeTab?.sourceType !== 'git' || !activeTab.fileId || !activeTab.gitMeta) {
    return { content: html, blobUrls: [] as string[] }
  }

  const config = useGitStore.getState().config
  const runtimeConfig = {
    ...config,
    token: decryptSecret(config.token),
  }
  const client = getGitProviderClient(runtimeConfig)

  const blobUrls: string[] = []
  const cache = new Map<string, string>()
  const stagedAssets = new Map(
    stagedChanges
      .filter((item) => item.kind === 'git-asset' && item.documentId === activeTab.fileId)
      .map((item) => [item.repoPath, item] as const)
  )
  const draftPath = currentDraft?.path || activeTab.gitMeta.path
  const draftDir = draftPath.includes('/')
    ? draftPath.split('/').slice(0, -1).join('/')
    : ''

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const images = Array.from(doc.querySelectorAll('img'))

  for (const image of images) {
    const src = image.getAttribute('src')?.trim() || ''

    if (
      !src ||
      src.startsWith('http://') ||
      src.startsWith('https://') ||
      src.startsWith('data:') ||
      src.startsWith('blob:')
    ) {
      continue
    }

    let decodedSrc = src
    try {
      decodedSrc = decodeURI(src)
    } catch {
      decodedSrc = src
    }

    const repoPath = normalizeGitPath(joinGitPath(draftDir, decodedSrc))
    let blobUrl = cache.get(repoPath)

    if (!blobUrl) {
      const stagedAsset = stagedAssets.get(repoPath)

      if (stagedAsset?.contentBase64) {
        blobUrl = base64ToBlobUrl(stagedAsset.contentBase64, stagedAsset.mimeType || guessMimeType(repoPath))
        cache.set(repoPath, blobUrl)
        blobUrls.push(blobUrl)
      } else {
        if (!client.getBinaryFile) {
          image.setAttribute('data-git-src', repoPath)
          image.setAttribute('src', 'data:,')
          continue
        }

        try {
          const binaryFile = await client.getBinaryFile(runtimeConfig, repoPath)
          blobUrl = base64ToBlobUrl(binaryFile.contentBase64, binaryFile.mimeType || guessMimeType(repoPath))
          cache.set(repoPath, blobUrl)
          blobUrls.push(blobUrl)
        } catch {
          image.setAttribute('data-git-src', repoPath)
          image.setAttribute('src', 'data:,')
          continue
        }
      }
    }

    image.setAttribute('src', blobUrl)
  }

  return { content: doc.body.innerHTML, blobUrls }
}

export function MarkdownPreview() {
  const { document, updateFromMarkdown } = useDocumentStore()
  const { theme, getThemeConfig } = useThemeStore()
  const { tabs, activeTabId } = useTabsStore()
  const { drafts, stagedChanges } = useGitStore()
  const [mounted, setMounted] = useState(false)
  const [mode, setMode] = useState<PreviewMode>('preview')
  const [html, setHtml] = useState('')
  const [editContent, setEditContent] = useState('')
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [previewNonce, setPreviewNonce] = useState(0)
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const { t } = useTranslation()

  useEffect(() => {
    setMounted(true)
  }, [])

  const store = useDocumentStore.getState()
  const markdown = store.getCurrentMarkdown()
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || null
  const currentDraft = activeTab?.sourceType === 'git' && activeTab.fileId
    ? drafts[activeTab.fileId] || null
    : null
  const stagedAssetVersion = activeTab?.fileId
    ? stagedChanges
      .filter((item) => item.kind === 'git-asset' && item.documentId === activeTab.fileId)
      .map((item) => `${item.id}:${item.updatedAt}`)
      .join('|')
    : ''

  useEffect(() => {
    setEditContent(markdown)
  }, [markdown])

  const isEditDirty = mode === 'edit' && editContent !== markdown

  const flushEditBuffer = useCallback((persistLocalSave: boolean) => {
    if (editContent === markdown) return

    updateFromMarkdown(editContent)
    setPreviewNonce((value) => value + 1)

    if (!activeTabId) return

    useTabsStore.getState().updateTabContent(activeTabId, editContent)

    if (activeTab?.sourceType === 'git') {
      useTabsStore.getState().markTabAsModified(activeTabId, true)
      useUnsavedChangesStore.getState().setEditorDirty('markdown-preview', false)
      return
    }

    if (persistLocalSave) {
      persistActiveTabSave()
      useUnsavedChangesStore.getState().setEditorDirty('markdown-preview', false)
    }
  }, [activeTab?.sourceType, activeTabId, editContent, markdown, updateFromMarkdown])

  useEffect(() => {
    useUnsavedChangesStore.getState().registerEditor('markdown-preview', {
      save: () => {
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current)
          autoSaveTimeoutRef.current = null
        }
        flushEditBuffer(false)
      },
      discard: () => {
        if (autoSaveTimeoutRef.current) {
          clearTimeout(autoSaveTimeoutRef.current)
          autoSaveTimeoutRef.current = null
        }
        setEditContent(markdown)
        useUnsavedChangesStore.getState().setEditorDirty('markdown-preview', false)
      },
    })

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
        autoSaveTimeoutRef.current = null
      }
      useUnsavedChangesStore.getState().unregisterEditor('markdown-preview')
    }
  }, [flushEditBuffer, markdown])

  useEffect(() => {
    useUnsavedChangesStore.getState().setEditorDirty('markdown-preview', isEditDirty)

    if (!isEditDirty || !activeTabId) {
      return
    }

    useTabsStore.getState().markTabAsModified(activeTabId, true)

    if (activeTab?.sourceType !== 'git') {
      const { currentFileId, markFileAsModified } = useFileSystemStore.getState()
      if (currentFileId) {
        markFileAsModified(currentFileId)
      }
    }
  }, [activeTab?.sourceType, activeTabId, isEditDirty])

  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
      autoSaveTimeoutRef.current = null
    }

    if (!isEditDirty || mode !== 'edit' || activeTab?.sourceType === 'git') {
      return
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      flushEditBuffer(true)
      autoSaveTimeoutRef.current = null
    }, 1000)

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
        autoSaveTimeoutRef.current = null
      }
    }
  }, [activeTab?.sourceType, flushEditBuffer, isEditDirty, mode])

  useEffect(() => {
    let cancelled = false
    let currentBlobUrls: string[] = []

    const processMarkdown = async () => {
      const markdownResult = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype)
        .use(rehypeSanitize, previewSanitizeSchema)
        .use(rehypeStringify)
        .process(removeMetadata(markdown))

      const { content, blobUrls } = await resolveGitImageUrls(
        String(markdownResult),
        activeTab,
        currentDraft,
        stagedChanges
      )
      currentBlobUrls = blobUrls

      if (cancelled) {
        blobUrls.forEach((url) => URL.revokeObjectURL(url))
        return
      }

      setHtml(content)
    }

    void processMarkdown()

    return () => {
      cancelled = true
      currentBlobUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [
    markdown,
    previewNonce,
    activeTab?.id,
    activeTab?.fileId,
    activeTab?.sourceType,
    activeTab?.gitMeta?.provider,
    activeTab?.gitMeta?.ownerOrNamespace,
    activeTab?.gitMeta?.repo,
    activeTab?.gitMeta?.branch,
    currentDraft?.path,
    currentDraft?.sha,
    stagedAssetVersion,
  ])

  const handleModeChange = useCallback((newMode: PreviewMode) => {
    if (newMode === mode) return

    setIsTransitioning(true)

    if (mode === 'edit' && newMode === 'preview') {
      flushEditBuffer(activeTab?.sourceType !== 'git')
    }

    setTimeout(() => {
      setMode(newMode)
      setIsTransitioning(false)
    }, 150)
  }, [activeTab?.sourceType, flushEditBuffer, mode])

  const handleEditChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value)
  }, [])

  const handleEditPaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!hasClipboardImage(e.clipboardData)) return

    e.preventDefault()

    const target = e.currentTarget
    const activeTab = useTabsStore.getState().getActiveTab()
    const isGitTab = activeTab?.sourceType === 'git' && !!activeTab.fileId

    if (isGitTab && activeTab.fileId) {
      const uploadResult = await getGitMarkdownImagePasteResult({
        documentId: activeTab.fileId,
        clipboardData: e.clipboardData,
        value: editContent,
        selectionStart: target.selectionStart ?? editContent.length,
        selectionEnd: target.selectionEnd ?? editContent.length,
      })
      if (!uploadResult) return

      setEditContent(uploadResult.nextValue)
      updateFromMarkdown(uploadResult.nextValue)
      useGitStore.getState().updateDraftContent(activeTab.fileId, uploadResult.nextValue)
      useTabsStore.getState().updateTabContent(activeTab.id, uploadResult.nextValue)

      window.requestAnimationFrame(() => {
        target.focus()
        target.setSelectionRange(uploadResult.selectionStart, uploadResult.selectionEnd)
      })
      return
    }

    const result = await getMarkdownImagePasteResult({
      clipboardData: e.clipboardData,
      value: editContent,
      selectionStart: target.selectionStart ?? editContent.length,
      selectionEnd: target.selectionEnd ?? editContent.length,
    })

    if (!result) return

    setEditContent(result.nextValue)

    window.requestAnimationFrame(() => {
      target.focus()
      target.setSelectionRange(result.selectionStart, result.selectionEnd)
    })
  }, [editContent, updateFromMarkdown])

  if (!document) {
    return (
      <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.background }}>
        <div className="flex h-14 items-center border-b px-5" style={{ backgroundColor: themeConfig.card, borderColor: themeConfig.border }}>
          <h2 className="text-lg font-semibold" style={{ color: themeConfig.heading }}>{mounted ? t('preview.preview') : 'Document Preview'}</h2>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <p style={{ color: themeConfig.muted }}>{mounted ? t('preview.noContent') : 'No content to preview'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.background }}>
      <div className="flex h-14 items-center justify-between gap-4 border-b px-5" style={{ backgroundColor: themeConfig.card, borderColor: themeConfig.border }}>
        <div className="flex min-w-0 flex-1 items-center">
          <h2 className="flex-shrink-0 whitespace-nowrap text-lg font-semibold" style={{ color: themeConfig.heading }}>
            {mode === 'preview' ? (mounted ? t('preview.preview') : 'Document Preview') : (mounted ? t('preview.edit') : 'Edit Document')}
          </h2>
          <span
            className="ml-3 block min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm"
            style={{ color: themeConfig.muted }}
            title={document.fileName || undefined}
          >
            {document.fileName || (mounted ? t('file.untitled') : 'Untitled')}
          </span>
        </div>

        <div className="flex flex-shrink-0 items-center rounded-lg p-1" style={{ backgroundColor: themeConfig.background }}>
          <button
            onClick={() => handleModeChange('preview')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
              mode === 'preview' ? 'shadow-sm' : 'hover:opacity-80'
            )}
            style={{
              backgroundColor: mode === 'preview' ? themeConfig.card : 'transparent',
              color: mode === 'preview' ? themeConfig.heading : themeConfig.muted,
            }}
            title={mounted ? t('preview.previewMode') : 'Preview mode'}
          >
            <BookOpen className="h-4 w-4" />
            <span>{mounted ? t('preview.read') : 'Read'}</span>
          </button>
          <button
            onClick={() => handleModeChange('edit')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
              mode === 'edit' ? 'shadow-sm' : 'hover:opacity-80'
            )}
            style={{
              backgroundColor: mode === 'edit' ? themeConfig.card : 'transparent',
              color: mode === 'edit' ? themeConfig.heading : themeConfig.muted,
            }}
            title={mounted ? t('preview.editMode') : 'Edit mode'}
          >
            <Pencil className="h-4 w-4" />
            <span>{mounted ? t('preview.edit') : 'Edit'}</span>
          </button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        {mode === 'preview' && !isTransitioning ? (
          <div className="absolute inset-0 overflow-y-auto overflow-x-hidden transition-all duration-200 opacity-100 translate-x-0">
            <div className="max-w-none p-8">
              <style>{getThemeStyles(theme)}</style>
              <article className="markdown-body max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          </div>
        ) : null}

        {mode === 'edit' && !isTransitioning ? (
          <div className="absolute inset-0 transition-all duration-200 opacity-100 translate-x-0">
            <textarea
              value={editContent}
              onChange={handleEditChange}
              onPaste={(e) => {
                void handleEditPaste(e)
              }}
              className="h-full w-full resize-none border-0 p-6 font-mono text-sm outline-none"
              style={{
                backgroundColor: themeConfig.background,
                color: themeConfig.text,
                lineHeight: 1.6,
              }}
              placeholder={mounted ? t('preview.editPlaceholder') : 'Edit Markdown here...'}
              spellCheck={false}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default MarkdownPreview
