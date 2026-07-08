import React from "react"
import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { headers } from 'next/headers'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toaster'
import './globals.css'
import 'katex/dist/katex.min.css'

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const shouldEnableAnalytics = process.env.NODE_ENV === 'production'
  const nonce = (await headers()).get('x-nonce') || undefined

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          nonce={nonce}
        >
          {children}
          <Toaster />
          {shouldEnableAnalytics ? <Analytics /> : null}
        </ThemeProvider>
      </body>
    </html>
  )
}
