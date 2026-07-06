'use client'

/**
 * 设置面板组件
 *
 * 当前仅保留 Git 连接配置
 */

import { useState, useEffect } from 'react'
import { Settings, Key, AlertCircle, CheckCircle, Eye, EyeOff, GitBranch, FolderGit2 } from 'lucide-react'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { useGitStore } from '@/stores/gitStore'
import { useSidebarStore } from '@/stores/sidebarStore'
import { getGitProviderErrorContext } from '@/lib/git/provider-errors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/hooks/use-toast'

function buildGitConnectErrorDescription(
  error: unknown,
  t: (key: string) => string
) {
  const { code, status, message } = getGitProviderErrorContext(error)

  if (code === 'not_found' || status === 404) {
    return t('git.connectFailedNotFound')
  }

  return message
}

export function SettingsPanel() {
  const { getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const { t } = useTranslation()
  const [showGitToken, setShowGitToken] = useState(false)
  const { setActivePanel } = useSidebarStore()

  useEffect(() => {
    setMounted(true)
  }, [])

  const {
    config: gitConfig,
    connected: gitConnected,
    isConnecting: isGitConnecting,
    branches: gitBranches,
    repos: gitRepos,
    setConfig: setGitConfig,
    getDecryptedToken,
    validateAndLoad: validateGitAndLoad,
  } = useGitStore()

  const handleGitConnect = async () => {
    try {
      await validateGitAndLoad()
      toast({ title: t('git.connected') })
    } catch (error) {
      toast({
        title: t('git.connectFailed'),
        description: buildGitConnectErrorDescription(error, t),
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: themeConfig.sidebar }}>
      {/* 头部 */}
      <div className="flex h-14 items-center border-b px-4" style={{ borderColor: themeConfig.border }}>
        <Settings className="mr-2 h-5 w-5" style={{ color: themeConfig.primary }} />
        <h2 className="text-sm font-semibold" style={{ color: themeConfig.heading }}>
          {mounted ? t('settings.title') : '设置'}
        </h2>
      </div>
      
      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4" style={{ color: themeConfig.primary }} />
              <h3 className="text-sm font-medium" style={{ color: themeConfig.heading }}>
                {t('settings.gitIntegration')}
              </h3>
            </div>

            <div
              className="flex items-center rounded-md border p-2.5 text-xs"
              style={{
                backgroundColor: gitConnected ? `${themeConfig.success}10` : `${themeConfig.warning}10`,
                borderColor: gitConnected ? `${themeConfig.success}30` : `${themeConfig.warning}30`,
              }}
            >
              <div className="flex items-center gap-2">
                {gitConnected ? (
                  <CheckCircle className="h-4 w-4" style={{ color: themeConfig.success }} />
                ) : (
                  <AlertCircle className="h-4 w-4" style={{ color: themeConfig.warning }} />
                )}
                <span style={{ color: gitConnected ? themeConfig.success : themeConfig.warning }}>
                  {gitConnected ? t('settings.gitConfigured') : t('settings.gitNotConfigured')}
                </span>
              </div>
            </div>

            <div className="space-y-3 rounded-lg border p-4" style={{ borderColor: themeConfig.border }}>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium" style={{ color: themeConfig.textMuted }}>
                  {t('settings.gitConnection')}
                </Label>
                {gitBranches.length > 0 && (
                  <span className="text-[11px]" style={{ color: themeConfig.textMuted }}>
                    {t('git.availableBranches')}: {gitBranches.map((branch) => branch.name).join(', ')}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs" style={{ color: themeConfig.text }}>
                    {t('git.provider')}
                  </Label>
                  <select
                    value={gitConfig.provider}
                    onChange={(e) => setGitConfig({ provider: e.target.value as typeof gitConfig.provider })}
                    className="h-9 w-full rounded-md border px-2 text-xs"
                    style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
                  >
                    <option value="github">GitHub</option>
                    <option value="gitee">Gitee</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" style={{ color: themeConfig.text }}>
                    {t('git.branch')}
                  </Label>
                  <Input
                    value={gitConfig.branch}
                    onChange={(e) => setGitConfig({ branch: e.target.value })}
                    placeholder="main"
                    className="h-9 text-xs"
                    style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Key className="h-3.5 w-3.5" style={{ color: themeConfig.textMuted }} />
                  <Label className="text-xs" style={{ color: themeConfig.text }}>
                    {t('git.token')}
                  </Label>
                </div>
                <div className="relative">
                  <Input
                    type={showGitToken ? 'text' : 'password'}
                    value={getDecryptedToken()}
                    onChange={(e) => setGitConfig({ token: e.target.value })}
                    placeholder={t('git.tokenPlaceholder')}
                    className="h-9 pr-10 text-xs"
                    style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
                  />
                  <button
                    onClick={() => setShowGitToken(!showGitToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: themeConfig.textMuted }}
                  >
                    {showGitToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs" style={{ color: themeConfig.text }}>
                    {t('git.namespace')}
                  </Label>
                  <Input
                    value={gitConfig.ownerOrNamespace}
                    onChange={(e) => setGitConfig({ ownerOrNamespace: e.target.value })}
                    placeholder="owner / group"
                    className="h-9 text-xs"
                    style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" style={{ color: themeConfig.text }}>
                    {t('git.repository')}
                  </Label>
                  <Input
                    list="git-settings-repo-options"
                    value={gitConfig.repo}
                    onChange={(e) => setGitConfig({ repo: e.target.value })}
                    placeholder="repo"
                    className="h-9 text-xs"
                    style={{ backgroundColor: themeConfig.input, borderColor: themeConfig.border, color: themeConfig.text }}
                  />
                  <datalist id="git-settings-repo-options">
                    {gitRepos.map((repo) => (
                      <option key={repo.id} value={repo.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  onClick={handleGitConnect}
                  disabled={isGitConnecting}
                  className="w-full min-w-0"
                  style={{
                    backgroundColor: themeConfig.primary,
                    color: themeConfig.buttonText || '#fff',
                  }}
                >
                  {isGitConnecting ? (
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <FolderGit2 className="mr-2 h-4 w-4" />
                  )}
                  {gitConnected ? t('git.reconnect') : t('git.connect')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setActivePanel('git-files')}
                  disabled={isGitConnecting}
                  className="w-full min-w-0"
                  style={{
                    borderColor: themeConfig.border,
                    color: isGitConnecting ? themeConfig.muted : themeConfig.text,
                    backgroundColor: themeConfig.card,
                  }}
                >
                  {t('settings.openGitPanel')}
                </Button>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  )
}

export default SettingsPanel
