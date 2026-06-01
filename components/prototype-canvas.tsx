'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronRight, LayoutTemplate, MousePointerClick, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { themeConfigs, useThemeStore } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { useTabsStore } from '@/stores/tabsStore'
import { useGitStore } from '@/stores/gitStore'
import type { DocumentState } from '@/types/tree'
import {
  parseDocumentToPrototype,
  parseInlineSegments,
  type PrototypeBlock,
  type PrototypeDocument,
  type PrototypeInlineSegment,
  type PrototypeMarkdownBlock,
  type PrototypeSection,
} from '@/lib/prototype-parser'
import { getGitProviderClient } from '@/lib/git/providers'
import { joinGitPath, normalizeGitPath } from '@/lib/git/utils'
import { decryptSecret } from '@/lib/secret-storage'

interface PrototypeCanvasProps {
  document: DocumentState | null
  compact?: boolean
}

interface DialogState {
  title: string
  description: string
}

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
}

function isExternalLikeImageSource(src: string) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(src)
}

function safeDecodeUriPath(path: string) {
  try {
    return decodeURI(path)
  } catch {
    return path
  }
}

function normalizeRepoRelativePath(path: string) {
  const stack: string[] = []
  for (const segment of path.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      stack.pop()
      continue
    }
    stack.push(segment)
  }
  return stack.join('/')
}

function resolveGitImageRepoPath(markdownPath: string, rawSrc: string) {
  const trimmed = rawSrc.trim()
  if (!trimmed || isExternalLikeImageSource(trimmed)) {
    return null
  }

  const withoutHash = trimmed.split('#')[0] || ''
  const rawPath = withoutHash.split('?')[0] || ''
  const decodedPath = safeDecodeUriPath(rawPath)
  if (!decodedPath) {
    return null
  }

  if (decodedPath.startsWith('/')) {
    return normalizeRepoRelativePath(decodedPath.slice(1))
  }

  const normalizedMarkdownPath = normalizeGitPath(markdownPath)
  const markdownDir = normalizedMarkdownPath.includes('/')
    ? normalizedMarkdownPath.split('/').slice(0, -1).join('/')
    : ''
  const joinedPath = markdownDir ? joinGitPath(markdownDir, decodedPath) : normalizeGitPath(decodedPath)

  return normalizeRepoRelativePath(joinedPath)
}

function inferImageMimeType(repoPath: string, mimeType?: string) {
  if (mimeType?.startsWith('image/')) {
    return mimeType
  }
  const extension = repoPath.split('.').pop()?.toLowerCase() || ''
  return IMAGE_MIME_BY_EXTENSION[extension] || 'application/octet-stream'
}

function collectBlockDefaults(
  blocks: PrototypeBlock[],
  fields: Record<string, string>,
  toggles: Record<string, boolean>,
  checklists: Record<string, boolean[]>,
  tabs: Record<string, string>
) {
  for (const block of blocks) {
    if (block.type === 'input' || block.type === 'textarea') {
      fields[block.id] = fields[block.id] ?? ''
    }
    if (block.type === 'toggle') {
      toggles[block.id] = block.checked
    }
    if (block.type === 'tabs' && block.items.length > 0) {
      tabs[block.id] = block.items[0]
    }
    if (block.type === 'markdown' && block.block.type === 'checklist') {
      checklists[block.id] = block.block.items.map((item) => item.checked)
    }
  }
}

function collectDefaults(
  prototype: PrototypeDocument
): {
  fields: Record<string, string>
  toggles: Record<string, boolean>
  checklists: Record<string, boolean[]>
  tabs: Record<string, string>
} {
  const fields: Record<string, string> = {}
  const toggles: Record<string, boolean> = {}
  const checklists: Record<string, boolean[]> = {}
  const tabs: Record<string, string> = {}

  const visit = (section: PrototypeSection) => {
    collectBlockDefaults(section.blocks, fields, toggles, checklists, tabs)
    section.children.forEach(visit)
  }

  collectBlockDefaults(prototype.rootBlocks, fields, toggles, checklists, tabs)
  prototype.sections.forEach(visit)

  return { fields, toggles, checklists, tabs }
}

