import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import styleReferenceLibrarySource from './StyleReferenceLibrary.tsx?raw'
import StyleReferenceLibrary from './StyleReferenceLibrary'

describe('StyleReferenceLibrary', () => {
  it('renders reusable style references', () => {
    const html = renderToStaticMarkup(
      <StyleReferenceLibrary
        items={[{
          imageId: 'img-1',
          label: 'Clean Retail',
          description: 'Bright retail layout',
          source: 'planner-history',
          plannerSessionId: 'session-1',
          productTitle: 'Probe',
          mode: 'listing',
          updatedAt: 1,
        }]}
        selectedImageId="img-1"
        imageSrcById={{ 'img-1': 'data:image/png;base64,aaa' }}
        onUseStyle={() => {}}
        onPreview={() => {}}
        onRestoreSession={() => {}}
      />,
    )

    expect(html).toContain('复用已生成风格板')
    expect(html).toContain('同一工作区内 Listing、A+、DSP 可复用。')
    expect(html).toContain('Clean Retail')
    expect(html).toContain('用作当前风格')
    expect(html).toContain('已使用')
  })

  it('renders history style boards as readable horizontal rows', () => {
    expect(styleReferenceLibrarySource).toContain('grid grid-cols-[104px,minmax(0,1fr)]')
    expect(styleReferenceLibrarySource).toContain('line-clamp-3')
    expect(styleReferenceLibrarySource).not.toContain('xl:grid-cols-4')
  })
})
