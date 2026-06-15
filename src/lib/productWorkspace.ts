import type { AmazonPlannerSessionDraft, ProductWorkspace, ProductWorkspaceSixViewVersion } from '../types'
import { DEFAULT_AMAZON_PROMPT_DRAFT } from './amazonPrompt'

type CreateEmptyProductWorkspaceInput = {
  id: string
  title: string
  createdAt?: number
}

const SIX_VIEW_FACT_NOISE_MARKERS = [
  'advertisement featuring',
  'lifestyle ad',
  'DSP ad image plan',
  'Need final JSON',
  'final JSON',
  'I accidentally',
  're-evaluate final',
]

function sanitizeSixViewFactValue(value: string): string {
  return value.split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .map((line) => {
      const lowerLine = line.toLowerCase()
      const noiseIndex = SIX_VIEW_FACT_NOISE_MARKERS
        .map((marker) => lowerLine.indexOf(marker.toLowerCase()))
        .filter((index) => index >= 0)
        .sort((a, b) => a - b)[0]
      const cleanLine = typeof noiseIndex === 'number' ? line.slice(0, noiseIndex) : line
      return cleanLine.replace(/[-–—:;，、\s]+$/g, '').trim()
    })
    .filter(Boolean)
    .join('\n')
}

export function createEmptyProductWorkspace(input: CreateEmptyProductWorkspaceInput): ProductWorkspace {
  const now = input.createdAt ?? Date.now()
  return {
    id: input.id,
    title: input.title,
    mode: 'listing',
    aPlusType: 'standard-large',
    resolution: '1k',
    listingText: '',
    referenceImageIds: [],
    draft: { ...DEFAULT_AMAZON_PROMPT_DRAFT },
    sixViewVersions: [],
    confirmedSixViewVersionId: null,
    seriesStyleGuides: {
      listing: '',
      aplus: '',
      dsp: '',
    },
    styleCandidates: [],
    styleImages: [],
    selectedStyleIndex: null,
    selectedStyleReference: null,
    styleDensityMode: 'rich',
    imagePlans: [],
    aPlusPlans: [],
    dspPlans: [],
    selectedPlanIndex: null,
    selectedAPlusPlanIndex: null,
    selectedDspPlanIndex: null,
    actionProgress: {},
    createdAt: now,
    updatedAt: now,
  }
}

