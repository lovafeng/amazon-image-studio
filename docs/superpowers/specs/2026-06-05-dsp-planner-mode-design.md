# DSP Planner Mode 设计

## 背景

当前亚马逊图片工作台支持 `Listing 图` 和 `A+ 图` 两类同级策划入口。用户需要新增 DSP 广告素材分类，覆盖 REC 自动素材、Custom Image 多尺寸横幅，以及优先使用的半自动 REC 素材。

DSP 素材和 Listing / A+ 的交付物不同：它有明确广告位尺寸、文件大小上限、CTA 规则、Logo / Slogan 规则，以及不能模仿 Amazon 页面内容的合规要求。因此本次把 DSP 做成第三个同级 planner mode，而不是复用 A+ 模块类型。

## 范围

本次实现：

- 在 Amazon 工作台顶部新增 `DSP 图`，与 `Listing 图 / A+ 图` 同级。
- 新增 DSP 规格模型和固定素材清单。
- 新增 DSP AI 策划 schema，返回 DSP 素材方案、英文生图 prompt 和 negative prompt。
- DSP 方案可被选择、预览、填入、单张提交和批量提交。
- DSP 任务写入历史分类，历史筛选中显示为 `DSP 图`。
- DSP 生成尺寸按素材上传比例映射到现有 2K / 4K 兼容尺寸，UI 同时展示原始上传规格和文件大小上限。
- Prompt 中写入用户提供的 DSP 合规规则，区分可用 CTA 和禁止 CTA 的素材类型。

本次不实现：

- 真实输出文件的 KB / MB 压缩校验。
- Logo 文件上传后的尺寸和大小校验。
- Slogan 字符数表单校验。
- 单独的 DSP 素材包导出、ZIP 打包或按平台自动命名。
- 自动生成真实品牌 Logo。没有真实 Logo 参考图时，只允许使用品牌名文字或留出 Logo 区域。

## DSP 素材规格

新增 `AmazonDspAssetSpec`：

- `group`：`rec`、`custom-image`、`semi-auto-rec`。
- `slot`：稳定任务位，如 `DSP-CUSTOM-300x250`。
- `label`：中文 UI 名称。
- `assetType`：`logo`、`slogan`、`image`。
- `uploadWidth` / `uploadHeight`：有固定图片尺寸时填写。
- `fileLimit`：展示文件大小上限，如 `50KB`、`200KB`、`5MB`。
- `ctaPolicy`：`required`、`optional`、`forbidden`、`not-applicable`。
- `objective`：该素材位承担的作用。
- `rules`：该素材的关键规则说明。

固定规格：

- REC 自动素材
  - Logo：`600 x 100 or larger`，`1000KB` 以内，`JPG / PNG`。
  - Slogan：最多 50 个字符。
- Custom Image
  - `300x250`，`50KB`。
  - `728x90`，`50KB`。
  - `160x600`，`50KB`。
  - `300x600`，`50KB`。
  - `970x250`，`200KB`。
  - `980x55`，`50KB`。
  - `320x50`，`50KB`。
  - `600x500`，`200KB`。
  - `1242x375`，`200KB`。
  - `640x100`，`200KB`。
- 半自动 REC
  - `600x600`，`5MB` 以内，优先入口。

## DSP 合规规则

Custom Image prompt 需要包含：

- 广告素材必须有清晰 CTA，例如 `Shop now`、`Add to Cart`、`Learn more`。
- 不能使用非特定 CTA，例如 `Click Here`。
- `Shop now` 只能为纯文字，不可做成按钮。
- `970x250` 的 CTA 使用纯文本或下划线样式，不使用按钮。
- 可添加 CTA，除 `970x250` 外 CTA 样式不做额外限制。
- 必须添加品牌 Logo 或清晰 Logo 区域；Logo 和产品图片要清晰。
- 字体限制两种以内。
- 图片内文字控制在 10 个英文单词以内。
- 避免过强语气词和夸张标点。
- 必须有清晰 1px 边框或高对比度背景，不能是纯白底边框，建议黑色边框。
- 不得模仿 Amazon 网站内容，底色不要使用纯白色。

半自动 REC prompt 需要包含：

- 禁止添加 CTA。
- Logo 和图片清晰。
- 字体限制两种以内。
- 图片内文字控制在 10 个英文单词以内。
- 避免过强语气词和标点。
- 必须有清晰 1px 边框或高对比度背景，不能是纯白底边框，建议黑色边框。

REC Logo / Slogan 不作为普通图片生成位批量提交。它们在 DSP 规格区展示，并写入 AI 策划上下文：如果用户提供 Logo 参考图或品牌名，DSP 图片方案应使用真实 Logo 或品牌名文字；Slogan 保持 50 字符以内。

## 架构

`src/lib/listingPlanner.ts`：

- `AmazonPlannerMode` 扩展为 `listing | aplus | dsp`。
- 新增 DSP spec、plan 类型和 helper：
  - `AmazonDspAssetSpec`
  - `AmazonDspPlan`
  - `DSP_ASSET_SPECS`
  - `getDspImageAssetSpecs`
  - `getDspAssetDisplayName`
  - `getDspAssetUploadSize`
  - `getDspAssetGenerationSize`
  - `withDspGenerationSizes`
  - `buildAmazonDspPlanPrompt`

