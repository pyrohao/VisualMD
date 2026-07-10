import { describe, expect, it } from 'vitest'
import { getMermaidConfig, getMermaidTheme } from '@/lib/mermaid'

describe('getMermaidTheme', () => {
  it('maps dark theme to mermaid dark mode', () => {
    expect(getMermaidTheme('dark')).toBe('dark')
  })

  it('maps non-dark themes to mermaid neutral mode', () => {
    expect(getMermaidTheme('light')).toBe('neutral')
    expect(getMermaidTheme('reading')).toBe('neutral')
  })

  it('uses html labels for flowcharts to preserve multi-line node content', () => {
    const config = getMermaidConfig('light')

    expect(config.flowchart.htmlLabels).toBe(true)
    expect(config.flowchart.useMaxWidth).toBe(true)
    expect(config.securityLevel).toBe('strict')
  })
})