export function buildStandardSixViewPrompt(workspace: Pick<ProductWorkspace, 'draft'>, editInstruction = ''): string {
  const draft = workspace.draft
  const fact = (label: string, value: string) => {
    const cleanValue = sanitizeSixViewFactValue(value)
    return cleanValue ? `${label}: ${cleanValue}` : ''
  }
  const facts = [
    fact('Product', draft.productTitle),
    fact('Category', draft.category),
    fact('Brand/model', draft.brand),
    fact('Color', draft.color),
    fact('Material/finish', draft.material),
    fact('Key details', draft.sellingPoints),
    fact('Package includes', draft.packageIncludes),
    fact('Do not show', draft.forbidden),
  ].filter(Boolean)

  return [
    'Create a standardized six-view product reference image from the supplied product reference images.',
    'Use the supplied images as the primary source of truth for the permanent product structure. Use product facts only to clarify identity, color, materials, included permanent parts, and visible details.',
    'The output must be one clean 2x3 grid on a plain white or light neutral background. This means 3 columns x 2 rows on one square canvas, not 2 columns x 3 rows.',
    'Grid cell order by position: cell 1 top-left front view, cell 2 top-center back view, cell 3 top-right left side view, cell 4 bottom-left right side view, cell 5 bottom-center top view, cell 6 bottom-right bottom view.',
    'Keep the grid order stable. Do not swap, omit, duplicate, or relabel the top-view and bottom-view cells.',
    'Cell 3, the top-right left side view, must be a true orthographic side profile. It should show the left-side silhouette, product depth, side panel geometry, side seams, side feet, and side-mounted parts as seen from exactly 90 degrees.',
    'Cell 4, the bottom-left right side view, must be the opposite true orthographic side profile. It must mirror the same product volume and show the right-side silhouette and right-side mounted parts from exactly 90 degrees.',
    'Do not turn either side view into a front-side, rear-side, top-side, or three-quarter perspective. Side views must not show readable front panels, front logos, front drawer faces, rear panels, or overhead control surfaces unless those parts physically wrap around and are visible from the exact side.',
    'For side views, preserve handle-side details, hinges, knobs, side panels, vents, seams, feet, lips, and protruding parts with correct left/right placement and thickness. Do not duplicate a handle on both sides unless the original references prove it exists on both sides.',
    'Cell 5, the bottom-center top view, must be a true vertical overhead orthographic view looking straight down at the product top/control-panel surface, not a front-top, three-quarter, angled, or perspective view.',
    'A true top view shows the top footprint, top surface, rim/lip, top openings, upper seams, and horizontal controls as an overhead projection. It must not show front face height, rear face height, side wall height, a readable vertical front panel, a drawer front, or a handle hanging downward unless that part is physically visible from directly above.',
    'Cell 6, the bottom-right bottom view, must be a true vertical underside view looking straight up at the base/feet/underside, not a rear-bottom or angled perspective view.',
    'If the source images do not show a perfect top or bottom photo, infer conservatively from the front, back, and side references. Prefer a flatter orthographic documentation view over a beautiful perspective render.',
    'Each panel must show the same exact product with consistent proportions, dimensions, color, material, permanent accessories, openings, handles, vents, control panels, seams, feet, and distinctive structural details.',
    'Treat original product reference photos as authoritative for true color, material finish, brand marks, and permanent geometry.',
    'If a previous six-view candidate is supplied, use it only as a draft layout to correct; never let it override the original product references when color, material, logo, shape, or structure conflict.',
    'If exact product measurements or aspect ratios are supplied, enforce those proportions across all six panels instead of visually stretching the product taller, wider, deeper, or more symmetrical.',
    'Use orthographic product documentation style. Keep the product centered and upright in every panel.',
    'Do not simplify the product into a generic box, cylinder, appliance, bottle, or placeholder shape. Do not make the body taller, deeper, wider, rounder, squarer, or more symmetrical than the visual evidence supports.',
    'For products with movable or openable parts, document the permanent body structure and the movable part geometry clearly. If the source images show an important open/use state, preserve that state in the most relevant front or top view without changing the permanent body proportions.',
    'For movable or openable structural parts, preserve every visible product feature as real geometry: lids, covers, doors, flaps, panels, hinges, latches, handles, baskets, trays, lips, rims, joints, and brackets. Preserve curved edges, rounded corners, bevels, lips, thickness, transparency, and opening angle exactly as shown in the source images. Do not flatten, straighten, square off, simplify, or replace these parts with generic flat panels or rectangular sheets.',
    'Preserve authentic on-product brand logos, wordmarks, model labels, printed marks, decals, and control-panel marks exactly where they appear in the supplied product images.',
    'Keep real wordmarks visible in every panel where that product surface is visible, especially the front view and top/control-panel view.',
    'Never output a blank or generic front-facing control panel when the supplied product images show a brand wordmark.',
    'Do not remove, blur, replace, or relocate real on-product brand marks.',
    'Ignore scene props, phones, drinks, loose ice, food, background objects, lifestyle decorations, and duplicate display items unless they are actual included accessories named in the package contents.',
    'Do not add marketing text, decorative scene props, lifestyle backgrounds, callouts, extra marketing badges, floating logos, platform logos, hands, people, extra accessories, or angle labels.',
    facts.length ? `Product facts:\n${facts.join('\n')}` : '',
    editInstruction.trim() ? `Edit instruction:\n${editInstruction.trim()}` : '',
  ].filter(Boolean).join('\n\n')
}

export function createProductWorkspaceSixViewVersion(version: ProductWorkspaceSixViewVersion): ProductWorkspaceSixViewVersion {
  return {
    id: version.id,
    imageId: version.imageId,
    prompt: version.prompt,
    inputImageIds: [...version.inputImageIds],
    createdAt: version.createdAt,
  }
}

export function getConfirmedSixViewVersion(workspace: Pick<ProductWorkspace, 'sixViewVersions' | 'confirmedSixViewVersionId'>): ProductWorkspaceSixViewVersion | null {
  if (!workspace.confirmedSixViewVersionId) return null
  return workspace.sixViewVersions.find((version) => version.id === workspace.confirmedSixViewVersionId) ?? null
}

export function getConfirmedSixViewImageId(workspace: Pick<ProductWorkspace, 'sixViewVersions' | 'confirmedSixViewVersionId'>): string | null {
  return getConfirmedSixViewVersion(workspace)?.imageId ?? null
}

export function getStandardSixViewSourceImageIds(workspace: Pick<ProductWorkspace, 'referenceImageIds' | 'sixViewVersions'>): string[] {
  return (workspace.referenceImageIds || []).filter((id, index, ids): id is string => (
    typeof id === 'string' &&
    Boolean(id.trim()) &&
    ids.indexOf(id) === index
  ))
}

export function collectProductWorkspaceImageIds(workspace: Pick<ProductWorkspace, 'referenceImageIds' | 'sixViewVersions' | 'styleImages'>): string[] {
  return [
    ...(workspace.referenceImageIds || []),
    ...(workspace.sixViewVersions || []).map((version) => version.imageId),
    ...(workspace.styleImages || []).map((image) => image.imageId),
  ].filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
}

export function toProductWorkspaceDraft(draft: AmazonPlannerSessionDraft): AmazonPlannerSessionDraft {
  return { ...draft }
}