`src/lib/listingPlannerApi.ts`：

- `PlannerApiPayload` 增加 `dspPlans`。
- 新增 DSP JSON schema。
- 新增 DSP instructions 和 user input text。
- `callAmazonPlannerApi` 根据 mode 选择 DSP schema，并 normalize 为 `PlannerApiResult`。

`src/components/AmazonPlanner.tsx`：

- 顶部模式切换增加 `DSP 图`。
- 新增 `dspPlans`、`selectedDspPlanIndex` 状态。
- DSP 模式复用参考图、AI 策划配置、风格板和批量提交机制。
- 计划列表中 DSP 展示上传尺寸、生成尺寸、文件上限、CTA 策略。
- Prompt Preview 对 DSP 显示 DSP 方案和对应英文 prompt。
- `applyPrompt`、`submitAllPlannedImages`、`buildBatchGenerateJobs` 支持 DSP 分类。

`src/types.ts` 与 `src/lib/taskHistory.ts`：

- `TaskWorkflow` 增加 `amazon-dsp`。
- `getWorkflowLabel` 显示 `DSP 图`。
- 旧任务不受影响；没有显式 category 的任务仍按原推断逻辑分类。

`src/types.ts` 的 planner session 类型：

- `AmazonPlannerSession` 扩展 DSP 计划和选中索引字段，允许恢复 DSP 策划历史。

## 数据流

1. 用户切换到 `DSP 图`。
2. 用户粘贴标题、五点描述、品牌说明或活动信息，并上传产品 / Logo 参考图。
3. 点击 `AI策划DSP`。
4. 前端向策划模型发送 DSP instructions、商品文本、参考图和固定 DSP specs。
5. 模型返回 `dspPlans` 和 3 个风格候选。
6. 用户生成并选择风格板。
7. 用户选择单个 DSP 图片位，或批量提交所有 DSP 图片位。
8. 提交任务时写入：

```ts
{
  productTitle: draft.productTitle.trim(),
  workflow: 'amazon-dsp',
  amazonSlot: plan.slot,
  styleReferenceImageId: selectedStyleImage.imageId
}
```

## 生成尺寸策略

DSP 上传规格通常不是模型原生尺寸。沿用 A+ 的比例映射策略：

- 根据上传宽高计算比例。
- 比例超过 `3:1` 时使用 `3:1`。
- 比例低于 `1:3` 时使用 `1:3`。
- 其它比例使用真实宽高比。
- 用 `calculateImageSize(tier, ratio)` 选择 2K / 4K 生成尺寸。

UI 必须同时显示：

- 上传规格，例如 `上传 300x250 · 50KB`。
- 生成规格，例如 `生成 2048x1706`。

## 测试

先覆盖纯逻辑，再覆盖 UI 静态行为：

- `listingPlanner`：
  - DSP 固定规格数量和关键尺寸。
  - `970x250` CTA 规则。
  - `600x600` 半自动 REC 禁止 CTA。
  - DSP 生成尺寸按比例映射。
- `listingPlannerApi`：
  - DSP schema 要求固定数量的 `dspPlans`。
  - DSP normalize 按 slot 匹配并补齐 upload / generation size。
  - 缺少 prompt 或 planMarkdown 时 fail-fast。
- `taskHistory`：
  - `amazon-dsp` 显示 `DSP 图`。
  - 显式 DSP category 可被历史筛选命中。
- `AmazonPlanner` 静态渲染：
  - 顶部包含 `DSP 图`。
  - DSP 模式下能看到 DSP 空状态规格列表。

完成后运行：

```bash
npm test -- src/lib/listingPlanner.test.ts src/lib/listingPlannerApi.test.ts src/lib/taskHistory.test.ts src/components/AmazonPlanner.test.tsx
npm run build
```

## 浏览器验收

实现后启动生产预览或本地生产构建，并用 in-app browser 做真实页面验证：

- 打开工作台，顶部出现 `Listing 图 / A+ 图 / DSP 图`。
- 切换 `DSP 图` 后，页面标题、输入提示、AI 策划按钮和空状态都变为 DSP 语义。
- 未策划时能看到 DSP 固定规格列表，包含 `300x250`、`970x250`、`600x600`。
- 选择或生成 DSP 方案后，Prompt Preview 展示上传尺寸、生成尺寸、文件上限和 DSP 合规 prompt。
- 页面在桌面和移动宽度下无明显重叠或截断。

## 自检

- 本设计把 DSP 放在同级 planner mode，符合用户确认的方向。
- DSP 不复用 A+ 类型字段，避免污染 A+ 语义。
- REC Logo / Slogan 不假装成普通图片生成任务，减少错误交付。
- 文件大小限制只展示和写入 prompt，不做真实压缩校验，范围清晰。
- 历史分类和任务 category 有稳定 workflow，后续筛选和复用可扩展。
- 没有要求新增后端 API 或数据库迁移；IndexedDB session 字段按当前前端 schema 扩展。
