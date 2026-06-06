# 生产引导、进度预期与风格复用设计

## 背景

当前亚马逊图片工作台已经有新用户 coach mark、使用指南、Amazon 策划、风格板、策划历史、任务历史和任务卡片进度。用户仍然容易在四个地方失去预期：

- 不确定下一步该先策划、生成风格板、选择风格，还是直接提交。
- 不知道 AI 策划、风格板和正式生图通常要等多久。
- 风格板生成后只在当前策划上下文里明显，跨策划复用入口不够直接。
- 历史图库已有“复用配置 / 编辑输出 / 下载”等能力，但新用户不容易理解每个入口能复用什么。

本设计目标是把“怎么完成一套图、现在到哪一步、还要等多久、已有资产如何继续用”直接放进工作流，而不是再增加一个独立教程页。

## 当前代码上下文

已存在能力：

- `src/components/AmazonPlanner.tsx`
  - 维护 `plannerMode`、`styleCandidates`、`styleImages`、`selectedStyleIndex`、`actionProgress`。
  - 已有 `guideState` 和 sticky action bar，能提示当前下一步。
  - 已有 `getPlannerRunningMessage` 和 `planningElapsedSeconds`，策划时会显示已用时。
  - 策划历史会恢复 Listing / A+ / DSP 计划、风格候选和已选风格板。
- `src/store.ts`
  - `submitTask` 创建 running 任务后立即返回，真实生图在后台异步执行。
  - 任务完成后写入 `elapsed`、`outputImages`、`category.styleReferenceImageId`。
- `src/components/TaskCard.tsx`
  - running 状态显示计时和流式预览。
  - done 状态已有复用配置、编辑输出、收藏、下载等入口。
- `src/lib/onboardingGuide.ts` 和 `NewUserOnboardingModal`
  - 已经解释完整路径，但只在注册后一次性出现。

## 设计假设

- 目标用户是 Amazon 运营、新用户和低频使用者；他们更需要“下一步”和“产物位置”，不是完整参数教程。
- 本次优先覆盖 Amazon Planner 工作流；Agent 对话只沿用图库复用入口，不扩展成第二套引导系统。
- “预计多久”是经验区间，不是 SLA。不同模型、代理、网络和尺寸会影响真实耗时。
- 风格板和图库资产只在当前账号数据范围内复用，不做跨账号共享。
- 不新增后端资产表。必要的元数据放在现有 planner session 和 task category 的可选字段中。

## 范围

本次设计覆盖：

- Amazon 面板内的生产导航。
- AI 策划、风格板、正式生图、批量提交的进度预期。
- 已生成风格板的当前策划复用和历史策划复用。
- 历史图库图片的明确复用菜单。
- 对应的纯逻辑测试、组件静态测试和真实页面验收项。

本次不覆盖：

- 真实任务队列后端、并发调度器或服务端进度推送。
- 自动裁切、压缩、命名、ZIP 打包或素材包导出。
- 跨账号风格库、管理员模板库、团队共享资产库。
- 基于真实历史统计自动训练耗时模型。第一版只留好数据接口和展示位置。

## 方案选择

### 方案 A：只增强文案和 tooltip

在现有按钮旁补充说明，例如“先生成风格板”“预计几分钟”“历史里可复用配置”。

优点是改动最小。缺点是信息仍然分散，用户要自己把按钮、历史和任务卡片串起来，不能形成稳定的完成路径。

### 方案 B：生产导航 + 进度预期 + 风格/图库复用入口

在 Amazon 面板内新增一个轻量生产导航，把现有状态整理成 5 到 6 个阶段；运行中展示已用时、预计区间和下一判断；风格板区增加历史风格板复用；历史卡片增加清晰的复用菜单。

这是推荐方案。它复用当前组件和数据结构，能直接解决“怎么用、等多久、产物在哪、如何复用”，复杂度仍在单次实现计划内。

### 方案 C：完整资产中心

新增独立资产中心，集中管理风格板、产品参考图、输出图库、收藏、标签和项目。

优点是长期能力强。缺点是需要新导航、新数据模型、新筛选体系和更完整的信息架构。对当前问题来说范围过大，容易延缓最关键的引导改进。

## 推荐设计

采用方案 B。

## 一、生产导航

在 `AmazonPlanner` 顶部说明区下方新增 `PlannerProductionGuide`，替换零散的下一步提示为一条稳定流程：

1. 准备资料
2. AI 策划
3. 生成风格板
4. 选择风格
5. 提交图片 / 素材
6. 在历史里下载或复用

组件只展示当前阶段、下一步按钮和简短上下文，不展示长教程。它从现有状态派生：

- 没有可用策划 API：当前阶段为“配置策划 API”。
- 没有 `listingText`：当前阶段为“准备资料”。
- 没有计划：当前阶段为“AI 策划”。
- 有计划但需要风格且没有可用风格：当前阶段为“生成 / 选择风格板”。
- 已选计划：当前阶段为“提交当前图片或批量提交”。
- 有当前 session 相关 running / done 任务：当前阶段为“等待历史输出 / 复用”。

