/**
 * AI服务模块
 *
 * 提供统一的AI调用接口，支持OpenAI兼容格式
 * - 多提供商支持
 * - 提示词模板管理
 * - 错误处理
 */

import type { ProviderConfig } from '@/stores/settingsStore'

/**
 * 生成选项
 */
export interface AIGenerateOptions {
  /** 用户提示词 */
  prompt: string
  /** 系统提示词（可选） */
  systemPrompt?: string
  /** 温度参数 */
  temperature?: number
  /** 最大token数 */
  maxTokens?: number
}

/**
 * 生成结果
 */
export interface AIGenerateResult {
  /** 生成的内容 */
  content: string
  /** 文件名（从Front Matter提取） */
  fileName: string
  /** 是否成功 */
  success: boolean
  /** 错误信息 */
  error?: string
}

/**
 * 系统提示词模板
 * 指导AI生成符合要求的Markdown文档
 */
const DEFAULT_SYSTEM_PROMPT = `你是一个专业的Markdown文档生成助手。
请根据用户的描述生成格式规范、结构清晰的Markdown文档。

## 要求

1. **文档结构**
   - 使用YAML Front Matter开头，包含 title、date、description 字段
   - 使用合适的标题层级（H1-H6），H1作为文档主标题
   - 内容层次分明，逻辑清晰

2. **格式规范**
   - 使用标准Markdown语法（GFM）
   - 适当使用列表、表格、代码块等元素增强可读性
   - 代码块标注语言类型

3. **内容质量**
   - 内容完整，覆盖用户描述的所有要点
   - 语言流畅，专业术语使用准确
   - 适当添加示例说明

4. **文件名**
   - 在Front Matter中使用 

## 输出格式示例

\`\`\`markdown
---
title: 文档标题
date: 2024-01-15
description: 文档描述
---

# 文档标题

## 第一部分

内容...

## 第二部分

内容...
\`\`\`

## 重要提示

- 只输出Markdown内容，不要包含任何解释性文字
- 确保Front Matter格式正确
- 文档标题要与Front Matter中的title一致
- 使用中文输出（除非用户要求其他语言）`

/**
 * AI服务类
 */
export class AIService {
  private config: ProviderConfig

  constructor(config: ProviderConfig) {
    this.config = config
  }

  /**
   * 生成Markdown文档
   */
  async generateMarkdown(options: AIGenerateOptions): Promise<AIGenerateResult> {
    const { prompt, systemPrompt, temperature, maxTokens } = options

    try {
      const response = await this.callOpenAIAPI({
        prompt,
        systemPrompt: systemPrompt || DEFAULT_SYSTEM_PROMPT,
        temperature: temperature ?? this.config.temperature,
        maxTokens: maxTokens ?? this.config.maxTokens,
      })

      // 提取文件名
      const fileName = this.extractFileName(response)

      return {
        content: response,
        fileName,
        success: true,
      }
    } catch (error) {
      return {
        content: '',
        fileName: '',
        success: false,
        error: error instanceof Error ? error.message : '未知错误',
      }
    }
  }

  /**
   * 调用OpenAI兼容API
   */
  private async callOpenAIAPI(options: {
    prompt: string
    systemPrompt: string
    temperature: number
    maxTokens: number
  }): Promise<string> {
    const { prompt, systemPrompt, temperature, maxTokens } = options

    const url = `${this.config.baseUrl}/chat/completions`
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
      ...this.config.customHeaders,
    }

    const body = {
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature,
      max_tokens: maxTokens,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        errorData.error?.message || `请求失败: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()
    const message = data.choices?.[0]?.message
    
    // 兼容不同厂商的响应格式
    // 1. 标准OpenAI格式: message.content
    // 2. 智谱AI等: message.reasoning_content
    const content = message?.content || message?.reasoning_content

    if (!content) {
      throw new Error('API返回内容为空')
    }

    return content
  }

  /**
   * 从生成的内容中提取文件名
   * 优先从Front Matter的title字段提取
   */
  private extractFileName(content: string): string {
    // 尝试从Front Matter提取title
    const frontMatterMatch = content.match(/^---\s*\n[\s\S]*?title:\s*(.+?)\s*\n[\s\S]*?---/)
    if (frontMatterMatch) {
      const title = frontMatterMatch[1].trim()
      // 清理非法字符
      const safeTitle = title.replace(/[<>:"/\\|?*]/g, '_')
      return `${safeTitle}.md`
    }

    // 尝试从H1标题提取
    const h1Match = content.match(/^#\s+(.+)$/m)
    if (h1Match) {
      const title = h1Match[1].trim()
      const safeTitle = title.replace(/[<>:"/\\|?*]/g, '_')
      return `${safeTitle}.md`
    }

    // 默认文件名
    return `AI生成文档-${new Date().toISOString().slice(0, 10)}.md`
  }

  /**
   * 验证配置是否有效
   */
  validateConfig(): boolean {
    return !!(
      this.config.apiKey &&
      this.config.baseUrl &&
      this.config.model
    )
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.callOpenAIAPI({
        prompt: 'Hello',
        systemPrompt: 'Reply with "OK" only.',
        temperature: 0,
        maxTokens: 10,
      })

      return {
        success: true,
        message: '连接成功',
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '连接失败',
      }
    }
  }
}

/**
 * 创建AI服务实例
 */
export function createAIService(config: ProviderConfig): AIService {
  return new AIService(config)
}

export default AIService
