/**
 * 文件系统服务
 * 
 * 本模块提供文件操作功能，包括：
 * 1. 文件打开（使用File System Access API）
 * 2. 文件保存
 * 3. 文件下载（降级方案）
 * 
 * 对应技术文档4.3节 - IFileSystemService
 */

import type { FileOperationResult } from '@/types/tree'

/**
 * 检查浏览器是否支持File System Access API
 */
export function isFileSystemAccessSupported(): boolean {
  return 'showOpenFilePicker' in window && 'showSaveFilePicker' in window
}

/**
 * 打开文件选择器并读取文件
 * 对应技术文档4.3节 - openFile()
 * 
 * @returns 文件操作结果
 */
export async function openFile(): Promise<FileOperationResult> {
  // 检查是否支持File System Access API
  if (!isFileSystemAccessSupported()) {
    // 降级方案：使用传统input
    return openFileWithInput()
  }

  try {
    // 使用File System Access API打开文件
    const [fileHandle] = await (window as any).showOpenFilePicker({
      types: [
        {
          description: 'Markdown Files',
          accept: {
            'text/markdown': ['.md', '.markdown', '.mdx'],
            'text/plain': ['.txt'],
          },
        },
      ],
      multiple: false,
    })

    const file = await fileHandle.getFile()
    const content = await file.text()

    return {
      success: true,
      fileName: file.name,
      content,
    }
  } catch (error) {
    // 用户取消或其他错误
    if ((error as Error).name === 'AbortError') {
      return { success: false }
    }
    
    console.error('Failed to open file:', error)
    
    // 降级到传统input
    return openFileWithInput()
  }
}

/**
 * 使用传统input方式打开文件（降级方案）
 */
function openFileWithInput(): Promise<FileOperationResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.mdx,.txt'
    
    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (!file) {
        resolve({ success: false })
        return
      }

      try {
        const content = await file.text()
        resolve({
          success: true,
          fileName: file.name,
          content,
        })
      } catch (error) {
        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to read file',
        })
      }
    }

    input.oncancel = () => {
      resolve({ success: false })
    }

    // 处理用户取消的情况
    setTimeout(() => {
      if (!input.files?.length) {
        // 用户可能取消了，但无法确定，所以不自动resolve
      }
    }, 1000)

    input.click()
  })
}

/**
 * 保存文件
 * 对应技术文档4.3节 - saveFile()
 * 
 * @param content 文件内容
 * @param fileName 文件名
 * @returns 是否保存成功
 */
export async function saveFile(content: string, fileName?: string): Promise<boolean> {
  // 检查是否支持File System Access API
  if (!isFileSystemAccessSupported()) {
    // 降级方案：下载文件
    return downloadFile(content, fileName || 'document.md')
  }

  try {
    const fileHandle = await (window as any).showSaveFilePicker({
      suggestedName: fileName || 'document.md',
      types: [
        {
          description: 'Markdown Files',
          accept: {
            'text/markdown': ['.md', '.markdown'],
            'text/plain': ['.txt'],
          },
        },
      ],
    })

    const writable = await fileHandle.createWritable()
    await writable.write(content)
    await writable.close()

    return true
  } catch (error) {
    // 用户取消
    if ((error as Error).name === 'AbortError') {
      return false
    }

    console.error('Failed to save file:', error)
    
    // 降级到下载
    return downloadFile(content, fileName || 'document.md')
  }
}

/**
 * 下载文件（降级方案）
 * 
 * @param content 文件内容
 * @param fileName 文件名
 * @returns 是否下载成功
 */
export function downloadFile(content: string, fileName: string): boolean {
  try {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.style.display = 'none'
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    URL.revokeObjectURL(url)
    return true
  } catch (error) {
    console.error('Failed to download file:', error)
    return false
  }
}

/**
 * 导出为HTML
 * 
 * @param markdown Markdown内容
 * @param fileName 文件名
 * @returns 是否导出成功
 */
