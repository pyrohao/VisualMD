'use client'

/**
 * 帮助对话框组件
 *
 * 显示项目信息和帮助内容的模态对话框
 * 参考 Obsidian 的帮助页面设计
 */

import { useState, useEffect } from 'react'
import { X, BookOpen, MessageCircle, Github, ExternalLink } from 'lucide-react'
import { useThemeStore, themeConfigs } from '@/stores/themeStore'
import { useTranslation } from '@/stores/languageStore'
import { Button } from './ui/button'

// Discord 图标组件 - 线性轮廓风格，与其他图标统一
function DiscordIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M8 12a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
      <path d="M14 12a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
      <path d="M15.5 17c0 1 1.5 2 2.5 2s2.5 -1 2.5 -2l-1 -6.5l-3 -1.5l-5 1.5l-5 -1.5l-3 1.5l-1 6.5c0 1 1.5 2 2.5 2s2.5 -1 2.5 -2" />
      <path d="M7 16.5c1.5 -1 3.5 -1.5 5 -1.5s3.5 .5 5 1.5" />
      <path d="M15.5 5.5l2.5 1.5" />
      <path d="M8.5 5.5l-2.5 1.5" />
    </svg>
  )
}

interface HelpDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HelpDialog({ open, onOpenChange }: HelpDialogProps) {
  const { getThemeConfig } = useThemeStore()
  const [mounted, setMounted] = useState(false)
  const themeConfig = mounted ? getThemeConfig() : themeConfigs.light
  const { t } = useTranslation()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!open) return null

  const helpItems = mounted ? [
    {
      icon: BookOpen,
      title: t('help.contactAuthor'),
      description: t('help.contactDesc'),
      action: t('help.contact'),
      onClick: () => window.open('https://pyrohao.me', '_blank'),
    },
    {
      icon: MessageCircle,
      title: t('help.community'),
      description: t('help.communityDesc'),
      action: t('help.join'),
      onClick: () => window.open('https://qun.qq.com/universal-share/share?ac=1&authKey=a0wiFbQB4SvHa%2BVIL%2B89WngP2QggeiY2zbd8CUNkOzB7UdbJFheJ4lXqPqBqspCN&busi_data=eyJncm91cENvZGUiOiIxMDc5MTU4NjU3IiwidG9rZW4iOiJwSnpmZFI0emlRSk0zY0RjOEROS2p1VDdCbXBHOURrUkJEN1VQdTJoaDEwLzl0TEdINytHZy9VMlNPcEFRTkVJIiwidWluIjoiMjU2NTg2Nzg1OSJ9&data=2WrdvR_q2tfrEN-xgb-KS_wINzwbhZ42rmJnxjipBGuk6PrZpUOSIC9ToBNBt2qJvgWFigVZwXCevigx-DQCww&svctype=4&tempid=h5_group_info', '_blank'),
    },
    {
      icon: DiscordIcon,
      title: 'Discord',
      description: t('help.discordDesc'),
      action: t('help.join'),
      onClick: () => window.open('https://discord.gg/8HRs35ne', '_blank'),
    },
    {
      icon: Github,
      title: 'GitHub',
      description: t('help.githubDesc'),
      action: t('help.view'),
      onClick: () => window.open('https://github.com/LuminousHao/VisualMD', '_blank'),
    },
  ] : [
    {
      icon: BookOpen,
      title: '联系作者',
      description: '交流、学习、反馈问题',
      action: '联系',
      onClick: () => window.open('https://pyrohao.me', '_blank'),
    },
    {
      icon: MessageCircle,
      title: '社区讨论',
      description: '加入群聊，与其他用户交流使用心得。',
      action: '加入',
      onClick: () => window.open('https://qun.qq.com/universal-share/share?ac=1&authKey=a0wiFbQB4SvHa%2BVIL%2B89WngP2QggeiY2zbd8CUNkOzB7UdbJFheJ4lXqPqBqspCN&busi_data=eyJncm91cENvZGUiOiIxMDc5MTU4NjU3IiwidG9rZW4iOiJwSnpmZFI0emlRSk0zY0RjOEROS2p1VDdCbXBHOURrUkJEN1VQdTJoaDEwLzl0TEdINytHZy9VMlNPcEFRTkVJIiwidWluIjoiMjU2NTg2Nzg1OSJ9&data=2WrdvR_q2tfrEN-xgb-KS_wINzwbhZ42rmJnxjipBGuk6PrZpUOSIC9ToBNBt2qJvgWFigVZwXCevigx-DQCww&svctype=4&tempid=h5_group_info', '_blank'),
    },
    {
      icon: DiscordIcon,
      title: 'Discord',
      description: '加入 Discord 社区，与开发者和其他用户实时交流',
      action: '加入',
      onClick: () => window.open('https://discord.gg/8HRs35ne', '_blank'),
    },
    {
      icon: Github,
      title: 'GitHub',
      description: '查看源代码、提交 Issue 或贡献代码。',
      action: '查看',
      onClick: () => window.open('https://github.com/LuminousHao/VisualMD', '_blank'),
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* 对话框 */}
      <div
        className="relative w-full max-w-lg mx-4 rounded-xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: themeConfig.card }}
      >
        {/* 关闭按钮 */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 p-2 rounded-lg transition-colors z-10"
          style={{ color: themeConfig.muted }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = themeConfig.hover
            e.currentTarget.style.color = themeConfig.text
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = themeConfig.muted
          }}
        >
          <X className="h-5 w-5" />
        </button>

        {/* 内容区域 */}
        <div className="p-8">
          {/* Logo 和标题 */}
          <div className="text-center mb-8">
            {/* Logo 图片 - 无背景框 */}
            <div className="w-20 h-20 mx-auto mb-4 flex items-center justify-center">
              <img
                src="/apple-icon.png"
                alt="LOGO"
                className="w-full h-full object-contain"
              />
            </div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: themeConfig.text }}>
              Visual MD
            </h1>
            <p className="text-sm" style={{ color: themeConfig.muted }}>
              版本 2.0.0
            </p>
          </div>

          {/* 帮助项目列表 */}
          <div className="space-y-3">
            {helpItems.map((item, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-4 rounded-lg border transition-all duration-200"
                style={{
                  borderColor: themeConfig.border,
                  backgroundColor: themeConfig.background,
                }}
              >
                {/* 图标 */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: themeConfig.primary + '15' }}
                >
                  <item.icon className="h-5 w-5" style={{ color: themeConfig.primary }} />
                </div>

                {/* 内容 */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium mb-0.5" style={{ color: themeConfig.text }}>
                    {item.title}
                  </h3>
                  <p className="text-xs" style={{ color: themeConfig.muted }}>
                    {item.description}
                  </p>
                </div>

                {/* 操作按钮 - 使用主题主色 */}
                <Button
                  size="sm"
                  onClick={item.onClick}
                  className="flex-shrink-0 text-xs h-8 px-3 border-0"
                  style={{
                    backgroundColor: themeConfig.primary,
                    color: '#ffffff',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '0.9'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '1'
                  }}
                >
                  {item.action}
                  <ExternalLink className="ml-1 h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          {/* 底部信息 */}
          <div className="mt-8 pt-6 border-t text-center" style={{ borderColor: themeConfig.border }}>
            <p className="text-xs" style={{ color: themeConfig.muted }}>
              © 2026 Visual MD,{' '}
              <a
                href="https://github.com/pyrohao"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: themeConfig.primary }}
              >
                PyroHao
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default HelpDialog