视觉上使用一行紧凑 stage rail。当前阶段高亮，已完成阶段显示小勾，未来阶段低对比。移动端改为当前阶段卡片加“第 X / 6 步”。

导航里的主操作按钮直接复用现有动作：

- “去填资料”滚动到输入区。
- “开始 AI 策划”触发现有策划按钮。
- “生成风格板”触发 `generateStyleImages`。
- “选择风格板”滚动到风格板网格。
- “提交当前项”触发 `handlePrimarySubmitAction`。
- “去历史查看”滚动到历史记录区。

## 二、进度预期

新增纯逻辑 helper `src/lib/plannerProductionGuide.ts`，统一输出进度文案和预计区间：

```ts
type ProductionEstimate = {
  label: string
  expectedRange: string
  elapsedLabel?: string
  statusTone: 'normal' | 'slow' | 'long'
  note: string
}
```

第一版使用静态区间：

- AI 策划
  - Listing / A+：通常 1-3 分钟。
  - DSP：通常 3-6 分钟，因为一次规划 11 个 DSP 素材。
- 风格板
  - 3 张 1024 风格板：通常 1-3 分钟，按实际成功数量显示 `1/3`、`2/3`、`3/3`。
- 正式生图
  - 2K 单张：通常 1-3 分钟。
  - 4K 单张：通常 2-5 分钟。
- 批量提交
  - 入队进度：显示“已提交 N / M 个任务”。
  - 生成进度：根据同一批任务的 running / done / error 数量显示“生成中 N、已完成 M、失败 K”。

展示规则：

- 对可计数的阶段使用真实计数，不伪造百分比。
- 对单个网络请求只显示已用时和预计区间，不显示假进度条。
- 超过预计上限后提示“仍在等待模型或上游服务，页面保持打开即可；如果网关超时会在任务卡片中显示错误原因”。
- 运行超过 90 秒和 180 秒的提示可以复用现有 `getPlannerRunningMessage` 逻辑，但文案统一到 helper。

后续可用本地历史校准区间：按 `apiModel`、`size`、`workflow`、`status` 统计最近成功任务的中位数和 P80，但不在第一版实现。

## 三、风格板复用库

风格板区改为两个层次：

- 当前策划风格板：保留现有 3 张候选。
- 历史风格板：折叠区，标题为“复用已生成风格板”。

历史风格板来源：

- `plannerSessions` 中的 `styleImages`。
- 只展示 `imageId` 仍可读取的记录。
- 默认优先同商品标题、同 planner mode 的风格板。
- 其次展示收藏或最近 12 张风格板。

每张历史风格板卡片显示：

- 缩略图。
- 风格 label。
- 来源：商品标题 / Listing、A+、DSP / 更新时间。
- 操作：`用作当前风格`、`预览`、`恢复整套策划`。

为支持跨策划直接复用，引入兼容字段：

```ts
interface AmazonPlannerSelectedStyleReference {
  imageId: string
  label: string
  description?: string
  source: 'current-candidate' | 'planner-history' | 'gallery'
  candidateIndex?: number
  plannerSessionId?: string
}
```

`AmazonPlanner` 内部提交时改用 `selectedStyleReference?.imageId` 作为隐藏风格参考图。现有 `selectedStyleIndex` 保留用于兼容旧 session。恢复旧 session 时，如果有 `selectedStyleIndex` 和对应 `styleImages`，自动生成一个 `selectedStyleReference`。

用户点击“用作当前风格”后：

- 不覆盖当前 3 张候选。
- 在风格区显示“已使用历史风格：xxx”。
- 正式生成时继续把该图片作为隐藏参考图附加到请求末尾。
- 如果参考图数量超过上限，复用现有上限提示。

## 四、图库复用菜单

历史任务卡片当前以图标按钮为主。新增一个显性的“复用”按钮或菜单，统一解释复用动作：

- 复用参数：调用现有 `reuseConfig(task)`，把 prompt、参数、参考图带回输入区。
- 输出图作参考：把 `task.outputImages` 加到当前输入参考图。
- 用作当前风格：如果 Amazon 面板可见，把第一张输出图设为 `selectedStyleReference`，source 为 `gallery`。
- 恢复所属策划：如果任务带有 `plannerSessionId`，恢复对应策划 session。
- 继续编辑输出：调用现有 `editOutputs(task)`。

任务详情弹窗也展示同一组动作，避免用户必须记住卡片图标含义。

为支持“恢复所属策划”和批量进度，`TaskRecord.category` 增加可选字段：

```ts
category?: {
  productTitle?: string
  workflow?: TaskWorkflow
  amazonSlot?: string
  aPlusType?: 'standard' | 'standard-large' | 'premium'
  styleReferenceImageId?: string
  plannerSessionId?: string
  plannerBatchId?: string
  styleReferenceLabel?: string
}
```

这些字段只作为前端关联元数据，不要求数据库迁移。旧任务没有字段时仍按现有分类逻辑工作。

## 五、数据流

### AI 策划