export function exportAsHTML(markdown: string, fileName?: string): boolean {
  // 简单的Markdown到HTML转换
  const html = convertMarkdownToHTML(markdown)
  
  const fullHTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${fileName?.replace('.md', '') || 'Document'}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
      color: #333;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 1.5em;
      margin-bottom: 0.5em;
    }
    h1 { border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
    h2 { border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
    code {
      background: #f5f5f5;
      padding: 0.2em 0.4em;
      border-radius: 3px;
      font-family: 'Courier New', monospace;
    }
    pre {
      background: #f5f5f5;
      padding: 1em;
      border-radius: 5px;
      overflow-x: auto;
    }
    blockquote {
      border-left: 4px solid #ddd;
      margin: 0;
      padding-left: 1em;
      color: #666;
    }
    ul, ol {
      padding-left: 2em;
    }
    table {
      border-collapse: collapse;
      width: 100%;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 0.5em;
      text-align: left;
    }
    th {
      background: #f5f5f5;
    }
  </style>
</head>
<body>
${html}
</body>
</html>`

  return downloadFile(fullHTML, (fileName || 'document').replace('.md', '.html'))
}

/**
 * 导出为 Markdown 文件（原生格式）
 * 
 * @param markdown Markdown内容
 * @param fileName 文件名
 * @returns 是否导出成功
 */
export function exportAsMarkdown(markdown: string, fileName?: string): boolean {
  const defaultFileName = fileName || 'document.md'
  // 确保文件名以 .md 结尾
  const finalFileName = defaultFileName.endsWith('.md') ? defaultFileName : `${defaultFileName}.md`
  
  return downloadFile(markdown, finalFileName)
}

/**
 * 简单的Markdown到HTML转换
 */
function convertMarkdownToHTML(markdown: string): string {
  let html = markdown
    // 移除 Metadata (YAML Front Matter)
    .replace(/^---\n[\s\S]*?\n---\n?/, '')
    // 代码块
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // 标题
    .replace(/^###### (.*$)/gim, '<h6>$1</h6>')
    .replace(/^##### (.*$)/gim, '<h5>$1</h5>')
    .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // 粗体
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // 斜体
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 行内代码
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // 链接
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // 图片
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />')
    // 无序列表
    .replace(/^\- (.+)$/gim, '<li>$1</li>')
    // 有序列表
    .replace(/^\d+\. (.+)$/gim, '<li>$1</li>')
    // 引用
    .replace(/^> (.+)$/gim, '<blockquote>$1</blockquote>')
    // 水平线
    .replace(/^---$/gim, '<hr />')
    // 段落
    .replace(/\n\n/g, '</p><p>')

  // 包装段落
  html = '<p>' + html + '</p>'

  // 清理
  html = html
    .replace(/<p><h/g, '<h')
    .replace(/<\/h([1-6])><\/p>/g, '</h$1>')
    .replace(/<p><pre>/g, '<pre>')
    .replace(/<\/pre><\/p>/g, '</pre>')
    .replace(/<p><blockquote>/g, '<blockquote>')
    .replace(/<\/blockquote><\/p>/g, '</blockquote>')
    .replace(/<p><hr \/>/g, '<hr />')
    .replace(/<hr \/><\/p>/g, '<hr />')
    .replace(/<p><\/p>/g, '')

  // 包装列表 - 使用 [\s\S] 替代 . 以匹配包括换行符在内的所有字符
  html = html.replace(/(<li>[\s\S]*?<\/li>)/, '<ul>$1</ul>')

  return html
}

/**
 * 读取本地文件（用于拖放）
 * 
 * @param file 文件对象
 * @returns 文件操作结果
 */
export async function readFile(file: File): Promise<FileOperationResult> {
  try {
    const content = await file.text()
    return {
      success: true,
      fileName: file.name,
      content,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to read file',
    }
  }
}
