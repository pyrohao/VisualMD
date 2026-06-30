import React from "react"
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'
import 'react-diff-view/style/index.css'

export const metadata: Metadata = {
  title: 'Markdown Visual Editor - 可视化Markdown编辑器',
  description: '一个创新的Markdown可视化编辑器，将文档转换为树状结构进行编辑，支持实时预览和双向同步',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon.png',
        type: 'image/png',
      },
    ],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans antialiased">
        {children}
        <Toaster />
        <Analytics />
      </body>
    </html>
  )
}
