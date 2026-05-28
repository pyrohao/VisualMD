'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { useUnsavedChangesStore } from '@/stores/unsavedChangesStore'

function toAlpha(hex: string, alpha: number) {
  const normalized = hex.replace('#', '')
  const fullHex = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized

  const red = Number.parseInt(fullHex.slice(0, 2), 16)
  const green = Number.parseInt(fullHex.slice(2, 4), 16)
  const blue = Number.parseInt(fullHex.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

export function UnsavedChangesDialog() {
  const { t } = useTranslation()
  const { getThemeConfig } = useThemeStore()
  const { dialogOpen, pendingTargetLabel, confirmSaveAndContinue, discardAndContinue, cancelNavigation } =
    useUnsavedChangesStore()
  const [mounted, setMounted] = useState(false)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light

  useEffect(() => {
    setMounted(true)
  }, [])

  const unsavedLabel = mounted ? t('file.unsavedChanges') : 'Unsaved changes'
  const isEnglish = unsavedLabel === 'Unsaved changes'

  const description = useMemo(() => {
    if (pendingTargetLabel) {
      return isEnglish
        ? `You have unsaved changes. Save them before switching to "${pendingTargetLabel}"?`
        : `当前有未保存的修改。切换到“${pendingTargetLabel}”之前，是否先保存？`
    }

    return isEnglish
      ? 'You have unsaved changes. Save them before continuing?'
      : '当前有未保存的修改。继续之前，是否先保存？'
  }, [isEnglish, pendingTargetLabel])

  const palette = useMemo(() => ({
    surface: themeConfig.card,
    shadow: `0 28px 80px ${toAlpha(themeConfig.heading, 0.18)}`,
    iconBg: toAlpha(themeConfig.warning, 0.12),
    iconBorder: toAlpha(themeConfig.warning, 0.24),
    iconColor: themeConfig.warning,
    closeBg: toAlpha(themeConfig.text, 0.04),
    closeBorder: themeConfig.border,
    cancelBg: themeConfig.input,
    cancelBorder: themeConfig.border,
    discardBg: toAlpha(themeConfig.danger, 0.12),
    discardBorder: toAlpha(themeConfig.danger, 0.28),
    discardText: themeConfig.danger,
    saveShadow: `0 12px 28px ${toAlpha(themeConfig.primary, 0.3)}`,
  }), [themeConfig])

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        if (!open) {
          cancelNavigation()
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="overflow-hidden border p-0 sm:max-w-[540px]"
        style={{
          background: palette.surface,
          borderColor: themeConfig.border,
          boxShadow: palette.shadow,
        }}
      >
        <div className="p-6 sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-4">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border"
                style={{
                  backgroundColor: palette.iconBg,
                  borderColor: palette.iconBorder,
                  color: palette.iconColor,
                }}
              >
                <AlertTriangle className="h-5 w-5" />
              </div>

              <DialogHeader className="min-w-0 gap-2 text-left">
                <DialogTitle className="text-[1.7rem] leading-none" style={{ color: themeConfig.heading }}>
                  {unsavedLabel}
                </DialogTitle>
                <DialogDescription className="leading-6" style={{ color: themeConfig.muted }}>
                  {description}
                </DialogDescription>
              </DialogHeader>
            </div>

            <DialogClose asChild>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors"
                style={{
                  backgroundColor: palette.closeBg,
                  borderColor: palette.closeBorder,
                  color: themeConfig.muted,
                }}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            </DialogClose>
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              variant="outline"
              className="h-10 px-4"
              style={{
                backgroundColor: palette.cancelBg,
                borderColor: palette.cancelBorder,
                color: themeConfig.text,
              }}
              onClick={() => cancelNavigation()}
            >
              {isEnglish ? 'Stay' : '取消'}
            </Button>
            <Button
              variant="outline"
              className="h-10 px-4"
              style={{
                backgroundColor: palette.discardBg,
                borderColor: palette.discardBorder,
                color: palette.discardText,
              }}
              onClick={() => {
                void discardAndContinue()
              }}
            >
              {isEnglish ? 'Discard' : '不保存'}
            </Button>
            <Button
              className="h-10 px-4"
              style={{
                backgroundColor: themeConfig.primary,
                color: themeConfig.buttonText,
                boxShadow: palette.saveShadow,
              }}
              onClick={() => {
                void confirmSaveAndContinue()
              }}
            >
              {isEnglish ? 'Save and Continue' : '保存并继续'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default UnsavedChangesDialog
