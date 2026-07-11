/* @vitest-environment jsdom */

import { describe, expect, it } from 'vitest'
import {
  normalizeKnownRemoteImageSource,
  normalizeRenderedHtmlImageSources,
} from '@/lib/remote-image-sources'

describe('normalizeKnownRemoteImageSource', () => {
  it('converts github blob and tree image urls to raw content urls', () => {
    expect(
      normalizeKnownRemoteImageSource(
        'https://github.com/pyrohao/VisualMD/tree/main/public/assets/screenshots/Theme_Switch_Demo.gif'
      )
    ).toBe(
      'https://raw.githubusercontent.com/pyrohao/VisualMD/main/public/assets/screenshots/Theme_Switch_Demo.gif'
    )

    expect(
      normalizeKnownRemoteImageSource(
        'https://github.com/pyrohao/VisualMD/blob/main/public/assets/screenshots/AI_Git_VersionControl_Demo.gif'
      )
    ).toBe(
      'https://raw.githubusercontent.com/pyrohao/VisualMD/main/public/assets/screenshots/AI_Git_VersionControl_Demo.gif'
    )
  })

  it('keeps non-image github urls unchanged', () => {
    expect(
      normalizeKnownRemoteImageSource(
        'https://github.com/pyrohao/VisualMD/tree/main/public/assets/screenshots'
      )
    ).toBe('https://github.com/pyrohao/VisualMD/tree/main/public/assets/screenshots')
  })
})

describe('normalizeRenderedHtmlImageSources', () => {
  it('rewrites matching img src attributes in rendered html', () => {
    const html = [
      '<p><img src="https://github.com/pyrohao/VisualMD/tree/main/public/assets/screenshots/Theme_Switch_Demo.gif" alt="Theme"></p>',
      '<p><img src="https://example.com/demo.gif" alt="External"></p>',
    ].join('')

    const normalized = normalizeRenderedHtmlImageSources(html)

    expect(normalized).toContain(
      'src="https://raw.githubusercontent.com/pyrohao/VisualMD/main/public/assets/screenshots/Theme_Switch_Demo.gif"'
    )
    expect(normalized).toContain('src="https://example.com/demo.gif"')
  })
})
