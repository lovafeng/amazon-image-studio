import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { AppMode } from '../types'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'

interface HelpModalProps {
  appMode: AppMode
  onClose: () => void
}

interface GuideSection {
  id: string
  title: string
  description: string
  steps: string[]
}

const gallerySections: GuideSection[] = [
  {
    id: 'quick-start',
    title: '快速开始',
    description: '从登录到出图的主流程。',
    steps: [
      '使用分配的账号登录，同一账号只看到自己的历史记录、图片和策划数据。',
      '在顶部 Amazon 面板选择 Listing 图或 A+ 图，再按需要切换 2K / 4K。',
      '粘贴标题、五点描述或产品说明，必要时上传产品实拍图、包装图或结构参考图。',
      '点击 AI策划，检查生成的中文策划、英文 Prompt 和 Negative Prompt。',
      '选择需要生成的图片位，确认右侧 Prompt Preview 后直接生成图片。',
    ],
  },
  {
    id: 'api',
    title: '账号与 AI 配置',
    description: '生产环境已使用服务端统一配置。',
    steps: [
      '普通用户不需要填写 API Key，页面会通过服务端代理调用 AI 接口。',
      '文案策划固定使用 gpt-5.5 / xhigh。',
      '风格板和正式生图会自动使用生图配置 gpt-image-2。',
      '如果提示未登录，先退出后重新登录；如果提示代理未配置，需要检查服务器 .env。',
    ],
  },
  {
    id: 'listing',
    title: 'Listing 图策划',
    description: '适用于 MAIN 和 PT01-PT06。',
    steps: [
      '主图 MAIN 默认按白底合规方向策划，避免价格、徽章、评论、Amazon 标识等风险元素。',
      '附图 PT01-PT06 会围绕卖点、结构、尺寸、场景和包装进行分镜。',
      '商品信息不完整时，可在左侧手动补充类目、颜色、材质、目标人群、卖点和禁用元素。',
      '生成前先看 Prompt Preview，确认当前图片位和提示词匹配。',
    ],
  },
  {
    id: 'aplus',
    title: 'A+ 图片策划',
    description: '适用于大图版、Standard 和 Premium 模块。',
    steps: [
      '切到 A+ 图后选择需要的模块编排。',
      'A+ 会按模块尺寸生成更适合上传 Seller Central 的横幅、单图或小图模块。',
      '小方块模块建议把标题/正文放在页面文案区，不要强行画进小尺寸图片。',
      '生成前逐个切换模块位，确认每张图的构图、尺寸和文案承担的角色。',
    ],
  },
  {
    id: 'history',
    title: '历史与批量管理',
    description: '历史记录会按账号隔离。',
    steps: [
      '可以按商品、状态、来源、形状和关键词筛选历史记录。',
      '点历史卡片可查看详情、复用配置、编辑输出、下载或删除。',
      '桌面端可拖拽框选，或按 Ctrl / Command 点击多选；移动端可左右滑动选择。',
      '多选后底部会出现批量收藏、下载、删除等操作。',
    ],
  },
]

const agentSections: GuideSection[] = [
  {
    id: 'agent-start',
    title: 'Agent 对话',
    description: '适合连续策划、修改和批量出图。',
    steps: [
      'Agent 使用 Responses API 配置，生产环境同样通过服务端 Key 代理。',
      '输入需求后，Agent 会结合上下文生成方案，并可调用生图工具。',
      '生成的图片会同步进入画廊历史，不会只留在对话里。',
    ],
  },
  {
    id: 'agent-images',
    title: '引用图片',
    description: '用 @ 引用参考图或前面轮次的图片。',
    steps: [
      '在输入框输入 @ 可选择当前参考图或历史生成图。',
      '需要让 Agent 基于某张图继续改图时，先引用图片，再描述要改的点。',
      '删除 Agent 对话默认不会删除画廊里的图片记录。',
    ],
  },
  {
    id: 'agent-branches',
    title: '分支与重试',
    description: '用于保留不同修改路线。',
    steps: [
      '编辑某轮消息并重新发送，会产生新的对话分支。',
      '重新生成某轮回复也会形成可切换版本。',
      '需要回到画廊集中管理图片时，使用历史区筛选 Agent 来源。',
    ],
  },
]

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

