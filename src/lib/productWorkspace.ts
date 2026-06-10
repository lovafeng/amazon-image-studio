import type { AmazonPlannerSessionDraft, ProductWorkspace, ProductWorkspaceSixViewVersion } from '../types'

export function buildStandardSixViewPrompt(workspace: Pick<ProductWorkspace, 'draft'>, editInstruction = ''): string {
  const draft = workspace.draft
  const facts = [
    draft.productTitle.trim() ? `Product: ${draft.productTitle.trim()}` : '',
    draft.category.trim() ? `Category: ${draft.category.trim()}` : '',
    draft.brand.trim() ? `Brand/model: ${draft.brand.trim()}` : '',
    draft.color.trim() ? `Color: ${draft.color.trim()}` : '',
    draft.material.trim() ? `Material/finish: ${draft.material.trim()}` : '',
    draft.sellingPoints.trim() ? `Key details: ${draft.sellingPoints.trim()}` : '',
    draft.packageIncludes.trim() ? `Package includes: ${draft.packageIncludes.trim()}` : '',
    draft.forbidden.trim() ? `Do not show: ${draft.forbidden.trim()}` : '',
  ].filter(Boolean)

  return [
    'Create a standardized six-view product reference image from the supplied product reference images.',
    'Use the supplied images as the primary source of truth for the permanent product structure. Use product facts only to clarify identity, color, materials, included permanent parts, and visible details.',
    'The output must be one clean 2x3 grid on a plain white or light neutral background.',
    'Grid order, left to right, top row first: front view, back view, left side view, right side view, top view, bottom view.',
    'Each panel must show the same exact product with consistent proportions, dimensions, color, material, permanent accessories, openings, handles, vents, control panels, seams, feet, and distinctive structural details.',
    'Use orthographic product documentation style. Keep the product centered and upright in every panel.',
    'Do not simplify the product into a generic box, cylinder, appliance, bottle, or placeholder shape. Do not make the body taller, deeper, wider, rounder, squarer, or more symmetrical than the visual evidence supports.',
    'For products with movable or openable parts, document the permanent body structure and the movable part geometry clearly. If the source images show an important open/use state, preserve that state in the most relevant front or top view without changing the permanent body proportions.',
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
