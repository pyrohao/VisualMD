'use client'

import { useEffect, useMemo } from 'react'
import {
  AlertCircle,
  ArrowUp,
  Check,
  ChevronLeft,
  MoreHorizontal,
  PencilLine,
  RotateCcw,
  Settings,
  Sparkles,
  X,
} from 'lucide-react'
import { useThemeStore } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { useAiChatStore, type AiReplaceApplyMode } from '@/stores/aiChatStore'
import { useDocumentStore } from '@/stores/documentStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type DockView = 'history' | 'conversation'

interface AiChatDockProps {
  onClose?: () => void
}

const APPLY_MODE_OPTIONS: Array<{ value: AiReplaceApplyMode; label: string }> = [
  { value: 'manual', label: 'manual' },
  { value: 'auto', label: 'auto' },
]

function ActionIcon({
  icon,
  title,
  onClick,
  color,
}: {
  icon: React.ReactNode
  title?: string
  onClick?: () => void
  color: string
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 rounded-md hover:bg-transparent focus-visible:ring-0"
      onClick={onClick}
      title={title}
      style={{ color, backgroundColor: 'transparent' }}
    >
      {icon}
    </Button>
  )
}

export function AiChatDock({ onClose: _onClose }: AiChatDockProps) {
  const { getThemeConfig } = useThemeStore()
  const { currentLanguage } = useTranslation()
  const setActivePanel = useSidebarStore((state) => state.setActivePanel)
  const {
    conversations,
    currentConversationId,
    messagesByConversation,
    referencesByConversation,
    applyMode,
    draftInput,
    selectedReferenceIds,
    pendingReplace,
    isLoading,
    isSending,
    error,
    selectionHint,
    initialize,
    openConversation,
    leaveConversation,
    createConversation,
    removeConversation,
    setDraftInput,
    setApplyMode,
    removeReference,
    clearSelectionHint,
    sendMessage,
    applyPendingReplace,
    discardPendingReplace,
    refreshReferenceStaleState,
  } = useAiChatStore()
  const documentVersion = useDocumentStore((state) => state.document?.version || 0)

  const themeConfig = getThemeConfig()

  useEffect(() => {
    void initialize()
  }, [initialize])

  useEffect(() => {
    if (!documentVersion) return
    void refreshReferenceStaleState()
  }, [documentVersion, refreshReferenceStaleState])

  useEffect(() => {
    if (!selectionHint) return
    const timer = window.setTimeout(() => {
      clearSelectionHint()
    }, 2200)

    return () => window.clearTimeout(timer)
  }, [clearSelectionHint, selectionHint])

  const view: DockView = currentConversationId ? 'conversation' : 'history'
  const currentMessages = currentConversationId ? messagesByConversation[currentConversationId] || [] : []
  const currentReferences = currentConversationId ? referencesByConversation[currentConversationId] || [] : []
  const currentConversation = conversations.find((conversation) => conversation.id === currentConversationId) || null
  const selectedReferences = useMemo(
    () => currentReferences.filter((reference) => selectedReferenceIds.includes(reference.id)),
    [currentReferences, selectedReferenceIds]
  )
  const currentApplyMode = APPLY_MODE_OPTIONS.find((option) => option.value === applyMode) || APPLY_MODE_OPTIONS[0]

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{
        background: `linear-gradient(180deg, ${themeConfig.card} 0%, ${themeConfig.background} 18%)`,
      }}
    >
      <div
        className="flex items-start justify-between border-b px-4 py-3"
        style={{ borderColor: themeConfig.border }}
      >
        {view === 'history' ? (
          <div className="flex items-center gap-2 text-[15px] font-medium" style={{ color: themeConfig.heading }}>
            <Sparkles className="h-4 w-4" />
            {currentLanguage === 'zh' ? 'Tasks' : 'Tasks'}
          </div>
        ) : (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-md hover:bg-transparent focus-visible:ring-0"
                style={{ color: themeConfig.text, backgroundColor: 'transparent' }}
                onClick={() => void leaveConversation()}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="truncate text-[15px] font-medium" style={{ color: themeConfig.heading }}>
                {currentConversation?.title || (currentLanguage === 'zh' ? '新对话' : 'New chat')}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-1">
          <ActionIcon icon={<MoreHorizontal className="h-4 w-4" />} color={themeConfig.muted} />
          <ActionIcon icon={<RotateCcw className="h-4 w-4" />} color={themeConfig.muted} />
          <ActionIcon
            icon={<Settings className="h-4 w-4" />}
            color={themeConfig.muted}
            onClick={() => setActivePanel('settings')}
          />
          <ActionIcon
            icon={<PencilLine className="h-4 w-4" />}
            color={themeConfig.muted}
            onClick={() => void createConversation()}
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {view === 'history' ? (
          <div className="flex min-h-full flex-col px-4 pb-4 pt-3">
            <div className="space-y-1">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => void openConversation(conversation.id)}
                  className="flex w-full items-center justify-between rounded-xl px-2 py-2 text-left transition-colors"
                  style={{
                    backgroundColor:
                      currentConversationId === conversation.id ? `${themeConfig.primary}10` : 'transparent',
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[15px]" style={{ color: themeConfig.text }}>
                      {conversation.title}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: themeConfig.textMuted }}>
                      {conversation.model}
                    </div>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    <div className="flex-shrink-0 text-xs" style={{ color: themeConfig.textMuted }}>
                      {conversation.messageCount}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-md hover:bg-transparent focus-visible:ring-0"
                      onClick={(event) => {
                        event.stopPropagation()
                        void removeConversation(conversation.id)
                      }}
                      style={{ color: themeConfig.textMuted, backgroundColor: 'transparent' }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </button>
              ))}

              {!conversations.length && (
                <div
                  className="rounded-2xl border px-4 py-6 text-sm"
                  style={{ borderColor: themeConfig.border, color: themeConfig.textMuted }}
                >
                  {currentLanguage === 'zh'
                    ? '暂无对话历史。先在编辑区选中文本，或点击预览区块，将内容加入对话。'
                    : 'No chat history yet. Select text in the editor or click a preview block to add it to chat.'}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-full flex-col px-4 pb-4 pt-3">
            {selectionHint && (
              <div
                className="mb-3 rounded-xl border px-3 py-2 text-xs leading-5"
                style={{
                  borderColor: themeConfig.border,
                  backgroundColor: themeConfig.background,
                  color: themeConfig.textMuted,
                }}
              >
                {selectionHint}
              </div>
            )}

            {!!selectedReferences.length && (
              <div className="mb-4 space-y-2">
                {selectedReferences.map((reference) => (
                  <div
                    key={reference.id}
                    className="rounded-2xl border px-3 py-3"
                    style={{
                      borderColor: reference.stale
                        ? themeConfig.error
                        : reference.locked
                          ? themeConfig.primary
                          : themeConfig.border,
                      backgroundColor: themeConfig.card,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium" style={{ color: themeConfig.heading }}>
                          {reference.anchorPath.join(' / ') || (currentLanguage === 'zh' ? '根块' : 'Root')}
                        </div>
                        <div className="mt-1 text-xs leading-5" style={{ color: themeConfig.textMuted }}>
                          {reference.excerpt}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]" style={{ color: themeConfig.textMuted }}>
                          <span>{reference.blockType}</span>
                          <span>{reference.blockCount} blocks</span>
                          {reference.locked && (
                            <Badge variant="outline" style={{ borderColor: themeConfig.primary, color: themeConfig.primary }}>
                              {currentLanguage === 'zh' ? '已锁定' : 'Locked'}
                            </Badge>
                          )}
                          {reference.stale && (
                            <Badge variant="outline" style={{ borderColor: themeConfig.error, color: themeConfig.error }}>
                              {currentLanguage === 'zh' ? '已失效' : 'Stale'}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {reference.stale && (
                          <AlertCircle className="h-4 w-4" style={{ color: themeConfig.error }} />
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-md hover:bg-transparent focus-visible:ring-0"
                          onClick={() => void removeReference(reference.id)}
                          style={{ color: themeConfig.textMuted, backgroundColor: 'transparent' }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {currentMessages.map((message) => {
                const isUser = message.role === 'user'
                const isReplaceMessage = message.role === 'assistant' && message.action?.action === 'replace'
                return (
                  <div
                    key={message.id}
                    className="flex"
                    style={{ justifyContent: isUser ? 'flex-end' : 'flex-start' }}
                  >
                    <div
                      className="max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6"
                      style={{
                        backgroundColor: isUser ? `${themeConfig.primary}10` : themeConfig.card,
                        border: `1px solid ${isUser ? `${themeConfig.primary}22` : themeConfig.border}`,
                        color: themeConfig.text,
                      }}
                    >
                      {message.content ||
                        (message.state === 'pending'
                          ? currentLanguage === 'zh'
                            ? '正在生成...'
                            : 'Generating...'
                          : '')}
                      {isReplaceMessage && (
                        <div className="mt-3">
                          <Badge variant="outline" style={{ borderColor: themeConfig.primary, color: themeConfig.primary }}>
                            {currentLanguage === 'zh' ? '建议替换' : 'Replace suggestion'}
                          </Badge>
                        </div>
                      )}
                      {!!message.error && (
                        <div className="mt-2 text-xs" style={{ color: themeConfig.error }}>
                          {message.error}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {pendingReplace && (
              <div
                className="mt-4 rounded-2xl border p-4"
                style={{ borderColor: themeConfig.border, backgroundColor: themeConfig.card }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium" style={{ color: themeConfig.heading }}>
                    {currentLanguage === 'zh' ? '待确认替换' : 'Pending replace'}
                  </div>
                  <Badge variant="outline">replace</Badge>
                </div>
                <div
                  className="mt-3 max-h-44 overflow-auto rounded-xl border p-3 text-xs leading-5"
                  style={{
                    borderColor: themeConfig.border,
                    color: themeConfig.textMuted,
                    backgroundColor: themeConfig.background,
                  }}
                >
                  <pre className="whitespace-pre-wrap break-words">{pendingReplace.previewMarkdown}</pre>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={discardPendingReplace}>
                    {currentLanguage === 'zh' ? '取消' : 'Cancel'}
                  </Button>
                  <Button type="button" onClick={() => void applyPendingReplace()}>
                    <Check className="mr-2 h-4 w-4" />
                    {currentLanguage === 'zh' ? '确认应用' : 'Apply'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      <div className="border-t p-3" style={{ borderColor: themeConfig.border }}>
        <div
          className="rounded-[26px] border px-4 pb-3 pt-3 shadow-[0_16px_40px_rgba(0,0,0,0.06)]"
          style={{
            borderColor: themeConfig.border,
            backgroundColor: themeConfig.card,
          }}
        >
          <Textarea
            value={draftInput}
            onChange={(event) => void setDraftInput(event.target.value)}
            placeholder={
              currentLanguage === 'zh'
                ? '围绕引用内容提问，或要求修改当前块'
                : 'Ask about the references or request a document edit'
            }
            className="min-h-12 resize-none border-0 bg-transparent p-0 text-[15px] leading-6 shadow-none outline-none focus-visible:ring-0"
            style={{ color: themeConfig.text }}
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Select value={applyMode} onValueChange={(value) => void setApplyMode(value as AiReplaceApplyMode)}>
                <SelectTrigger
                  size="sm"
                  className="h-8 min-w-[112px] rounded-full border-0 px-4 text-xs font-medium shadow-none outline-none ring-0 focus:ring-0 focus-visible:ring-0 data-[state=open]:ring-0"
                  style={{
                    color: themeConfig.primary,
                    backgroundColor: `${themeConfig.primary}10`,
                  }}
                >
                  <SelectValue placeholder={currentApplyMode.label}>
                    {currentApplyMode.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  style={{
                    backgroundColor: themeConfig.card,
                    borderColor: themeConfig.border,
                    ['--dock-select-hover' as any]: themeConfig.hover,
                    ['--dock-select-text' as any]: themeConfig.text,
                  }}
                >
                  {APPLY_MODE_OPTIONS.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="data-[highlighted]:bg-[var(--dock-select-hover)] data-[highlighted]:text-[var(--dock-select-text)] focus:bg-[var(--dock-select-hover)] focus:text-[var(--dock-select-text)]"
                      style={{ color: themeConfig.text }}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              {error && (
                <div className="max-w-44 truncate text-xs" style={{ color: themeConfig.error }}>
                  {error}
                </div>
              )}

              <Button
                type="button"
                className="h-10 w-10 rounded-full p-0"
                disabled={!draftInput.trim() || isSending || isLoading}
                onClick={() => void sendMessage()}
                style={{
                  backgroundColor: draftInput.trim() ? themeConfig.muted : themeConfig.border,
                  color: themeConfig.buttonText,
                }}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AiChatDock
