'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeSanitize from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { useThemeStore } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { useAiChatStore } from '@/stores/aiChatStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useGitStore } from '@/stores/gitStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'

type DockView = 'history' | 'conversation'

interface AiChatDockProps {
  onClose?: () => void
}

function ActionIcon({
  icon,
  title,
  onClick,
  color,
  disabled,
}: {
  icon: React.ReactNode
  title?: string
  onClick?: () => void
  color: string
  disabled?: boolean
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 rounded-md hover:bg-transparent focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-45"
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{ color, backgroundColor: 'transparent' }}
    >
      {icon}
    </Button>
  )
}

function getChatMarkdownStyles(
  themeConfig: ReturnType<ReturnType<typeof useThemeStore.getState>['getThemeConfig']>
) {
  return `
    .ai-chat-markdown {
      color: ${themeConfig.text};
      line-height: 1.7;
      word-break: break-word;
    }
    .ai-chat-markdown > *:first-child {
      margin-top: 0;
    }
    .ai-chat-markdown > *:last-child {
      margin-bottom: 0;
    }
    .ai-chat-markdown p,
    .ai-chat-markdown ul,
    .ai-chat-markdown ol,
    .ai-chat-markdown pre,
    .ai-chat-markdown blockquote,
    .ai-chat-markdown table {
      margin: 0.35rem 0;
    }
    .ai-chat-markdown h1,
    .ai-chat-markdown h2,
    .ai-chat-markdown h3,
    .ai-chat-markdown h4,
    .ai-chat-markdown h5,
    .ai-chat-markdown h6 {
      margin: 0.7rem 0 0.45rem;
      color: ${themeConfig.heading};
      font-weight: 700;
      line-height: 1.35;
    }
    .ai-chat-markdown h1 { font-size: 1.05rem; }
    .ai-chat-markdown h2 { font-size: 1rem; }
    .ai-chat-markdown h3,
    .ai-chat-markdown h4,
    .ai-chat-markdown h5,
    .ai-chat-markdown h6 { font-size: 0.95rem; }
    .ai-chat-markdown code {
      background-color: ${themeConfig.code};
      color: ${themeConfig.heading};
      border-radius: 0.35rem;
      padding: 0.1rem 0.35rem;
      font-size: 0.88em;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .ai-chat-markdown pre {
      overflow-x: auto;
      border-radius: 0.85rem;
      border: 1px solid ${themeConfig.border};
      background-color: ${themeConfig.code};
      padding: 0.75rem 0.9rem;
    }
    .ai-chat-markdown pre code {
      background-color: transparent;
      padding: 0;
      color: ${themeConfig.text};
    }
    .ai-chat-markdown a {
      color: ${themeConfig.link};
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .ai-chat-markdown ul,
    .ai-chat-markdown ol {
      padding-left: 1.25rem;
      list-style-position: outside;
    }
    .ai-chat-markdown ul {
      list-style-type: disc;
    }
    .ai-chat-markdown ol {
      list-style-type: decimal;
    }
    .ai-chat-markdown li + li {
      margin-top: 0.18rem;
    }
    .ai-chat-markdown blockquote {
      border-left: 3px solid ${themeConfig.primary};
      padding-left: 0.8rem;
      color: ${themeConfig.textMuted};
      opacity: 0.92;
    }
    .ai-chat-markdown table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95em;
    }
    .ai-chat-markdown th,
    .ai-chat-markdown td {
      border: 1px solid ${themeConfig.border};
      padding: 0.45rem 0.55rem;
      text-align: left;
      vertical-align: top;
    }
    .ai-chat-markdown th {
      background-color: ${themeConfig.code};
      color: ${themeConfig.heading};
    }
  `
}

