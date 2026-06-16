import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import amazonPlannerSource from './AmazonPlanner.tsx?raw'
import AmazonPlanner, { formatPlannerElapsedLabel, getPlannerRunningMessage, getSubmittedReferenceImageCount, getStyleGenerationStatusText } from './AmazonPlanner'

describe('AmazonPlanner', () => {
  it('renders DSP as a first-class planner mode', () => {
    const html = renderToStaticMarkup(<AmazonPlanner />)

    expect(html).toContain('Listing 图')
    expect(html).toContain('A+ 图')
    expect(html).toContain('DSP 图')
  })

  it('renders the style chooser before the inline action bar without making the action bar float', () => {
    expect(amazonPlannerSource.indexOf('视觉风格选择')).toBeGreaterThan(-1)
    expect(amazonPlannerSource.indexOf('data-amazon-action-bar')).toBeGreaterThan(-1)
    expect(amazonPlannerSource.indexOf('视觉风格选择')).toBeLessThan(amazonPlannerSource.indexOf('data-amazon-action-bar'))
    expect(amazonPlannerSource).not.toContain('data-amazon-action-bar className={`fixed')
    expect(amazonPlannerSource).not.toContain('data-amazon-action-bar className={`sticky')
    expect(amazonPlannerSource).toContain('data-amazon-action-bar className={`mb-4 rounded-xl border p-3')
  })

  it('mentions DSP in the style board guidance for first-class planner modes', () => {
    expect(amazonPlannerSource).toContain('下一步：选择一张风格板作为附图、A+ 和 DSP 的隐藏参考')
    expect(amazonPlannerSource).not.toContain('下一步：选择一张风格板作为附图和 A+ 的隐藏参考')
  })

  it('does not present style boards as fixed final-resolution images', () => {
    expect(amazonPlannerSource).not.toContain('1024x1024 visual style reference board')
    expect(amazonPlannerSource).toContain('视觉风格选择')
  })

  it('restores planner style boards from compressed thumbnails instead of full images', () => {
    const restoreBlock = amazonPlannerSource.slice(
      amazonPlannerSource.indexOf('const restorePlannerSession = async (session: ProductWorkspace) => {'),
      amazonPlannerSource.indexOf('const removePlannerSession = async (sessionId: string) => {'),
    )

    expect(restoreBlock).toContain('ensureImageThumbnailCached(image.imageId)')
    expect(restoreBlock).not.toContain('ensureImageCached(image.imageId)')
  })

  it('formats long-running DSP planning progress for the operator', () => {
    expect(formatPlannerElapsedLabel(65)).toBe('01:05')
    expect(getPlannerRunningMessage('dsp', 91)).toContain('正在生成 11 个 DSP 素材方案')
    expect(getPlannerRunningMessage('dsp', 91)).toContain('已用 01:31')
    expect(getPlannerRunningMessage('dsp', 181)).toContain('可继续等待，或点击停止后重试')
    expect(getPlannerRunningMessage('listing', 91)).not.toContain('11 个 DSP')
  })

  it('updates style boards as each image finishes instead of waiting for every board', () => {
    expect(getStyleGenerationStatusText({
      isGeneratingStyleImages: true,
      candidateCount: 3,
      generatedCount: 1,
      failedCount: 0,
      hasGeneratedStyleImages: true,
    })).toBe('已完成 1/3 张风格板')
    expect(amazonPlannerSource).toContain('updateStyleImageState')
    expect(amazonPlannerSource).not.toContain('Promise.allSettled(styleCandidates.map')
  })

  it('does not attach product reference images when generating style boards', () => {
    const styleGenerationBlock = amazonPlannerSource.slice(
      amazonPlannerSource.indexOf('const generateStyleImages = async () => {'),
      amazonPlannerSource.indexOf('const applyPlannerResult = (result: PlannerApiResult, sourceLabel: string) => {'),
    )

    expect(styleGenerationBlock).toContain('inputImageDataUrls: [],')
    expect(styleGenerationBlock).not.toContain('inputImageDataUrls: referenceImages')
  })

  it('uses the virtual Images profile for default OpenAI style board generation', () => {
    const styleGenerationBlock = amazonPlannerSource.slice(
      amazonPlannerSource.indexOf('const generateStyleImages = async () => {'),
      amazonPlannerSource.indexOf('const applyPlannerResult = (result: PlannerApiResult, sourceLabel: string) => {'),
    )

    expect(styleGenerationBlock).toContain('createOpenAIInputImageProfile(imageProfile)')
    expect(styleGenerationBlock).toContain('createImageRequestSettings(styleImageProfile)')
  })

  it('keeps style boards when switching Listing, A+ and DSP planner modes', () => {
    const changeModeStart = amazonPlannerSource.indexOf('const changePlannerMode = (mode: AmazonPlannerMode) => {')
    const changeAPlusTypeStart = amazonPlannerSource.indexOf('const changeAPlusType = (nextType: APlusContentType) => {')
    expect(changeModeStart).toBeGreaterThan(-1)
    expect(changeAPlusTypeStart).toBeGreaterThan(changeModeStart)

    const changeModeBlock = amazonPlannerSource.slice(changeModeStart, changeAPlusTypeStart)
    expect(changeModeBlock).not.toContain('setStyleCandidates([])')
    expect(changeModeBlock).not.toContain('setStyleImages([])')
    expect(changeModeBlock).not.toContain('setSelectedStyleIndex(null)')
    expect(changeModeBlock).not.toContain('setStylePreview(null)')
  })

  it('resets style boards only when replanning or switching A+ content type', () => {
    const runPlannerBlock = amazonPlannerSource.slice(
      amazonPlannerSource.indexOf('setStyleCandidates(result.styleCandidates)'),
      amazonPlannerSource.indexOf('void savePlannerSession({'),
    )
    const changeAPlusTypeBlock = amazonPlannerSource.slice(
      amazonPlannerSource.indexOf('const changeAPlusType = (nextType: APlusContentType) => {'),
      amazonPlannerSource.indexOf('const clearListingPlan = () => {'),
    )

    expect(runPlannerBlock).toContain('setStyleImages([])')
    expect(runPlannerBlock).toContain('setSelectedStyleIndex(null)')
    expect(changeAPlusTypeBlock).toContain('setStyleImages([])')
    expect(changeAPlusTypeBlock).toContain('setSelectedStyleIndex(null)')
  })

  it('skips already submitted slots when batch submitting planned images', () => {
    expect(amazonPlannerSource).toContain(".filter((job) => actionProgress[job.actionKey] !== 'submitted')")
    expect(amazonPlannerSource).toContain('showToast(`已提交 ${jobs.length} 张草稿任务`,')
  })

  it('submits Amazon Planner drafts at low quality without changing target sizes', () => {
    expect(amazonPlannerSource).toContain("generationStage: 'draft'")
    expect(amazonPlannerSource).toContain('quality: AMAZON_DRAFT_QUALITY')
    expect(amazonPlannerSource).toContain('targetSize: listingTargetSize')
    expect(amazonPlannerSource).toContain('targetSize: plan.generationSize')
    expect(amazonPlannerSource).not.toContain("quality: DEFAULT_PARAMS.quality,\n      output_format: DEFAULT_PARAMS.output_format")
  })

  it('labels the primary Planner action as draft generation', () => {
    expect(amazonPlannerSource).toContain('生成草稿')
    expect(amazonPlannerSource).toContain('草稿已提交')
    expect(amazonPlannerSource).toContain('最终清晰度')
    expect(amazonPlannerSource).not.toContain('提交生成')
  })

  it('uses local draft copy for Planner action guidance instead of production helper text', () => {
    const importBlock = amazonPlannerSource.slice(
      amazonPlannerSource.indexOf("from '../lib/listingPlannerApi'"),
      amazonPlannerSource.indexOf("from '../lib/plannerProductionGuide'"),
    )
    const guidanceBlock = amazonPlannerSource.slice(
      amazonPlannerSource.indexOf('function getDraftPlannerActionGuidance'),
      amazonPlannerSource.indexOf('function getDraftBatchSubmitStatusText'),
    )

    expect(importBlock).not.toContain('getPlannerActionGuidance')
    expect(amazonPlannerSource).toContain('const actionGuidance = getDraftPlannerActionGuidance({')
    expect(guidanceBlock).toContain('才能生成草稿')
    expect(guidanceBlock).toContain('下一步提交草稿')
    expect(guidanceBlock).toContain('可生成当前')
    expect(guidanceBlock).not.toContain('提交生成')
  })

  it('uses local draft copy for Planner batch submission status text', () => {
    const importBlock = amazonPlannerSource.slice(
      amazonPlannerSource.indexOf("from '../lib/listingPlannerApi'"),
      amazonPlannerSource.indexOf("from '../lib/plannerProductionGuide'"),
    )
    const batchStatusBlock = amazonPlannerSource.slice(
      amazonPlannerSource.indexOf('function getDraftBatchSubmitStatusText'),
      amazonPlannerSource.indexOf('function getPlannerModeLabel'),
    )

    expect(importBlock).not.toContain('getBatchSubmitStatusText')
    expect(amazonPlannerSource).toContain('const batchSubmitStatusText = getDraftBatchSubmitStatusText({')
    expect(batchStatusBlock).toContain('准备提交 ${unsubmittedCount} 张未提交草稿')
    expect(batchStatusBlock).toContain('已提交 ${options.batchSubmittedCount}/${unsubmittedCount} 张草稿')
    expect(batchStatusBlock).toContain('先选择风格板后可提交未提交草稿')
    expect(batchStatusBlock).not.toContain('未提交项')
  })

  it('uses 1K as the safe default and waits for each batch task to finish', () => {
    expect(amazonPlannerSource).toContain("useState<AmazonPlannerResolution>('1k')")
    expect(amazonPlannerSource).toContain("(['1k', '2k', '4k'] as const)")
    expect(amazonPlannerSource).toContain('const resolutionTier = getAmazonPlannerResolutionTier(resolution)')
    expect(amazonPlannerSource).toContain('const listingTargetSize = getListingTargetSizeForResolution(resolution)')
    expect(amazonPlannerSource).toContain('const submittedTask = await submitTaskAndGetTask({ apiProfileId: imageProfile.id, inputImages: structureInputImages })')
    expect(amazonPlannerSource).toContain('await waitForPlannerTaskCompletion(submittedTask.id)')
    expect(amazonPlannerSource).not.toContain('findPlannerBatchTask')
  })

  it('uses current-next-step copy for the submit console', () => {
    expect(amazonPlannerSource).toContain('当前下一步')
    expect(amazonPlannerSource).toContain("target: hasGeneratedStyleImages ? 'style-choice' : 'style'")
    expect(amazonPlannerSource).toContain('提交未提交草稿')
    expect(amazonPlannerSource).not.toContain("{isBatchSubmitting ? '一键生图中...' : '一键生图'}")
  })

  it('shows submitted, pending and missing-style states on every planned card', () => {
    expect(amazonPlannerSource).toContain('getPlanSubmitStatus')
    expect(amazonPlannerSource).toContain('缺风格')
    expect(amazonPlannerSource).toContain('待提交')
    expect(amazonPlannerSource).toContain('已提交')
  })

  it('uses explicit product workspace terminology instead of planner history', () => {
    expect(amazonPlannerSource).toContain('新建工作区')
    expect(amazonPlannerSource).toContain('工作区 ID')
    expect(amazonPlannerSource).toContain('打开工作区')
    expect(amazonPlannerSource).toContain('商品工作区')
    expect(amazonPlannerSource).not.toContain('策划历史')
  })

  it('uses product structure references instead of a mandatory six-view step', () => {
    expect(amazonPlannerSource).toContain('结构参考图')
    expect(amazonPlannerSource).toContain('后续生图直接发送这些参考图')
    expect(amazonPlannerSource).toContain('只能复用用户提供的视角或对称反转视角')
    expect(amazonPlannerSource).toContain('hasStructureReferences')
    expect(amazonPlannerSource).not.toContain('标准 6 视图确认前，后续生图会保持禁用')
  })

  it('makes structure reference removal explicit and confirms the result', () => {
    expect(amazonPlannerSource).toContain('点击缩略图右上角 × 可移除单张参考图')
    expect(amazonPlannerSource).toContain('showToast(`已移除参考图 ${index + 1}，后续生图不会再使用这张图`,')
    expect(amazonPlannerSource).toContain("showToast('已清空结构参考图，后续生图已禁用直到重新上传',")
    expect(amazonPlannerSource).not.toContain('sm:opacity-0 sm:group-hover:opacity-100')
  })

  it('surfaces six-view upload guidance, confirmation checks and quick repair prompts', () => {
    expect(amazonPlannerSource).toContain('一次性成功参考图')
    expect(amazonPlannerSource).toContain('建议上传 3-6 张同一产品多视角参考图')
    expect(amazonPlannerSource).toContain('优先包含正面、背面、左右侧、顶部/俯视、底部/结构细节')
    expect(amazonPlannerSource).toContain('logo/文字区域清晰无遮挡')
    expect(amazonPlannerSource).toContain('顶部或底部缺图时，确认前重点检查第 5/6 格')
    expect(amazonPlannerSource).toContain('确认前检查')
    expect(amazonPlannerSource).toContain('正视图 logo/品牌字样可见')
    expect(amazonPlannerSource).toContain('第 5 格（底部中间）是真正垂直俯视')
    expect(amazonPlannerSource).toContain('第 6 格（底部右侧）是真正底视')
    expect(amazonPlannerSource).toContain('只修正第 5 格（底部中间）的 top view')
    expect(amazonPlannerSource).toContain('只修正第 6 格（底部右侧）的 bottom view')
    expect(amazonPlannerSource).toContain('补回所有可见产品表面的真实品牌 logo/wordmark')
    expect(amazonPlannerSource).toContain('综合正面、背面、左右侧、俯视和底视来锁定机身比例')
    expect(amazonPlannerSource).toContain('盖子/门板/把手/铰链等可动结构保持一致')
    expect(amazonPlannerSource).toContain('锁定可动结构')
  })

  it('shows enlarged side, top and bottom crops for every six-view version before confirmation', () => {
    expect(amazonPlannerSource).toContain('高级辅助视角检查')
    expect(amazonPlannerSource).toContain('默认不用；后续生图只使用上方结构参考图')
    expect(amazonPlannerSource).toContain('isSixViewPanelExpanded &&')
    expect(amazonPlannerSource).toContain('展开辅助检查')
    expect(amazonPlannerSource).toContain('第 3 格左侧视放大')
    expect(amazonPlannerSource).toContain('第 4 格右侧视放大')
    expect(amazonPlannerSource).toContain('第 5 格俯视放大')
    expect(amazonPlannerSource).toContain('第 6 格底视放大')
    expect(amazonPlannerSource).toContain('objectPosition: SIX_VIEW_CELL_CROP_STYLES.leftSide')
    expect(amazonPlannerSource).toContain('objectPosition: SIX_VIEW_CELL_CROP_STYLES.rightSide')
    expect(amazonPlannerSource).toContain('objectPosition: SIX_VIEW_CELL_CROP_STYLES.top')
    expect(amazonPlannerSource).toContain('objectPosition: SIX_VIEW_CELL_CROP_STYLES.bottom')
    expect(amazonPlannerSource).not.toContain('mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3')
  })

  it('gates draft generation on uploaded structure references instead of confirmed six-view versions', () => {
    expect(amazonPlannerSource).toContain('const structureReferenceImageIds = currentWorkspaceReferenceImageIds.length ? currentWorkspaceReferenceImageIds : inputImageIds')
    expect(amazonPlannerSource).toContain('const hasStructureReferences = structureReferenceImageIds.length > 0')
    expect(amazonPlannerSource).toContain('structureReferenceAttached: hasStructureReferences')
    expect(amazonPlannerSource).toContain('const getStructureImagesForSubmit = async () => {')
    expect(amazonPlannerSource).toContain('submitTask({ apiProfileId: imageProfile.id, inputImages: structureInputImages })')
    expect(amazonPlannerSource).toContain('submitDisabled = actionDisabled || styleReferenceLimitExceeded || !hasStructureReferences')
    expect(amazonPlannerSource).toContain('batchSubmitDisabled = isBatchSubmitting || !hasPlanOptions || isPlanning || isGeneratingStyleImages || !hasStructureReferences')
    expect(amazonPlannerSource).toContain('请先上传产品结构参考图')
    expect(amazonPlannerSource).not.toContain('submitDisabled = actionDisabled || styleReferenceLimitExceeded || !confirmedSixViewVersion')
    expect(amazonPlannerSource).not.toContain('setInputImages([sixViewInput])')
  })

  it('counts submitted structure and style references', () => {
    expect(getSubmittedReferenceImageCount({
      sourceImageIds: ['ref-a', 'ref-b'],
      usesStyleReference: true,
      styleReferenceImageId: 'style-board',
    })).toBe(3)

    expect(getSubmittedReferenceImageCount({
      sourceImageIds: ['ref-a', 'style-board'],
      usesStyleReference: true,
      styleReferenceImageId: 'style-board',
    })).toBe(2)
  })

  it('clears optional six-view confirmation when structure references change without blocking draft generation', () => {
    expect(amazonPlannerSource).toContain("const hasConfirmedSixViewVersionIdOverride = Object.prototype.hasOwnProperty.call(overrides, 'confirmedSixViewVersionId')")
    expect(amazonPlannerSource).toContain('confirmedSixViewVersionId: hasConfirmedSixViewVersionIdOverride ? overrides.confirmedSixViewVersionId ?? null : existing?.confirmedSixViewVersionId ?? null')
    expect(amazonPlannerSource).toContain('const changedReferenceWorkspacePatch = (referenceImageIds: string[]): Partial<ProductWorkspace> => ({')
    expect(amazonPlannerSource).toContain('confirmedSixViewVersionId: null')
    expect(amazonPlannerSource).toContain('updateCurrentPlannerSession(changedReferenceWorkspacePatch(nextReferenceImageIds))')
    expect(amazonPlannerSource).toContain('updateCurrentPlannerSession(changedReferenceWorkspacePatch([]))')
    expect(amazonPlannerSource).toContain('updateCurrentPlannerSession(changedReferenceWorkspacePatch(useStore.getState().inputImages.map((image) => image.id)))')
    expect(amazonPlannerSource).toContain('不影响后续草稿生成')
    expect(amazonPlannerSource).not.toContain('请重新生成或重新确认标准 6 视图后再生图')
  })

  it('builds six-view generation inputs from the current workspace instead of global input images', () => {
    const generateSixViewBlock = amazonPlannerSource.slice(
      amazonPlannerSource.indexOf('const generateSixViewVersion = async () => {'),
      amazonPlannerSource.indexOf('const confirmSixViewVersion = (version: ProductWorkspaceSixViewVersion) => {'),
    )

    expect(generateSixViewBlock).toContain('getStandardSixViewSourceImageIds(currentWorkspace)')
    expect(generateSixViewBlock).toContain('ensureImageCached(imageId)')
    expect(generateSixViewBlock).not.toContain('sourceImages.push(...inputImages.filter')
    expect(generateSixViewBlock).not.toContain('sourceImages.map((image) => image.id)')
  })

  it('does not overwrite saved workspace references from unrelated global input images', () => {
    const snapshotBlock = amazonPlannerSource.slice(
      amazonPlannerSource.indexOf('const createPlannerSessionSnapshot = (overrides: Partial<ProductWorkspace> = {}): ProductWorkspace => {'),
      amazonPlannerSource.indexOf('const savePlannerSession = async (overrides: Partial<ProductWorkspace> = {}) => {'),
    )

    expect(snapshotBlock).toContain('referenceImageIds: overrides.referenceImageIds ?? existing?.referenceImageIds ?? inputImages.map((image) => image.id)')
  })

  it('creates a blank product workspace instead of inheriting closed workspace references', () => {
    const createWorkspaceBlock = amazonPlannerSource.slice(
      amazonPlannerSource.indexOf('const createProductWorkspace = async () => {'),
      amazonPlannerSource.indexOf('const selectPlan = (index: number) => {'),
    )

    expect(createWorkspaceBlock).toContain('createEmptyProductWorkspace')
    expect(createWorkspaceBlock).toContain('applyPlannerSessionState(workspace')
    expect(createWorkspaceBlock).not.toContain('useStore.getState().inputImages.map((image) => image.id)')
  })
})