function renderInlineSegments(
  segments: PrototypeInlineSegment[],
  resolveImageSrc?: (src: string) => string | null
) {
  return segments.map((segment, index) => {
    const imageSrc = segment.imageSrc ? (resolveImageSrc?.(segment.imageSrc) || segment.imageSrc) : undefined
    const content = segment.imageSrc ? (
      <img
        key={index}
        src={imageSrc}
        alt={segment.text}
        className="my-3 max-h-80 max-w-full rounded-xl border object-contain"
      />
    ) : segment.code ? (
      <code
        className="rounded-md border px-1.5 py-0.5 text-[0.9em]"
        key={index}
      >
        {segment.text}
      </code>
    ) : segment.bold ? (
      <strong key={index}>{segment.text}</strong>
    ) : segment.italic ? (
      <em key={index}>{segment.text}</em>
    ) : (
      <span key={index}>{segment.text}</span>
    )

    return content
  })
}

export function PrototypeCanvas({ document, compact = false }: PrototypeCanvasProps) {
  const [mounted, setMounted] = useState(false)
  const { getThemeConfig } = useThemeStore()
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const { currentLanguage } = useTranslation()
  const activeGitMeta = useTabsStore((state) => {
    const activeTab = state.tabs.find((item) => item.id === state.activeTabId)
    if (!activeTab || activeTab.sourceType !== 'git' || !activeTab.gitMeta?.path) {
      return null
    }
    return activeTab.gitMeta
  })
  const prototype = useMemo(() => parseDocumentToPrototype(document), [document])
  const [activeSectionId, setActiveSectionId] = useState<string>('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [toggleValues, setToggleValues] = useState<Record<string, boolean>>({})
  const [checklistValues, setChecklistValues] = useState<Record<string, boolean[]>>({})
  const [tabValues, setTabValues] = useState<Record<string, string>>({})
  const [lastAction, setLastAction] = useState<string>('')
  const [dialogState, setDialogState] = useState<DialogState | null>(null)
  const [resolvedImageMap, setResolvedImageMap] = useState<Record<string, string>>({})

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!prototype) {
      setActiveSectionId('')
      setFieldValues({})
      setToggleValues({})
      setChecklistValues({})
      setTabValues({})
      setLastAction('')
      setResolvedImageMap({})
      return
    }

    const defaults = collectDefaults(prototype)
    setFieldValues(defaults.fields)
    setToggleValues(defaults.toggles)
    setChecklistValues(defaults.checklists)
    setTabValues(defaults.tabs)
    setActiveSectionId(prototype.sections[0]?.id || '')
    setLastAction('')
    setResolvedImageMap({})
  }, [prototype])

  useEffect(() => {
    if (!prototype || !activeGitMeta?.path) {
      return
    }

    const imageSources = new Set<string>()
    const collectFromSegments = (segments: PrototypeInlineSegment[]) => {
      for (const segment of segments) {
        if (segment.imageSrc) {
          imageSources.add(segment.imageSrc)
        }
      }
    }
    const collectFromBlocks = (blocks: PrototypeBlock[]) => {
      for (const block of blocks) {
        if (block.type === 'note') {
          collectFromSegments(block.content)
          continue
        }
        if (block.type !== 'markdown') {
          continue
        }
        if (block.block.type === 'paragraph' || block.block.type === 'blockquote') {
          collectFromSegments(block.block.segments)
          continue
        }
        if (block.block.type === 'list') {
          block.block.items.forEach(collectFromSegments)
          continue
        }
        if (block.block.type === 'checklist') {
          block.block.items.forEach((item) => collectFromSegments(item.segments))
          continue
        }
        if (block.block.type === 'table') {
          block.block.rows.forEach((row) => {
            row.cells.forEach((cell) => collectFromSegments(parseInlineSegments(cell)))
          })
        }
      }
    }
    const walkSections = (sections: PrototypeSection[]) => {
      sections.forEach((section) => {
        collectFromBlocks(section.blocks)
        walkSections(section.children)
      })
    }

    collectFromBlocks(prototype.rootBlocks)
    walkSections(prototype.sections)

    const imageSrcList = Array.from(imageSources)
    if (!imageSrcList.length) {
      return
    }

    const gitState = useGitStore.getState()
    const decryptedToken = decryptSecret(gitState.config.token || '')
    if (!decryptedToken) {
      return
    }

    const runtimeConfig = {
      ...gitState.config,
      provider: activeGitMeta.provider,
      ownerOrNamespace: activeGitMeta.ownerOrNamespace,
      repo: activeGitMeta.repo,
      branch: activeGitMeta.branch,
      token: decryptedToken,
    }
    const client = getGitProviderClient(runtimeConfig)
    const getBinaryFile = client.getBinaryFile
    if (!getBinaryFile) {
      return
    }

    let cancelled = false

    void (async () => {
      const resolvedEntries = await Promise.all(imageSrcList.map(async (rawSrc) => {
        const repoPath = resolveGitImageRepoPath(activeGitMeta.path, rawSrc)
        if (!repoPath) {
          return null
        }

        try {
          const binary = await getBinaryFile(runtimeConfig, repoPath)
          if (!binary?.contentBase64) {
            return null
          }
          const mimeType = inferImageMimeType(repoPath, binary.mimeType)
          return [rawSrc, `data:${mimeType};base64,${binary.contentBase64}`] as const
        } catch {
          return null
        }
      }))

      if (cancelled) {
        return
      }

      const nextMap: Record<string, string> = {}
      for (const entry of resolvedEntries) {
        if (!entry) continue
        nextMap[entry[0]] = entry[1]
      }
      if (Object.keys(nextMap).length === 0) {
        return
      }

      setResolvedImageMap((current) => ({ ...current, ...nextMap }))
    })()

    return () => {
      cancelled = true
    }
  }, [activeGitMeta, prototype])

  const copy =
    currentLanguage === 'zh'
      ? {
          emptyTitle: '暂无可生成的原型',
          emptyDescription: '先创建一个 Markdown 文档，原型视图会根据标题结构和内容自动生成交互原型。',
          interactive: '交互点',
          live: '实时原型',
          sectionLabel: '场景切换',
          hierarchyLabel: '内容层级',
          lastAction: '最近交互',
          noAction: '还没有交互，试试按钮、开关、清单或折叠节点。',
          dialogTitle: '原型事件',
          dialogClose: '关闭',
          placeholderInput: '请输入内容',
          checklistDone: '完成',
          childNodes: '子节点',
        }
      : {
          emptyTitle: 'No prototype available',
          emptyDescription: 'Create a Markdown document first. The prototype view will derive an interactive layout from the outline and content.',
          interactive: 'interactive points',
          live: 'live prototype',
          sectionLabel: 'Scenario switcher',
          hierarchyLabel: 'Content hierarchy',
          lastAction: 'Latest interaction',
          noAction: 'No interaction yet. Try buttons, toggles, checklists, or collapsible nodes.',
          dialogTitle: 'Prototype event',
          dialogClose: 'Close',
          placeholderInput: 'Enter content',
          checklistDone: 'Done',
          childNodes: 'children',
        }

  const resolvePrototypeImageSrc = (src: string) => resolvedImageMap[src] || null

  const handleButtonAction = (block: Extract<PrototypeBlock, { type: 'button' }>) => {
    if (block.target && prototype) {
      const targetSection = prototype.sections.find(
        (section) => section.id === block.target || section.title.toLowerCase() === block.target?.toLowerCase()
      )
      if (targetSection) {
        setActiveSectionId(targetSection.id)
      }
    }

    const message = block.action || block.text
    setLastAction(message)

    if (block.dialog) {
      setDialogState({
        title: block.text,
        description: block.dialog,
      })
    }
  }

  const renderMarkdownBlock = (block: PrototypeMarkdownBlock, stateKey: string) => {
    switch (block.type) {
      case 'paragraph':
        return (
          <p key={block.id} className="text-sm leading-7" style={{ color: themeConfig.text }}>
            {renderInlineSegments(block.segments, resolvePrototypeImageSrc)}
          </p>
        )
      case 'blockquote':
        return (
          <blockquote
            key={block.id}
            className="rounded-r-xl border-l-4 px-4 py-3 text-sm"
            style={{
              backgroundColor: `${themeConfig.accent}10`,
              borderLeftColor: themeConfig.primary,
              color: themeConfig.text,
            }}
          >
            {renderInlineSegments(block.segments, resolvePrototypeImageSrc)}
          </blockquote>
        )
      case 'list': {
        const Tag = block.ordered ? 'ol' : 'ul'
        return (
          <Tag
            key={block.id}
            className={`space-y-2 pl-5 text-sm ${block.ordered ? 'list-decimal' : 'list-disc'}`}
            style={{ color: themeConfig.text }}
          >
            {block.items.map((item, index) => (
              <li key={`${block.id}-${index}`}>{renderInlineSegments(item, resolvePrototypeImageSrc)}</li>
            ))}
          </Tag>
        )
      }
      case 'checklist':
        return (
          <div key={block.id} className="space-y-2">
            {block.items.map((item, index) => {
              const checked = checklistValues[stateKey]?.[index] ?? item.checked

              return (
                <button
                  key={`${block.id}-${index}`}
                  type="button"
                  onClick={() => {
                    setChecklistValues((current) => {
                      const next = [...(current[stateKey] || block.items.map((entry) => entry.checked))]
                      next[index] = !checked
                      return { ...current, [stateKey]: next }
                    })
                    setLastAction(item.segments.map((segment) => segment.text).join(''))
                  }}
                  className="flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors"
                  style={{
                    backgroundColor: checked ? `${themeConfig.success}14` : themeConfig.card,
                    borderColor: checked ? `${themeConfig.success}40` : themeConfig.border,
                    color: themeConfig.text,
                  }}
                >
                  <span>{renderInlineSegments(item.segments, resolvePrototypeImageSrc)}</span>
                  {checked && (
                    <span className="flex items-center gap-1 text-xs" style={{ color: themeConfig.success }}>
                      <CheckCircle2 className="h-4 w-4" />
                      {copy.checklistDone}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )
      case 'table':
        return (
          <div key={block.id} className="overflow-x-auto rounded-xl border" style={{ borderColor: themeConfig.border }}>
            <table className="min-w-full border-collapse text-sm">
              <thead style={{ backgroundColor: themeConfig.card }}>
                <tr>
                  {block.headers.map((header, index) => (
                    <th
                      key={`${block.id}-header-${index}`}
                      className="border-b px-4 py-3 text-left font-semibold"
                      style={{ borderColor: themeConfig.border, color: themeConfig.heading }}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={`${block.id}-row-${rowIndex}`}>
                    {row.cells.map((cell, cellIndex) => (
                      <td
                        key={`${block.id}-row-${rowIndex}-cell-${cellIndex}`}
                        className="border-b px-4 py-3 align-top"
                        style={{ borderColor: themeConfig.border, color: themeConfig.text }}
                      >
                        {renderInlineSegments(parseInlineSegments(cell), resolvePrototypeImageSrc)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      case 'code':
        return (
          <div key={block.id} className="overflow-hidden rounded-xl border" style={{ borderColor: themeConfig.border }}>
            {block.language && (
              <div
                className="border-b px-4 py-2 text-xs uppercase tracking-[0.2em]"
                style={{
                  backgroundColor: themeConfig.card,
                  borderColor: themeConfig.border,
                  color: themeConfig.muted,
                }}
              >
                {block.language}
              </div>
            )}
            <pre
              className="overflow-x-auto px-4 py-4 text-sm leading-6"
              style={{
                backgroundColor: themeConfig.input,
                color: themeConfig.text,
              }}
            >
              <code>{block.code}</code>
            </pre>
          </div>
        )
      default:
        return null
    }
  }

  const renderRawContentFallback = (content: string, key: string) => {
    return (
      <pre
        key={key}
        className="overflow-x-auto whitespace-pre-wrap rounded-xl border px-4 py-4 text-sm leading-7"
        style={{
          backgroundColor: themeConfig.input,
          borderColor: themeConfig.border,
          color: themeConfig.text,
        }}
      >
        {content}
      </pre>
    )
  }

  const renderBlock = (block: PrototypeBlock) => {
    switch (block.type) {
      case 'markdown':
        return renderMarkdownBlock(block.block, block.id)
      case 'note':
        return (
          <div
            key={block.id}
            className="rounded-xl border px-4 py-3 text-sm"
            style={{
              backgroundColor: `${themeConfig.accent}10`,
              borderColor: `${themeConfig.accent}30`,
              color: themeConfig.text,
            }}
          >
            {renderInlineSegments(block.content, resolvePrototypeImageSrc)}
          </div>
        )
      case 'input':
        return (
          <div key={block.id} className="space-y-2">
            <label className="text-sm font-medium" style={{ color: themeConfig.heading }}>
              {block.label}
            </label>
            <Input
              type={block.inputType}
              value={fieldValues[block.id] || ''}
              placeholder={block.placeholder || copy.placeholderInput}
              onChange={(event) => {
                const value = event.target.value
                setFieldValues((current) => ({ ...current, [block.id]: value }))
                setLastAction(`${block.label}: ${value}`)
              }}
              style={{
                backgroundColor: themeConfig.input,
                borderColor: themeConfig.border,
                color: themeConfig.text,
              }}
            />
          </div>
        )
      case 'textarea':
        return (
          <div key={block.id} className="space-y-2">
            <label className="text-sm font-medium" style={{ color: themeConfig.heading }}>
              {block.label}
            </label>
            <textarea
              value={fieldValues[block.id] || ''}
              placeholder={block.placeholder || copy.placeholderInput}
              onChange={(event) => {
                const value = event.target.value
                setFieldValues((current) => ({ ...current, [block.id]: value }))
                setLastAction(`${block.label}: ${value}`)
              }}
              className="min-h-28 w-full rounded-xl border px-3 py-3 text-sm outline-none"
              style={{
                backgroundColor: themeConfig.input,
                borderColor: themeConfig.border,
                color: themeConfig.text,
              }}
            />
          </div>
        )
      case 'toggle':
        return (
          <div
            key={block.id}
            className="flex items-center justify-between rounded-xl border px-4 py-3"
            style={{
              backgroundColor: themeConfig.card,
              borderColor: themeConfig.border,
            }}
          >
            <p className="text-sm font-medium" style={{ color: themeConfig.heading }}>
              {block.label}
            </p>
            <Switch
              checked={toggleValues[block.id] ?? block.checked}
              onCheckedChange={(checked) => {
                setToggleValues((current) => ({ ...current, [block.id]: checked }))
                setLastAction(`${block.label}: ${checked}`)
              }}
            />
          </div>
        )
      case 'button':
        return (
          <Button
            key={block.id}
            variant={block.intent === 'secondary' ? 'outline' : 'default'}
            className="w-full sm:w-auto"
            onClick={() => handleButtonAction(block)}
            style={
              block.intent === 'secondary'
                ? {
                    backgroundColor: themeConfig.card,
                    borderColor: themeConfig.border,
                    color: themeConfig.text,
                  }
                : {
                    backgroundColor: themeConfig.primary,
                    color: '#fff',
                  }
            }
          >
            {block.text}
          </Button>
        )
      case 'tabs': {
        const currentValue = tabValues[block.id] || block.items[0] || ''
        if (block.items.length === 0) {
          return null
        }

        return (
          <Tabs
            key={block.id}
            value={currentValue}
            onValueChange={(value) => {
              setTabValues((current) => ({ ...current, [block.id]: value }))
              setLastAction(value)
            }}
            className="gap-4"
          >
            <TabsList
              style={{
                backgroundColor: themeConfig.background,
                border: `1px solid ${themeConfig.border}`,
              }}
            >
              {block.items.map((item) => (
                <TabsTrigger key={item} value={item} style={{ color: themeConfig.text }}>
                  {item}
                </TabsTrigger>
              ))}
            </TabsList>
            {block.items.map((item) => (
              <TabsContent
                key={item}
                value={item}
                className="rounded-xl border px-4 py-3 text-sm"
                style={{
                  backgroundColor: themeConfig.card,
                  borderColor: themeConfig.border,
                  color: themeConfig.text,
                }}
              >
                {item}
              </TabsContent>
            ))}
          </Tabs>
        )
      }
      case 'card':
        return (
          <Card
            key={block.id}
            className="gap-3 py-4"
            style={{
              backgroundColor: themeConfig.card,
              borderColor: themeConfig.border,
            }}
          >
            <CardHeader className="px-4">
              <CardTitle style={{ color: themeConfig.heading }}>{block.title}</CardTitle>
              {block.description && (
                <CardDescription style={{ color: themeConfig.muted }}>{block.description}</CardDescription>
              )}
            </CardHeader>
          </Card>
        )
      case 'stat':
        return (
          <div
            key={block.id}
            className="rounded-2xl border px-4 py-4"
            style={{
              backgroundColor: themeConfig.card,
              borderColor: themeConfig.border,
            }}
          >
            <p className="text-xs uppercase tracking-[0.2em]" style={{ color: themeConfig.muted }}>
              {block.label}
            </p>
            <p className="mt-2 text-2xl font-semibold" style={{ color: themeConfig.heading }}>
              {block.value}
            </p>
          </div>
        )
      default:
        return null
    }
  }

  const renderSectionBody = (section: PrototypeSection) => {
    const hasChildren = section.children.length > 0
    const hasRenderableBlocks = section.blocks.length > 0
    return (
      <div className="space-y-4">
        {hasRenderableBlocks
          ? section.blocks.map(renderBlock)
          : section.rawContent
            ? renderRawContentFallback(section.rawContent, `${section.id}-raw`)
            : null}
        {hasChildren && (
          <Accordion type="multiple" className="rounded-xl border px-4" style={{ borderColor: themeConfig.border }}>
            {section.children.map((child) => (
              <AccordionItem key={child.id} value={child.id} style={{ borderColor: themeConfig.border }}>
                <AccordionTrigger
                  className="py-3 no-underline hover:no-underline"
                  onClick={() => setLastAction(child.title)}
                  style={{ color: themeConfig.heading }}
                >
                  <div className="flex items-center gap-2">
                    <ChevronRight className="h-4 w-4 opacity-0" />
                    <div className="flex flex-col items-start">
                      <span>{child.title}</span>
                      <span className="text-xs font-normal" style={{ color: themeConfig.muted }}>
                        {child.children.length} {copy.childNodes}
                      </span>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-4">
                  {renderSectionBody(child)}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
    )
  }

  const renderSectionTree = (section: PrototypeSection) => {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border px-4 py-4" style={{ backgroundColor: themeConfig.card, borderColor: themeConfig.border }}>
          <div className="mb-4">
            <p className="text-xs uppercase tracking-[0.18em]" style={{ color: themeConfig.muted }}>
              H{section.level}
            </p>
            <h3 className="mt-1 text-lg font-semibold" style={{ color: themeConfig.heading }}>
              {section.title}
            </h3>
          </div>
          {renderSectionBody(section)}
        </div>
      </div>
    )
  }

  if (!prototype) {
    return (
      <div
        className="flex h-full w-full items-center justify-center"
        style={{ backgroundColor: themeConfig.background }}
      >
        <div className="max-w-md text-center">
          <LayoutTemplate className="mx-auto h-10 w-10" style={{ color: themeConfig.muted }} />
          <h3 className="mt-4 text-lg font-semibold" style={{ color: themeConfig.heading }}>
            {copy.emptyTitle}
          </h3>
          <p className="mt-2 text-sm leading-6" style={{ color: themeConfig.muted }}>
            {copy.emptyDescription}
          </p>
        </div>
      </div>
    )
  }

  const activeSection =
    prototype.sections.find((section) => section.id === activeSectionId) || prototype.sections[0] || null

  return (
    <div
      className="h-full w-full overflow-hidden"
      style={{
        backgroundColor: themeConfig.background,
        backgroundImage: `radial-gradient(circle at top left, ${themeConfig.primary}14, transparent 28%), linear-gradient(135deg, ${themeConfig.card} 0%, ${themeConfig.background} 100%)`,
      }}
    >
      <div className="h-full overflow-y-auto px-4 py-5 md:px-6">
        <div className={`mx-auto flex w-full flex-col gap-5 ${compact ? 'max-w-3xl' : 'max-w-5xl'}`}>
          <div
            className="rounded-[28px] border p-5 shadow-xl"
            style={{
              backgroundColor: `${themeConfig.card}f2`,
              borderColor: themeConfig.border,
            }}
          >
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.22em]" style={{ color: themeConfig.muted }}>
                    <Sparkles className="h-4 w-4" />
                    <span>{copy.live}</span>
                  </div>
                  <h1 className="mt-3 text-3xl font-semibold" style={{ color: themeConfig.heading }}>
                    {prototype.title}
                  </h1>
                  {prototype.description && (
                    <p className="mt-2 max-w-2xl text-sm leading-7" style={{ color: themeConfig.muted }}>
                      {prototype.description}
                    </p>
                  )}
                </div>
                <div
                  className="rounded-full border px-3 py-1 text-xs font-medium"
                  style={{
                    backgroundColor: `${themeConfig.primary}10`,
                    borderColor: `${themeConfig.primary}30`,
                    color: themeConfig.primary,
                  }}
                >
                  {prototype.interactiveCount} {copy.interactive}
                </div>
              </div>

              {prototype.rootBlocks.length > 0 && <div className="space-y-4">{prototype.rootBlocks.map(renderBlock)}</div>}

              {prototype.sections.length > 1 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.22em]" style={{ color: themeConfig.muted }}>
                    {copy.sectionLabel}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {prototype.sections.map((section) => (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => {
                          setActiveSectionId(section.id)
                          setLastAction(section.title)
                        }}
                        className="rounded-full border px-4 py-2 text-sm transition-colors"
                        style={{
                          backgroundColor:
                            activeSection?.id === section.id ? `${themeConfig.primary}14` : themeConfig.card,
                          borderColor:
                            activeSection?.id === section.id ? `${themeConfig.primary}40` : themeConfig.border,
                          color: activeSection?.id === section.id ? themeConfig.primary : themeConfig.text,
                        }}
                      >
                        {section.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {activeSection && (
            <Card
              className="gap-5 py-5"
              style={{
                backgroundColor: themeConfig.card,
                borderColor: themeConfig.border,
              }}
            >
              <CardHeader className="px-5">
                <CardTitle style={{ color: themeConfig.heading }}>{copy.hierarchyLabel}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5 px-5">{renderSectionTree(activeSection)}</CardContent>
            </Card>
          )}

          <div
            className="flex items-center gap-3 rounded-2xl border px-4 py-3"
            style={{
              backgroundColor: themeConfig.card,
              borderColor: themeConfig.border,
            }}
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ backgroundColor: `${themeConfig.primary}14`, color: themeConfig.primary }}
            >
              <MousePointerClick className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.18em]" style={{ color: themeConfig.muted }}>
                {copy.lastAction}
              </p>
              <p className="truncate text-sm" style={{ color: themeConfig.text }}>
                {lastAction || copy.noAction}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!dialogState} onOpenChange={(open) => !open && setDialogState(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogState?.title || copy.dialogTitle}</DialogTitle>
            <DialogDescription>{dialogState?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setDialogState(null)}>{copy.dialogClose}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default PrototypeCanvas
