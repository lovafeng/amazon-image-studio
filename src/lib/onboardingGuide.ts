export interface OnboardingGuideStep {
  target: string
  title: string
  description: string
  tip: string
  checklist?: string[]
}

export const plannerOnboardingSteps: OnboardingGuideStep[] = [
  {
    target: '[data-onboarding-target="planner-panel"]',
    title: '先选出图入口',
    description: '这里先选择 Listing 图、A+ 图或 DSP 图。完整路径是：选入口、补资料、AI策划、生成风格板、提交素材、在历史记录里预览、下载、复用或编辑输出。',
    tip: '先确定本次要交付的图片类型，后面的规格、Prompt 和生成尺寸会跟着入口变化。',
    checklist: [
      '选择 Listing 图、A+ 图或 DSP 图',
      '确认完整路径会走到最终输出',
    ],
  },
  {
    target: '[data-onboarding-target="listing-input"]',
    title: '准备商品资料',
    description: '把标题、五点描述、品牌说明、卖点或 Amazon 页面内容放到这里；有参考图时一起上传，策划会更贴近商品。',
    tip: '资料越完整，AI 越容易给出可直接提交的图片位、素材位和英文 Prompt。',
    checklist: [
      '粘贴商品信息或导入 Amazon 页面',
      '上传可参考的商品图或风格图',
    ],
  },
  {
    target: '[data-onboarding-target="planner-action"]',
    title: '让 AI 生成方案',
    description: '点击 AI策划，系统会按当前入口生成中文策划、英文 Prompt、图片位或 DSP 素材位。',
    tip: 'DSP 会走自己的规格和尺寸；Listing 图、A+ 图也会保留各自的图片位规则。',
    checklist: [
      '点击 AI策划',
      '等待方案、Prompt 和图片位生成',
    ],
  },
  {
    target: '[data-onboarding-target="planner-panel"]',
    title: '生成风格板并提交',
    description: '方案出来后，先生成 3 张风格板并选择最合适的一张，再选择图片位或素材，点击提交生成。',
    tip: 'DSP 自定义素材要按尺寸提交；Listing 图和 A+ 图按图片位提交。',
    checklist: [
      'AI策划完成后生成并选择风格板',
      '选择图片位或素材，点击提交生成',
    ],
  },
  {
    target: '[data-onboarding-target="history-panel"]',
    title: '拿到最终输出',
    description: '提交后回到历史记录看任务状态。完成后可以预览、下载、复用参数，或继续编辑输出。',
    tip: '这里按账号隔离，只显示当前账号的生成记录。',
    checklist: [
      '等待任务完成',
      '在历史记录里预览、下载、复用或编辑输出',
    ],
  },
]

export const commonOnboardingSteps: OnboardingGuideStep[] = [
  {
    target: '[data-onboarding-target="input-dock"]',
    title: '直接描述要生成的图',
    description: '如果暂时不走 Amazon 策划，可以在底部输入栏直接写清楚要生成的画面、主体、风格和用途，随后上传参考图、调参数并点击生成图像。',
    tip: '这条路径也要以最终图片为目标，不只是试 Prompt。',
    checklist: [
      '输入清晰的画面需求',
      '点击生成图像后去历史记录拿输出',
      '补充品牌、商品或使用场景',
    ],
  },
  {
    target: '[data-onboarding-target="input-dock"]',
    title: '上传参考图并调参数',
    description: '需要贴近商品或已有风格时，先上传参考图，再调整尺寸、质量和数量。',
    tip: '参考图越明确，直接生图越容易稳定到可用结果。',
    checklist: [
      '上传参考图',
      '选择尺寸、质量和数量',
    ],
  },
  {
    target: '[data-onboarding-target="input-dock"]',
    title: '点击生成图像',
    description: '确认描述和参数后点击生成，任务会进入生成队列。',
    tip: '生成过程中可以继续整理下一轮 Prompt 或等待历史记录刷新。',
    checklist: [
      '点击生成图像',
      '等待任务进入历史记录',
    ],
  },
  {
    target: '[data-onboarding-target="history-panel"]',
    title: '查看最终输出',
    description: '生成完成后，在历史记录里预览、下载、复用参数，或继续编辑输出。',
    tip: '完成这一步后，你就跑通了一次从描述到最终图片的闭环。',
    checklist: [
      '打开完成任务',
      '下载、复用或编辑输出',
    ],
  },
]

export const newUserOnboardingSteps: OnboardingGuideStep[] = [
  ...plannerOnboardingSteps,
  {
    target: '[data-onboarding-target="input-dock"]',
    title: '临时生图入口',
    description: '底部输入栏适合临时补图、上传参考图、调整尺寸质量，和 Amazon 策划流程互补使用。',
    tip: '以后不需要完整策划时，可以从这里直接开始一轮小任务。',
    checklist: [
      '直接输入临时需求',
      '生成后仍回历史记录拿输出',
    ],
  },
]
