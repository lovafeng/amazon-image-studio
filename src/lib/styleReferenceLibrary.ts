import type { AmazonPlannerSelectedStyleReference, AmazonPlannerSession } from '../types'
import type { AmazonPlannerMode } from './listingPlanner'

export interface StyleReferenceLibraryItem extends AmazonPlannerSelectedStyleReference {
  productTitle: string
  mode: AmazonPlannerMode
  updatedAt: number
}

interface RankedStyleReference extends StyleReferenceLibraryItem {
  rank: number
}

function normalizeComparableText(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase()
}

function getModeRank(sessionMode: AmazonPlannerMode, currentMode: AmazonPlannerMode) {
  return sessionMode === currentMode ? 0 : 1
}

function getProductRank(sessionProductTitle: string, currentProductTitle: string) {
  const sessionTitle = normalizeComparableText(sessionProductTitle)
  const currentTitle = normalizeComparableText(currentProductTitle)
  if (!currentTitle) return 1
  return sessionTitle === currentTitle ? 0 : 1
}

function getStyleCandidate(session: AmazonPlannerSession, candidateIndex: number) {
  return session.styleCandidates[candidateIndex] ?? null
}

export function buildStyleReferenceLibrary(options: {
  sessions: AmazonPlannerSession[]
  currentMode: AmazonPlannerMode
  productTitle: string
  limit?: number
}): StyleReferenceLibraryItem[] {
  const limit = options.limit ?? 12
  const items: RankedStyleReference[] = []

  for (const session of options.sessions) {
    const productTitle = session.draft.productTitle.trim() || session.title
    const productRank = getProductRank(productTitle, options.productTitle)
    const modeRank = getModeRank(session.mode, options.currentMode)
    if (productRank !== 0 || modeRank !== 0) continue

    for (const styleImage of session.styleImages) {
      const imageId = styleImage.imageId?.trim()
      const candidate = getStyleCandidate(session, styleImage.candidateIndex)
      if (!imageId || !candidate) continue

      items.push({
        imageId,
        label: candidate.label,
        description: candidate.description,
        source: 'planner-history',
        candidateIndex: styleImage.candidateIndex,
        plannerSessionId: session.id,
        productTitle,
        mode: session.mode,
        updatedAt: session.updatedAt,
        rank: 0,
      })
    }
  }

  return items
    .sort((a, b) => a.rank - b.rank || b.updatedAt - a.updatedAt)
    .filter((item, index, sorted) => sorted.findIndex((candidate) => candidate.imageId === item.imageId) === index)
    .slice(0, limit)
    .map(({ rank: _rank, ...item }) => item)
}