function GuideBlock({ title, description, steps }: GuideSection) {
  return (
    <section className="border-t border-gray-200 pt-5 first:border-t-0 first:pt-0 dark:border-white/[0.08]">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h4>
        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</p>
      </div>
      <ol className="space-y-2 text-sm leading-6 text-gray-700 dark:text-gray-300">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
              {index + 1}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function ShortcutItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-300">
        {label}
      </span>
      <span className="text-sm leading-6 text-gray-700 dark:text-gray-300">{children}</span>
    </div>
  )
}

export default function HelpModal({ appMode, onClose }: HelpModalProps) {
  const isMobile = useIsMobile()
  const modalRef = useRef<HTMLDivElement>(null)
  const sections = appMode === 'agent' ? agentSections : gallerySections
  useCloseOnEscape(true, onClose)
  usePreventBackgroundScroll(true, modalRef)

  return createPortal(
    <div
      data-no-drag-select
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/35 backdrop-blur-sm animate-overlay-in" />
      <div
        ref={modalRef}
        className="relative z-10 flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-white/60 bg-white shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-950 dark:ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-5 py-4 dark:border-white/[0.08] sm:px-6">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">使用指南</h3>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {appMode === 'agent' ? 'Agent 对话、图片引用和分支管理。' : 'Amazon Listing、A+ 策划、生图和历史管理。'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭使用指南"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[13rem_1fr]">
          <aside className="hidden border-r border-gray-200 bg-gray-50/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.03] lg:block">
            <nav className="space-y-1">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#help-${section.id}`}
                  className="block rounded-md px-3 py-2 text-sm text-gray-600 transition hover:bg-white hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06] dark:hover:text-gray-100"
                >
                  {section.title}
                </a>
              ))}
            </nav>
          </aside>

          <div className="min-h-0 overflow-y-auto overscroll-contain custom-scrollbar">
            <div className="space-y-6 px-5 py-5 sm:px-6">
              {sections.map((section) => (
                <div key={section.id} id={`help-${section.id}`} className="scroll-mt-4">
                  <GuideBlock {...section} />
                </div>
              ))}

              <section className="border-t border-gray-200 pt-5 dark:border-white/[0.08]">
                <div className="mb-3">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {isMobile ? '移动端操作' : '快捷操作'}
                  </h4>
                  <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                    常用操作入口保持在页面顶部、历史卡片和底部输入栏。
                  </p>
                </div>
                <div className="space-y-3">
                  {isMobile ? (
                    <>
                      <ShortcutItem label="滑动">在历史卡片上左右滑动，选择或取消选择记录。</ShortcutItem>
                      <ShortcutItem label="底栏">选中记录后，底部操作栏可批量收藏、下载或删除。</ShortcutItem>
                      <ShortcutItem label="@">在输入框输入 @，引用当前可用的参考图。</ShortcutItem>
                    </>
                  ) : (
                    <>
                      <ShortcutItem label="拖拽">在历史区域空白处拖拽框选多条记录。</ShortcutItem>
                      <ShortcutItem label="Ctrl / ⌘">按住后点击卡片，可添加或移除单条选择。</ShortcutItem>
                      <ShortcutItem label="@">在输入框输入 @，引用参考图或历史生成图。</ShortcutItem>
                    </>
                  )}
                </div>
              </section>

              <section className="border-t border-gray-200 pt-5 dark:border-white/[0.08]">
                <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">常见问题</h4>
                <div className="space-y-3 text-sm leading-6 text-gray-700 dark:text-gray-300">
                  <p><strong className="font-medium text-gray-900 dark:text-gray-100">看不到历史？</strong> 先确认登录的是同一个账号；历史记录按账号隔离。</p>
                  <p><strong className="font-medium text-gray-900 dark:text-gray-100">提示缺少 API Key？</strong> 生产环境应由服务端代理提供 Key，需要检查服务器 .env 和代理状态。</p>
                  <p><strong className="font-medium text-gray-900 dark:text-gray-100">切账号后历史不对？</strong> 刷新页面或重新打开浏览器；新版 Service Worker 已避免缓存 API 数据。</p>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