1. 用户填写资料。
2. `PlannerProductionGuide` 显示“预计 1-3 分钟”或 DSP “预计 3-6 分钟”。
3. 点击 AI 策划后沿用现有 `isPlanning`、`plannerRunStage`、`planningElapsedSeconds`。
4. 策划完成后保存 session，并进入“生成风格板”阶段。

### 风格板

1. 用户点击生成风格板。
2. 3 张候选显示真实 running / done / error 数量。
3. 用户选择当前候选或历史风格板。
4. `selectedStyleReference` 写入当前 session。

### 单张提交

1. 提交当前图片 / 素材时，把当前 session id 和 style reference 写入任务 category。
2. `submitTask` 创建 running 任务并返回。
3. 任务卡片显示运行计时、流式预览和预计区间。
4. 完成后任务卡片进入“下载 / 复用 / 编辑输出”状态。

### 批量提交

1. 点击提交未提交项。
2. 前端为本次点击生成 `plannerBatchId`，只写入这次批量提交产生的任务。
3. 每个 job 入队成功后更新“已提交 N / M”。
4. 生成完成进度从 tasks 里按 `plannerBatchId` 聚合。

## 六、组件与模块边界

新增：

- `src/lib/plannerProductionGuide.ts`
  - stage 推导。
  - ETA 文案。
  - batch task 聚合。
- `src/lib/styleReferenceLibrary.ts`
  - 从 planner sessions 和 tasks 中提取可复用风格。
  - 去重、排序、同商品优先。
- `src/components/PlannerProductionGuide.tsx`
  - 顶部流程导航。
- `src/components/StyleReferenceLibrary.tsx`
  - 历史风格板折叠区。
- `src/components/TaskReuseMenu.tsx`
  - 卡片和详情弹窗共用的复用动作菜单。

修改：

- `src/components/AmazonPlanner.tsx`
  - 接入生产导航。
  - 使用 `selectedStyleReference`。
  - 提交任务时写入 `plannerSessionId` 和 `plannerBatchId`。
- `src/components/TaskCard.tsx`
  - 增加显性复用菜单入口。
- `src/components/DetailModal.tsx`
  - 增加同一套复用菜单。
- `src/types.ts`
  - 增加兼容字段。

## 七、错误处理

遵循现有 fail-fast 风格，不新增复杂兜底：

- 历史风格板图片不存在：点击复用时 toast 提示“风格板图片不存在，请恢复策划后重新生成”。
- 输出图作参考超过输入图上限：复用现有 API 图片数量上限提示。
- 找不到 planner session：菜单项不显示。
- 任务没有输出图：输出图作参考、用作当前风格禁用。

## 八、测试

纯逻辑测试：

- `plannerProductionGuide.test.ts`
  - 空资料、未策划、需风格、已选计划、已有 running 任务分别推导正确阶段。
  - Listing / A+ / DSP 返回不同预计区间。
  - batch task 聚合 running / done / error 数量。
- `styleReferenceLibrary.test.ts`
  - 当前商品、同 mode 的风格板优先。
  - 不可读取 imageId 的风格板不进入列表。
  - 同 imageId 去重。

组件静态测试：

- `PlannerProductionGuide.test.tsx`
  - 渲染当前阶段、预计区间和下一步按钮。
- `StyleReferenceLibrary.test.tsx`
  - 渲染历史风格板和“用作当前风格”动作。
- `TaskReuseMenu.test.tsx`
  - done 任务显示复用参数、输出图作参考、编辑输出。
  - 没有输出图时禁用相关动作。

回归测试：

```bash
npm test -- src/lib/plannerProductionGuide.test.ts src/lib/styleReferenceLibrary.test.ts src/components/PlannerProductionGuide.test.tsx src/components/StyleReferenceLibrary.test.tsx src/components/TaskReuseMenu.test.tsx
npm test -- src/components/AmazonPlanner.test.tsx src/components/TaskCard.test.tsx src/components/DetailModal.test.tsx
npm run build
```

浏览器验收：

- 用 in-app browser 打开本地工作台。
- 在 Amazon 面板能看到生产导航。
- 未填资料时导航指向资料区。
- AI 策划运行中显示已用时和预计区间。
- 风格板生成时显示 `0/3` 到 `3/3`。
- 生成完成后历史风格板可被当前策划复用。
- 任务卡片和详情弹窗都有明确“复用”菜单。
- 点击“输出图作参考”后，底部输入参考图区出现该图。
- 点击“用作当前风格”后，Amazon 面板显示当前使用的历史风格。
- 桌面和移动宽度下无文字重叠、按钮截断或遮挡历史卡片。

## 自检

- 范围集中在引导、预期和复用，没有扩展成资产中心。
- 复用现有 session、task、history、style board 概念，避免引入新后端表。
- 预计耗时明确是区间提示，不假装精确进度。
- 风格板跨策划复用有独立 `selectedStyleReference`，不会破坏旧的 `selectedStyleIndex` session。
- 图库复用入口统一到菜单，降低只靠图标 tooltip 的学习成本。
