'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCheck, GitCompareArrows } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useTranslation } from '@/stores/languageStore'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { mergeGitText } from '@/lib/git/merge'
import type { GitDraftFile } from '@/lib/git/types'

type GitConflictViewProps = {
  draft: GitDraftFile
  pendingConflictCount?: number
  onUseLocal: () => void | Promise<void>
  onUseRemote: () => void | Promise<void>
  onApplyMerged: (content: string) => void | Promise<void>
}

type PaneKey = 'local' | 'merged' | 'remote'

export function GitConflictView({
  draft,
  pendingConflictCount = 1,
  onUseLocal,
  onUseRemote,
  onApplyMerged,
}: GitConflictViewProps) {
  const { t } = useTranslation()
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig() || themeConfigs.light
  const snapshot = draft.conflictSnapshot ?? {
    baseContent: draft.originalContent || '',
    localContent: draft.draftContent || '',
    remoteContent: draft.remoteContent || '',
    resolvedContent: draft.conflictResolvedContent,
  }
  const baseContent = snapshot.baseContent || ''
  const localContent = snapshot.localContent || ''
  const remoteContent = snapshot.remoteContent || ''
  const conflictKind = snapshot.kind || 'content'
  const isPathConflict = conflictKind === 'path'
  const isDeleteLikeConflict = conflictKind === 'modify-delete' || conflictKind === 'rename'
  const mergeResult = useMemo(
    () => mergeGitText(baseContent, localContent, remoteContent),
    [baseContent, localContent, remoteContent]
  )
  const initialMergedContent = useMemo(
    () => snapshot.resolvedContent ?? mergeResult.mergedText,
    [mergeResult.mergedText, snapshot.resolvedContent]
  )

  const [mergedContent, setMergedContent] = useState(initialMergedContent)
  const localRef = useRef<HTMLTextAreaElement | null>(null)
  const mergedRef = useRef<HTMLTextAreaElement | null>(null)
  const remoteRef = useRef<HTMLTextAreaElement | null>(null)
  const syncingScrollRef = useRef(false)

  useEffect(() => {
    setMergedContent(initialMergedContent)
  }, [draft.documentId, initialMergedContent])

  const getPaneRef = useCallback((key: PaneKey) => {
    if (key === 'local') return localRef
    if (key === 'merged') return mergedRef
    return remoteRef
  }, [])

  const syncPaneScroll = useCallback((sourceKey: PaneKey) => {
    if (syncingScrollRef.current) {
      return
    }

    const source = getPaneRef(sourceKey).current
    if (!source) {
      return
    }

    syncingScrollRef.current = true
    const nextTop = source.scrollTop
    const nextLeft = source.scrollLeft

    ;(['local', 'merged', 'remote'] as PaneKey[]).forEach((paneKey) => {
      if (paneKey === sourceKey) {
        return
      }

      const target = getPaneRef(paneKey).current
      if (!target) {
        return
      }

      target.scrollTop = nextTop
      target.scrollLeft = nextLeft
    })

    requestAnimationFrame(() => {
      syncingScrollRef.current = false
    })
  }, [getPaneRef])

  const hasRemoteVersion = !isPathConflict && (remoteContent.length > 0 || draft.remoteSha !== undefined)
  const mergedConflictCount = mergeResult.conflictBlocks.length
  const requiresManualReview =
    isPathConflict ||
    isDeleteLikeConflict ||
    mergeResult.hasConflicts
  const conflictHint = isPathConflict
    ? `${t('git.mergePathConflictHint')}${snapshot.pathHint ? ` (${snapshot.pathHint})` : ''}`
    : isDeleteLikeConflict
      ? t('git.mergeModifyDeleteHint')
      : mergeResult.hasConflicts
        ? t('git.mergeConflictHint')
        : t('git.mergeAutoResolvedHint')
  const conflictPathRows = [
    { label: t('git.conflictCurrentPath'), value: draft.path },
    isPathConflict && snapshot.pathHint
      ? { label: t('git.conflictRemoteTarget'), value: snapshot.pathHint }
      : null,
  ].filter((row): row is { label: string; value: string } => !!row && !!row.value)

  const paneClassName =
    'h-full min-h-0 w-full resize-none rounded-none border-0 bg-transparent px-4 py-4 font-mono text-[13px] leading-6 shadow-none focus-visible:ring-0'
  const secondaryButtonStyle = {
    backgroundColor: themeConfig.buttonSecondaryBg,
    borderColor: themeConfig.border,
    color: themeConfig.heading,
  } satisfies React.CSSProperties
  const primaryButtonStyle = {
    backgroundColor: themeConfig.primary,
    borderColor: themeConfig.primary,
    color: themeConfig.buttonText,
  } satisfies React.CSSProperties

  const renderPane = (
    key: PaneKey,
    title: string,
    value: string,
    options?: {
      readOnly?: boolean
      subtitle?: string
      emptyText?: string
      onChange?: (value: string) => void
    }
  ) => {
    const paneRef = getPaneRef(key)
    return (
      <section
        className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r last:border-r-0"
        style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.card }}
      >
        <div
          className="flex items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: themeConfig.border }}
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold" style={{ color: themeConfig.heading }}>
              {title}
            </div>
            {options?.subtitle ? (
              <div className="mt-1 text-xs" style={{ color: themeConfig.muted }}>
                {options.subtitle}
              </div>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden" style={{ backgroundColor: themeConfig.background }}>
          <Textarea
            ref={paneRef}
            value={value || options?.emptyText || ''}
            readOnly={options?.readOnly ?? false}
            spellCheck={false}
            wrap="off"
            onScroll={() => syncPaneScroll(key)}
            onChange={(event) => options?.onChange?.(event.target.value)}
            className={paneClassName}
            style={{
              color: themeConfig.text,
              caretColor: options?.readOnly ? 'transparent' : themeConfig.text,
            }}
          />
        </div>
      </section>
    )
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden"
      style={{ backgroundColor: themeConfig.background }}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-4 border-b px-4 py-3"
        style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.card }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <GitCompareArrows className="h-4 w-4" style={{ color: themeConfig.warning }} />
            <span className="text-sm font-semibold" style={{ color: themeConfig.heading }}>
              {t('git.conflictDetected')}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{
                color: requiresManualReview ? themeConfig.danger : themeConfig.success,
                backgroundColor: `${requiresManualReview ? themeConfig.danger : themeConfig.success}15`,
              }}
            >
              {requiresManualReview ? t('git.mergeNeedsReview') : t('git.mergeAutoResolved')}
            </span>
          </div>
          <div className="mt-1 truncate text-sm" style={{ color: themeConfig.text }}>
            {draft.name}
          </div>
          <div className="mt-1 text-xs" style={{ color: themeConfig.muted }}>
            {pendingConflictCount > 1
              ? `${pendingConflictCount} ${t('git.mergeNeedsReview')}`
              : conflictHint}
          </div>
          {conflictPathRows.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {conflictPathRows.map((row) => (
                <div
                  key={`${row.label}:${row.value}`}
                  className="flex items-center gap-2 rounded-md border px-2.5 py-1 text-[11px]"
                  style={{
                    borderColor: themeConfig.border,
                    backgroundColor: themeConfig.background,
                    color: themeConfig.text,
                  }}
                >
                  <span style={{ color: themeConfig.muted }}>{row.label}</span>
                  <span className="font-mono">{row.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMergedContent(mergeResult.mergedText)}
            style={secondaryButtonStyle}
          >
            {t('git.mergeAutoResolved')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onUseLocal}
            style={secondaryButtonStyle}
          >
            {t('git.acceptLocal')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onUseRemote}
            style={secondaryButtonStyle}
          >
            {t('git.acceptRemote')}
          </Button>
          <Button
            size="sm"
            onClick={() => onApplyMerged(mergedContent)}
            style={primaryButtonStyle}
          >
            {t('git.applyMerged')}
          </Button>
        </div>
      </div>

      <div
        className="grid min-h-0 flex-1 grid-cols-1 divide-y xl:grid-cols-3 xl:divide-x xl:divide-y-0"
        style={{ borderColor: themeConfig.border }}
      >
        {renderPane('local', t('git.localVersion'), localContent, {
          readOnly: true,
          subtitle: t('git.localChangesPreserved'),
          emptyText: t('git.noMeaningfulDiff'),
        })}

        {renderPane('merged', t('git.mergeResult'), mergedContent, {
          subtitle: mergeResult.hasConflicts
            ? `${mergedConflictCount} ${t('git.mergeNeedsReview')}`
            : t('git.mergeAutoResolved'),
          onChange: setMergedContent,
        })}

        {renderPane('remote', t('git.remoteVersion'), hasRemoteVersion ? remoteContent : '', {
          readOnly: true,
          subtitle: hasRemoteVersion ? t('git.remoteUpdated') : t('git.remoteContentUnavailable'),
          emptyText: t('git.remoteContentUnavailable'),
        })}
      </div>

      <div
        className="flex shrink-0 items-center justify-between gap-3 border-t px-4 py-2 text-xs"
        style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.card, color: themeConfig.muted }}
      >
        <div className="flex items-center gap-2">
          <CheckCheck className="h-3.5 w-3.5" />
          <span>{t('git.mergeStrategyTitle')}</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle
            className="h-3.5 w-3.5"
            style={{ color: requiresManualReview ? themeConfig.danger : themeConfig.success }}
          />
          <span>
            {requiresManualReview ? t('git.mergeStrategyConflict') : t('git.mergeStrategyClean')}
          </span>
        </div>
      </div>
    </div>
  )
}
