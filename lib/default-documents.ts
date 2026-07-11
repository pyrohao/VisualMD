export interface WelcomeDocumentSeed {
  name: string
  content: string
}

interface WelcomeDocumentAsset {
  name: string
  assetPath: string
}

const DEFAULT_WELCOME_DOCUMENT_ASSETS: ReadonlyArray<WelcomeDocumentAsset> = [
  {
    name: 'Welcome.md',
    assetPath: '/assets/default-documents/welcome.en.md',
  },
  {
    name: '欢迎使用.md',
    assetPath: '/assets/default-documents/welcome.zh-CN.md',
  },
]

async function loadWelcomeDocumentAsset({
  name,
  assetPath,
}: WelcomeDocumentAsset): Promise<WelcomeDocumentSeed | null> {
  try {
    const response = await fetch(assetPath)
    if (!response.ok) {
      throw new Error(`Failed to load welcome document: ${assetPath}`)
    }

    return {
      name,
      content: await response.text(),
    }
  } catch (error) {
    console.error('Failed to load welcome document:', error)
    return null
  }
}

export async function loadDefaultWelcomeDocuments(): Promise<ReadonlyArray<WelcomeDocumentSeed>> {
  const documents = await Promise.all(DEFAULT_WELCOME_DOCUMENT_ASSETS.map(loadWelcomeDocumentAsset))

  return documents.filter(
    (document): document is WelcomeDocumentSeed =>
      document !== null && document.content.trim().length > 0
  )
}
