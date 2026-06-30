'use client'

import { useMemo, useState } from 'react'
import { createTwoFilesPatch } from 'diff'
import { Diff, Hunk, parseDiff } from 'react-diff-view'
import 'react-diff-view/style/index.css'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useTranslation } from '@/stores/languageStore'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import type { GitDraftFile } from '@/lib/git/types'

type GitConflictViewProps = {
  draft: GitDraftFile
  onUseLocal: () => void
  onUseRemote: () => void
  onApplyMerged: (content: string) => void
}

export function GitConflictView({
  draft,
  onUseLocal,
  onUseRemote,
  onApplyMerged,
}: GitConflictViewProps) {
  const { t } = useTranslation()
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig() || themeConfigs.light
  const baseContent = draft.originalContent || ''
  const localContent = draft.draftContent || ''
  const remoteContent = draft.remoteContent || ''
  const initialMergedContent = useMemo(() => {
    if (draft.conflictResolvedContent !== undefined) {
      return draft.conflictResolvedContent
    }

    if (!remoteContent || remoteContent === baseContent) {
      return localContent
    }

    if (localContent === baseContent) {
      return remoteContent
    }

    return `<<<<<<< LOCAL
${localContent}
=======
${remoteContent}
>>>>>>> REMOTE`
  }, [baseContent, draft.conflictResolvedContent, localContent, remoteContent])
  const [mergedContent, setMergedContent] = useState(initialMergedContent)

  const diffFiles = useMemo(() => {
    const patch = createTwoFilesPatch(
      `${draft.name} (base)`,
      `${draft.name} (remote)`,
      baseContent,
      remoteContent,
      'base',
      'remote',
      { context: 3 }
    )

    try {
      const parsed = parseDiff(patch, { nearbySequences: 'zip' })
      return Array.isArray(parsed)
        ? parsed.filter((file) => Array.isArray(file?.hunks))
        : []
    } catch {
      return []
    }
  }, [baseContent, draft.name, remoteContent])

  const hasRemoteVersion = remoteContent.length > 0 || draft.remoteSha !== undefined

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      style={{ backgroundColor: themeConfig.background }}
    >
      <div
        className="border-b px-5 py-4"
        style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.card }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: themeConfig.heading }}>
              <AlertTriangle className="h-4 w-4" style={{ color: themeConfig.danger }} />
              <span>{t('git.conflictDetected')}</span>
            </div>
            <div className="mt-1 text-sm" style={{ color: themeConfig.text }}>
              {draft.name}
            </div>
            <div className="mt-1 text-xs" style={{ color: themeConfig.muted }}>
              {t('git.localChangesPreserved')}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={onUseRemote}>
              {t('git.acceptRemote')}
            </Button>
            <Button variant="outline" size="sm" onClick={onUseLocal}>
              {t('git.acceptLocal')}
            </Button>
            <Button size="sm" onClick={() => onApplyMerged(mergedContent)}>
              {t('git.applyMerged')}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-0">
        <div
          className="min-h-0 overflow-auto border-r"
          style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.card }}
        >
          <div className="border-b px-4 py-3 text-sm font-medium" style={{ borderColor: themeConfig.border, color: themeConfig.heading }}>
            {t('git.remoteDiff')}
          </div>
          <div className="p-4">
            {diffFiles.length ? diffFiles.map((file) => (
              <Diff
                key={`${file.oldRevision}-${file.newRevision}`}
                viewType="split"
                diffType={file.type}
                hunks={file.hunks}
              >
                {(hunks) => hunks.map((hunk) => (
                  <Hunk key={hunk.content} hunk={hunk} />
                ))}
              </Diff>
            )) : (
              <div className="text-sm" style={{ color: themeConfig.muted }}>
                {t('git.remoteUpToDate')}
              </div>
            )}

            <div className="mt-4 rounded-md border p-3" style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.background }}>
              <div className="mb-2 text-xs font-medium" style={{ color: themeConfig.muted }}>
                Remote
              </div>
              <div className="max-h-[320px] overflow-auto whitespace-pre-wrap text-sm" style={{ color: themeConfig.text }}>
                {hasRemoteVersion ? remoteContent : 'Remote content unavailable'}
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 overflow-hidden" style={{ backgroundColor: themeConfig.card }}>
          <div className="border-b px-4 py-3 text-sm font-medium" style={{ borderColor: themeConfig.border, color: themeConfig.heading }}>
            {t('git.mergeResult')}
          </div>
          <div className="grid h-[calc(100%-49px)] min-h-0 grid-rows-[1fr_1fr]">
            <div className="min-h-0 border-b p-3" style={{ borderColor: themeConfig.border }}>
              <div className="mb-2 text-xs font-medium" style={{ color: themeConfig.muted }}>
                {t('git.localVersion')}
              </div>
              <div
                className="h-full overflow-auto rounded-md border p-3 text-sm whitespace-pre-wrap"
                style={{
                  borderColor: themeConfig.border,
                  backgroundColor: themeConfig.background,
                  color: themeConfig.text,
                }}
              >
                {localContent}
              </div>
            </div>
            <div className="min-h-0 p-3">
              <div className="mb-2 text-xs font-medium" style={{ color: themeConfig.muted }}>
                {t('git.mergeResult')}
              </div>
              <Textarea
                value={mergedContent}
                onChange={(event) => setMergedContent(event.target.value)}
                className="h-[calc(100%-24px)] resize-none"
                style={{
                  backgroundColor: themeConfig.background,
                  borderColor: themeConfig.border,
                  color: themeConfig.text,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