function ChatMarkdownMessage({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  const { getThemeConfig } = useThemeStore()
  const themeConfig = getThemeConfig()
  const [html, setHtml] = useState('')

  useEffect(() => {
    let cancelled = false

    const renderMarkdown = async () => {
      if (!content) {
        setHtml('')
        return
      }

      const result = await unified()
        .use(remarkParse)
        .use(remarkGfm)
        .use(remarkRehype)
        .use(rehypeSanitize)
        .use(rehypeStringify)
        .process(content)

      if (!cancelled) {
        setHtml(String(result))
      }
    }

    void renderMarkdown()

    return () => {
      cancelled = true
    }
  }, [content])

  return (
    <>
      <style>{getChatMarkdownStyles(themeConfig)}</style>
      <div className={`ai-chat-markdown min-w-0 ${className || ''}`} dangerouslySetInnerHTML={{ __html: html }} />
    </>
  )
}

export function AiChatDock({ onClose: _onClose }: AiChatDockProps) {
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [configDialogOpen, setConfigDialogOpen] = useState(false)
  const [pendingDeleteConversationId, setPendingDeleteConversationId] = useState<string | null>(null)
  const [pendingDeleteConversationTitle, setPendingDeleteConversationTitle] = useState('')
  const [referencesExpanded, setReferencesExpanded] = useState(false)
  const { getThemeConfig } = useThemeStore()
  const { currentLanguage } = useTranslation()
  const providers = useSettingsStore((state) => state.providers)
  const activeProviderId = useSettingsStore((state) => state.activeProviderId)
  const setActiveProvider = useSettingsStore((state) => state.setActiveProvider)
  const updateProviderConfig = useSettingsStore((state) => state.updateProviderConfig)
  const {
    conversations,
    currentConversationId,
    visibleMessagesByConversation,
    toolUndoStackByConversation,
    referencesByConversation,
    generatedDocumentSessionsByConversation,
    draftInput,
    selectedReferenceIds,
    isLoading,
    sendingConversationIds,
    error,
    chatTemperature,
    chatMaxTokens,
    chatHistoryRounds,
    initialize,
    openConversation,
    leaveConversation,
    createConversation,
    removeConversation,
    renameConversation,
    setDraftInput,
    removeReference,
    sendMessage,
    stopSending,
    setChatTemperature,
    setChatMaxTokens,
    setChatHistoryRounds,
    resolveGeneratedDocumentGitOffer,
    undoLastToolApply,
    dismissLastToolApply,
  } = useAiChatStore()
  const gitReady = useGitStore((state) => Boolean(state.connected && state.config.repo && state.config.branch))

  const themeConfig = getThemeConfig()
  const connectedProviders = useMemo(
    () => providers.filter((provider) => provider.isTested && provider.model),
    [providers]
  )
  const runtimeModelOptions = useMemo(
    () => connectedProviders.map((provider) => ({
      value: `${provider.id}::${provider.model}`,
      label: `${provider.name} · ${provider.model}`,
      providerName: provider.name,
      model: provider.model,
    })),
    [connectedProviders]
  )
  const selectedRuntimeModel = useMemo(() => {
    const activeProvider = connectedProviders.find((provider) => provider.id === activeProviderId)
    return activeProvider ? `${activeProvider.id}::${activeProvider.model}` : ''
  }, [activeProviderId, connectedProviders])
  const sortedConversations = useMemo(
    () => [...conversations].sort((left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt),
    [conversations]
  )
  const formatConversationDate = (value: number) => {
    const targetDate = new Date(value)
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOfTarget = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate())
    const diffDays = Math.round((startOfToday.getTime() - startOfTarget.getTime()) / 86400000)
    const timeLabel = new Intl.DateTimeFormat(currentLanguage === 'zh' ? 'zh-CN' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(targetDate)

    if (diffDays === 0) {
      return currentLanguage === 'zh' ? `今天 ${timeLabel}` : `Today ${timeLabel}`
    }

    if (diffDays === 1) {
      return currentLanguage === 'zh' ? `昨天 ${timeLabel}` : `Yesterday ${timeLabel}`
    }

    if (targetDate.getFullYear() === now.getFullYear()) {
      const dateLabel = new Intl.DateTimeFormat(currentLanguage === 'zh' ? 'zh-CN' : 'en-US', {
        month: '2-digit',
        day: '2-digit',
      }).format(targetDate)
      return `${dateLabel} ${timeLabel}`
    }

    return new Intl.DateTimeFormat(currentLanguage === 'zh' ? 'zh-CN' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(targetDate)
  }

  useEffect(() => {
    void initialize()
  }, [initialize])

  const view: DockView = currentConversationId ? 'conversation' : 'history'
  const currentMessages = currentConversationId ? visibleMessagesByConversation[currentConversationId] || [] : []
  const latestUndoRecord = currentConversationId
    ? [...(toolUndoStackByConversation[currentConversationId] || [])].reverse().find((record) => record.state === 'available') || null
    : null
  const currentConversation = conversations.find((conversation) => conversation.id === currentConversationId) || null
  const currentGeneratedDocumentSession = currentConversationId
    ? generatedDocumentSessionsByConversation[currentConversationId] || null
    : null
  const currentConversationSending = currentConversationId
    ? sendingConversationIds.includes(currentConversationId)
    : false
  const selectedReferences = useMemo(
    () => {
      const currentReferences = currentConversationId ? referencesByConversation[currentConversationId] || [] : []
      return currentReferences.filter((reference) => selectedReferenceIds.includes(reference.id))
    },
    [currentConversationId, referencesByConversation, selectedReferenceIds]
  )
  const getReferencePreviewText = (value: string) => {
    const normalized = value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !/^[-*_]{3,}$/.test(line))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    return normalized || (currentLanguage === 'zh' ? '空白选区' : 'Empty selection')
  }
  const submitMessage = () => {
    if (!draftInput.trim() || currentConversationSending || isLoading) return
    void sendMessage()
  }
  const submitRename = (conversationId: string) => {
    void renameConversation(conversationId, editingTitle)
    setEditingConversationId(null)
    setEditingTitle('')
  }
  const handleChatModelChange = (value: string) => {
    const [providerId, ...modelParts] = value.split('::')
    const model = modelParts.join('::')
    if (!providerId || !model) return

    const provider = providers.find((item) => item.id === providerId)
    if (!provider) return

    setActiveProvider(providerId)
    if (provider.model !== model) {
      updateProviderConfig(providerId, { model })
    }
    toast({
      title: currentLanguage === 'zh' ? '已切换模型' : 'Model switched',
      description: currentLanguage === 'zh'
        ? '中途切换模型可能会增加 token 消耗。'
        : 'Switching models mid-conversation may increase token usage.',
    })
  }
  const activeProvider = connectedProviders.find((provider) => provider.id === activeProviderId) || null
  const modelLabel = activeProvider?.name || (currentLanguage === 'zh' ? '选择模型' : 'Choose model')
  const modelShortLabel = modelLabel.length > 10 ? `${modelLabel.slice(0, 10)}…` : modelLabel
  const openRenameDialog = () => {
    if (!currentConversation) return
    setEditingTitle(currentConversation.title)
    setRenameDialogOpen(true)
  }
  const openDeleteDialog = (conversationId: string, conversationTitle: string) => {
    setPendingDeleteConversationId(conversationId)
    setPendingDeleteConversationTitle(conversationTitle)
    setDeleteDialogOpen(true)
  }
  const confirmRenameConversation = () => {
    if (!currentConversationId || !editingTitle.trim()) return
    void renameConversation(currentConversationId, editingTitle.trim())
    setRenameDialogOpen(false)
    setEditingTitle('')
  }
  const confirmRemoveCurrentConversation = () => {
    if (!pendingDeleteConversationId) return
    void removeConversation(pendingDeleteConversationId)
    setDeleteDialogOpen(false)
    setPendingDeleteConversationId(null)
    setPendingDeleteConversationTitle('')
  }

  return (
    <div
      className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden"
      style={{
        background: `linear-gradient(180deg, ${themeConfig.card} 0%, ${themeConfig.background} 18%)`,
      }}
    >
      <div
        className="flex w-full min-w-0 max-w-full items-start justify-between overflow-hidden border-b px-4 py-3"
        style={{ borderColor: themeConfig.border }}
      >
        {view === 'history' ? (
          <div className="flex items-center gap-2 text-[15px] font-medium" style={{ color: themeConfig.heading }}>
            <Sparkles className="h-4 w-4" />
            {currentLanguage === 'zh' ? 'Tasks' : 'Tasks'}
          </div>
        ) : (
          <div className="min-w-0 flex-1 basis-0">
            <div className="flex min-w-0 items-center gap-2">
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
              <div className="min-w-0 flex-1 truncate text-[15px] font-medium" style={{ color: themeConfig.heading }}>
                {currentConversation?.title || (currentLanguage === 'zh' ? '新对话' : 'New chat')}
              </div>
            </div>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 rounded-md hover:bg-transparent focus-visible:ring-0"
                title={currentLanguage === 'zh' ? '更多操作' : 'More actions'}
                disabled={!currentConversationId}
                style={{ color: themeConfig.muted, backgroundColor: 'transparent' }}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-40"
              style={{
                backgroundColor: themeConfig.card,
                borderColor: themeConfig.border,
                color: themeConfig.text,
              }}
            >
              <DropdownMenuItem
                onClick={openRenameDialog}
                disabled={!currentConversationId}
                className="gap-2"
              >
                <PencilLine className="h-4 w-4" />
                {currentLanguage === 'zh' ? '重命名对话' : 'Rename chat'}
              </DropdownMenuItem>
              <DropdownMenuSeparator style={{ backgroundColor: themeConfig.border }} />
              <DropdownMenuItem
                onClick={() => {
                  if (!currentConversation) return
                  openDeleteDialog(currentConversation.id, currentConversation.title)
                }}
                disabled={!currentConversationId}
                variant="destructive"
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {currentLanguage === 'zh' ? '删除对话' : 'Delete chat'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ActionIcon
            icon={<Settings className="h-4 w-4" />}
            color={themeConfig.muted}
            onClick={() => setConfigDialogOpen(true)}
            title={currentLanguage === 'zh' ? '对话配置' : 'Chat settings'}
          />
          {view !== 'history' && (
            <ActionIcon
              icon={<Plus className="h-4 w-4" />}
              color={themeConfig.muted}
              onClick={() => void createConversation()}
              title={currentLanguage === 'zh' ? '新建对话' : 'New chat'}
            />
          )}
        </div>
      </div>

      {view === 'history' ? (
        <ScrollArea className="min-h-0 w-full max-w-full flex-1 overflow-x-hidden">
          <div className="flex min-h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden px-4 pb-4 pt-3">
            <div className="space-y-1">
              {sortedConversations.map((conversation) => {
                const conversationSending = sendingConversationIds.includes(conversation.id)
                return (
                <div
                  key={conversation.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (editingConversationId === conversation.id) return
                    void openConversation(conversation.id)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    if (editingConversationId === conversation.id) return
                    void openConversation(conversation.id)
                  }}
                  className="flex w-full min-w-0 items-center border px-3 py-3 text-left transition-all duration-200"
                  style={{
                    backgroundColor:
                      currentConversationId === conversation.id ? `${themeConfig.primary}10` : themeConfig.card,
                    borderColor:
                      currentConversationId === conversation.id ? `${themeConfig.primary}20` : `${themeConfig.border}88`,
                    boxShadow: 'none',
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.transform = 'translateY(-1px)'
                    event.currentTarget.style.boxShadow = `0 10px 22px ${themeConfig.primary}10`
                    if (currentConversationId !== conversation.id) {
                      event.currentTarget.style.borderColor = `${themeConfig.primary}22`
                    }
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.transform = 'translateY(0)'
                    event.currentTarget.style.boxShadow = 'none'
                    event.currentTarget.style.borderColor =
                      currentConversationId === conversation.id ? `${themeConfig.primary}20` : `${themeConfig.border}88`
                  }}
                >
                  <div className="min-w-0 flex-1">
                    {editingConversationId === conversation.id ? (
                      <input
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault()
                            submitRename(conversation.id)
                          }
                          if (event.key === 'Escape') {
                            event.preventDefault()
                            setEditingConversationId(null)
                            setEditingTitle('')
                          }
                        }}
                        onClick={(event) => event.stopPropagation()}
                        className="w-full min-w-0 rounded-md border px-2 py-1 text-[15px] outline-none"
                        style={{
                          color: themeConfig.text,
                          borderColor: themeConfig.border,
                          backgroundColor: themeConfig.background,
                        }}
                        autoFocus
                      />
                    ) : (
                      <div className="truncate text-[15px]" style={{ color: themeConfig.text }}>
                        {conversation.title}
                      </div>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: themeConfig.textMuted }}>
                      {conversationSending && (
                        <span>{currentLanguage === 'zh' ? '回复中' : 'Responding'}</span>
                      )}
                      <span>{formatConversationDate(conversation.updatedAt || conversation.lastMessageAt || conversation.createdAt)}</span>
                    </div>
                  </div>
                  <div className="ml-2 flex w-[58px] shrink-0 items-center justify-end gap-0.5">
                    {conversationSending && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: themeConfig.primary }} />
                    )}
                    {editingConversationId === conversation.id ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-6 rounded-md hover:bg-transparent focus-visible:ring-0"
                        onClick={(event) => {
                          event.stopPropagation()
                          submitRename(conversation.id)
                        }}
                        style={{ color: themeConfig.primary, backgroundColor: 'transparent' }}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-6 rounded-md hover:bg-transparent focus-visible:ring-0"
                        onClick={(event) => {
                          event.stopPropagation()
                          setEditingConversationId(conversation.id)
                          setEditingTitle(conversation.title)
                        }}
                        style={{ color: themeConfig.textMuted, backgroundColor: 'transparent' }}
                      >
                        <PencilLine className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-6 rounded-md hover:bg-transparent focus-visible:ring-0"
                      onClick={(event) => {
                        event.stopPropagation()
                        openDeleteDialog(conversation.id, conversation.title)
                      }}
                      style={{ color: themeConfig.textMuted, backgroundColor: 'transparent' }}
                      title={currentLanguage === 'zh' ? '删除对话' : 'Delete chat'}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )})}

              {!conversations.length && (
                <div
                  className="rounded-2xl border px-4 py-6 text-sm"
                  style={{ borderColor: themeConfig.border, color: themeConfig.textMuted }}
                >
                  {currentLanguage === 'zh'
                    ? '暂无对话历史。先在编辑区选中文本，将内容加入对话。'
                    : 'No chat history yet. Select text in the editor to add it to chat.'}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {!!selectedReferences.length && (
            <div
              className="shrink-0 box-border w-full max-w-full overflow-hidden border-b px-4 py-3"
              style={{
                borderColor: themeConfig.border,
                backgroundColor: themeConfig.card,
              }}
            >
              <button
                type="button"
                className="box-border flex h-11 w-full max-w-full items-center overflow-hidden rounded-xl px-3 text-left"
                onClick={() => setReferencesExpanded((value) => !value)}
              >
                <div className="flex min-w-0 flex-1 basis-0 items-center gap-2 overflow-hidden">
                  {referencesExpanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0" style={{ color: themeConfig.textMuted }} />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: themeConfig.textMuted }} />
                  )}
                  <span className="shrink-0 text-xs font-medium" style={{ color: themeConfig.heading }}>
                    {currentLanguage === 'zh' ? '引用' : 'References'}
                  </span>
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[11px]"
                    style={{ backgroundColor: `${themeConfig.primary}12`, color: themeConfig.primary }}
                  >
                    {selectedReferences.length}
                  </span>
                  <span className="block min-w-0 flex-1 basis-0 truncate text-xs" style={{ color: themeConfig.textMuted }}>
                    {selectedReferences.map((reference) => getReferencePreviewText(reference.expectedText)).join(' / ')}
                  </span>
                </div>
              </button>

              {referencesExpanded && (
                <div
                  className="box-border mt-2 max-h-44 w-full max-w-full space-y-1 overflow-y-auto overflow-x-hidden rounded-xl border p-2"
                  style={{ borderColor: themeConfig.border }}
                >
                  {selectedReferences.map((reference) => (
                    <div
                      key={reference.id}
                      className="box-border flex h-9 w-full max-w-full min-w-0 items-center gap-2 overflow-hidden rounded-lg border px-2"
                      style={{
                        borderColor: reference.locked ? themeConfig.primary : themeConfig.border,
                        backgroundColor: themeConfig.background,
                      }}
                    >
                      <div className="flex min-w-0 flex-1 basis-0 items-center gap-2 overflow-hidden">
                        <span
                          className="block min-w-0 flex-1 basis-0 truncate text-xs font-medium"
                          title={getReferencePreviewText(reference.expectedText)}
                          style={{ color: themeConfig.heading }}
                        >
                          {getReferencePreviewText(reference.expectedText)}
                        </span>
                        {reference.locked && (
                          <Badge
                            variant="outline"
                            className="h-4 shrink-0 px-1 text-[10px]"
                            style={{ borderColor: themeConfig.primary, color: themeConfig.primary }}
                          >
                            {currentLanguage === 'zh' ? '锁定' : 'Locked'}
                          </Badge>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 rounded-md hover:bg-transparent focus-visible:ring-0"
                        onClick={() => void removeReference(reference.id)}
                        style={{ color: themeConfig.textMuted, backgroundColor: 'transparent' }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <ScrollArea className="min-h-0 w-full max-w-full flex-1 overflow-x-hidden">
            <div className="flex min-h-full w-full min-w-0 max-w-full flex-col overflow-x-hidden px-4 pb-4 pt-3">
              <div className="w-full min-w-0 max-w-full space-y-3 overflow-x-hidden">
                {currentMessages.map((message) => {
                  const isUser = message.role === 'user'
                  const messageBody = message.displayMessage ?? message.message
                  return (
                    <div
                      key={message.id}
                      className="flex w-full min-w-0 max-w-full"
                      style={{ justifyContent: isUser ? 'flex-end' : 'flex-start' }}
                    >
                      <div
                        className={isUser
                          ? 'min-w-0 max-w-[88%] overflow-hidden rounded-2xl px-4 py-3 text-sm leading-6 break-words whitespace-pre-wrap'
                          : 'min-w-0 max-w-[88%] overflow-hidden rounded-2xl px-4 py-3 text-sm leading-6 break-words'
                        }
                        style={{
                          backgroundColor: isUser ? `${themeConfig.primary}10` : themeConfig.card,
                          border: `1px solid ${isUser ? `${themeConfig.primary}22` : themeConfig.border}`,
                          color: themeConfig.text,
                        }}
                      >
                        {message.thinking && (
                          <div
                            className="mb-3 rounded-xl border px-3 py-2"
                            style={{
                              color: themeConfig.textMuted,
                              borderColor: themeConfig.border,
                              backgroundColor: themeConfig.background,
                            }}
                          >
                            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: themeConfig.heading }}>
                              {currentLanguage === 'zh' ? '思考' : 'Thinking'}
                            </div>
                            <div style={{ color: themeConfig.textMuted, fontStyle: 'italic' }}>
                              <ChatMarkdownMessage content={message.thinking} className="[&_p]:italic [&_li]:italic [&_blockquote]:italic" />
                            </div>
                          </div>
                        )}
                        <div className="flex items-start gap-2">
                          {message.state === 'pending' && !isUser && (
                            <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin" style={{ color: themeConfig.primary }} />
                          )}
                          {messageBody && (
                            isUser ? (
                              <span className="min-w-0 break-words">{messageBody}</span>
                            ) : (
                              <ChatMarkdownMessage content={messageBody} />
                            )
                          )}
                        </div>
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
            </div>
          </ScrollArea>
        </div>
      )}

      <div className="w-full min-w-0 max-w-full overflow-hidden border-t p-3" style={{ borderColor: themeConfig.border }}>
        <div
          className="w-full min-w-0 max-w-full overflow-hidden rounded-[26px] border px-4 pb-3 pt-3 shadow-[0_16px_40px_rgba(0,0,0,0.06)]"
          style={{
            borderColor: themeConfig.border,
            backgroundColor: themeConfig.card,
          }}
        >
          {latestUndoRecord && (
            <div
              className="mb-3 flex min-w-0 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs"
              style={{
                borderColor: themeConfig.border,
                backgroundColor: themeConfig.background,
                color: themeConfig.textMuted,
              }}
            >
              <span className="min-w-0 truncate">
                {currentLanguage === 'zh' ? 'AI 已自动应用修改' : 'AI edit applied'}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 rounded-md px-2 hover:bg-transparent focus-visible:ring-0"
                  onClick={() => void undoLastToolApply()}
                  style={{ color: themeConfig.primary, backgroundColor: 'transparent' }}
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Undo
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md hover:bg-transparent focus-visible:ring-0"
                  onClick={() => dismissLastToolApply()}
                  style={{ color: themeConfig.textMuted, backgroundColor: 'transparent' }}
                  title={currentLanguage === 'zh' ? '关闭提示' : 'Dismiss'}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {currentConversationId && currentGeneratedDocumentSession?.status === 'ready' && gitReady && (
            <div
              className="mb-3 flex min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs"
              style={{
                borderColor: themeConfig.border,
                backgroundColor: themeConfig.background,
                color: themeConfig.textMuted,
              }}
            >
              <span className="min-w-0 truncate">
                {currentLanguage === 'zh'
                  ? `已生成 ${currentGeneratedDocumentSession.fileName}，已保存到本地。是否加入 Git？`
                  : `Generated ${currentGeneratedDocumentSession.fileName} and saved locally. Add it to Git?`}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 rounded-md px-2 hover:bg-transparent focus-visible:ring-0"
                  onClick={() => void resolveGeneratedDocumentGitOffer(currentConversationId, true)}
                  style={{ color: themeConfig.primary, backgroundColor: `${themeConfig.primary}12` }}
                >
                  {currentLanguage === 'zh' ? '加入 Git' : 'Add to Git'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 rounded-md px-2 hover:bg-transparent focus-visible:ring-0"
                  onClick={() => void resolveGeneratedDocumentGitOffer(currentConversationId, false)}
                  style={{ color: themeConfig.primary, backgroundColor: `${themeConfig.primary}12` }}
                >
                  {currentLanguage === 'zh' ? '稍后' : 'Later'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-md hover:bg-transparent focus-visible:ring-0"
                  onClick={() => void resolveGeneratedDocumentGitOffer(currentConversationId, false)}
                  style={{ color: themeConfig.textMuted, backgroundColor: 'transparent' }}
                  title={currentLanguage === 'zh' ? '稍后处理' : 'Dismiss'}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          <Textarea
            value={draftInput}
            onChange={(event) => void setDraftInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
              event.preventDefault()
              submitMessage()
            }}
            placeholder={
              currentLanguage === 'zh'
                ? '和你的 AI 对话，自由创建或修改文档'
                : 'Chat with your AI to freely create or edit documents'
            }
            className="h-24 w-full min-w-0 resize-none overflow-y-auto border-0 bg-transparent p-0 text-[15px] leading-6 shadow-none outline-none focus-visible:ring-0"
            style={{ color: themeConfig.text, fieldSizing: 'fixed' }}
          />

          <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
            <Select
              value={selectedRuntimeModel}
              onValueChange={handleChatModelChange}
              disabled={!runtimeModelOptions.length}
            >
              <SelectTrigger
                className="h-9 min-w-[124px] max-w-[156px] rounded-full px-3 text-xs shadow-none"
                style={{
                  backgroundColor: 'transparent',
                  borderColor: themeConfig.border,
                  color: themeConfig.text,
                }}
                title={activeProvider ? `${activeProvider.name} · ${activeProvider.model}` : modelLabel}
              >
                <SelectValue placeholder={currentLanguage === 'zh' ? '选择模型' : 'Choose model'}>
                  <span className="truncate">{modelShortLabel}</span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent
                style={{
                  ['--chat-model-option-active-bg' as string]: `${themeConfig.primary}14`,
                  ['--chat-model-option-active-text' as string]: themeConfig.heading,
                  backgroundColor: themeConfig.card,
                  borderColor: themeConfig.border,
                  color: themeConfig.text,
                }}
              >
                {!connectedProviders.length ? (
                  <div className="px-2 py-2 text-sm" style={{ color: themeConfig.textMuted }}>
                    {currentLanguage === 'zh' ? '暂无已连接模型' : 'No connected models'}
                  </div>
                ) : (
                  runtimeModelOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className="data-[highlighted]:[background-color:var(--chat-model-option-active-bg)] data-[highlighted]:[color:var(--chat-model-option-active-text)]"
                    >
                      {option.label}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              {error && (
                <div className="max-w-44 truncate text-xs" style={{ color: themeConfig.error }}>
                  {error}
                </div>
              )}

              <Button
                type="button"
                className="h-10 w-10 rounded-full p-0"
                disabled={(!draftInput.trim() && !currentConversationSending) || isLoading}
                onClick={currentConversationSending ? stopSending : submitMessage}
                style={{
                  backgroundColor: currentConversationSending ? themeConfig.danger : draftInput.trim() ? themeConfig.primary : themeConfig.border,
                  color: themeConfig.buttonText,
                }}
              >
                {currentConversationSending ? <X className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent
          showCloseButton={false}
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
            color: themeConfig.text,
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: themeConfig.heading }}>
              {currentLanguage === 'zh' ? '重命名对话' : 'Rename chat'}
            </DialogTitle>
            <DialogDescription style={{ color: themeConfig.textMuted }}>
              {currentLanguage === 'zh'
                ? '为当前对话设置一个更清晰的名称。'
                : 'Set a clearer name for the current conversation.'}
            </DialogDescription>
          </DialogHeader>
          <input
            value={editingTitle}
            onChange={(event) => setEditingTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                confirmRenameConversation()
              }
            }}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{
              color: themeConfig.text,
              borderColor: themeConfig.border,
              backgroundColor: themeConfig.background,
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRenameDialogOpen(false)}
              style={{ color: themeConfig.textMuted, backgroundColor: 'transparent' }}
            >
              {currentLanguage === 'zh' ? '取消' : 'Cancel'}
            </Button>
            <Button
              type="button"
              onClick={confirmRenameConversation}
              disabled={!editingTitle.trim()}
              style={{
                backgroundColor: themeConfig.primary,
                color: themeConfig.buttonText,
              }}
            >
              {currentLanguage === 'zh' ? '保存' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent
          showCloseButton={false}
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
            color: themeConfig.text,
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: themeConfig.heading }}>
              {currentLanguage === 'zh' ? '删除对话' : 'Delete chat'}
            </DialogTitle>
            <DialogDescription style={{ color: themeConfig.textMuted }}>
              {currentLanguage === 'zh'
                ? `删除后将无法恢复，确认要移除“${pendingDeleteConversationTitle || '当前对话'}”吗？`
                : `This cannot be undone. Remove “${pendingDeleteConversationTitle || 'this conversation'}”?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteDialogOpen(false)}
              style={{ color: themeConfig.textMuted, backgroundColor: 'transparent' }}
            >
              {currentLanguage === 'zh' ? '取消' : 'Cancel'}
            </Button>
            <Button
              type="button"
              onClick={confirmRemoveCurrentConversation}
              style={{
                backgroundColor: themeConfig.danger,
                color: themeConfig.buttonText,
              }}
            >
              {currentLanguage === 'zh' ? '删除' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent
          style={{
            backgroundColor: themeConfig.card,
            borderColor: themeConfig.border,
            color: themeConfig.text,
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: themeConfig.heading }}>
              {currentLanguage === 'zh' ? '对话配置' : 'Chat settings'}
            </DialogTitle>
            <DialogDescription style={{ color: themeConfig.textMuted }}>
              {currentLanguage === 'zh'
                ? '调整当前对话使用的生成参数。'
                : 'Adjust generation parameters for the current chat.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs" style={{ color: themeConfig.textMuted }}>
                Temperature
              </label>
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={chatTemperature}
                onChange={(event) => void setChatTemperature(Number(event.target.value))}
                className="mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none"
                style={{
                  backgroundColor: themeConfig.input,
                  borderColor: themeConfig.border,
                  color: themeConfig.text,
                }}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: themeConfig.textMuted }}>
                Max tokens
              </label>
              <input
                type="number"
                min="256"
                max="200000"
                step="1024"
                value={chatMaxTokens}
                onChange={(event) => void setChatMaxTokens(Number(event.target.value))}
                className="mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none"
                style={{
                  backgroundColor: themeConfig.input,
                  borderColor: themeConfig.border,
                  color: themeConfig.text,
                }}
              />
            </div>
            <div>
              <label className="text-xs" style={{ color: themeConfig.textMuted }}>
                {currentLanguage === 'zh' ? '历史轮数' : 'History rounds'}
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={chatHistoryRounds}
                onChange={(event) => void setChatHistoryRounds(Number(event.target.value))}
                className="mt-1 h-10 w-full rounded-lg border px-3 text-sm outline-none"
                style={{
                  backgroundColor: themeConfig.input,
                  borderColor: themeConfig.border,
                  color: themeConfig.text,
                }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AiChatDock
