# Amazon DOM 导入设计

## 背景

当前 Amazon 图片策划流程依赖用户手动粘贴标题、五点描述或产品说明。用户希望在前端直接贴 Amazon 商品 URL，或上传该 URL 保存下来的 DOM / HTML 文件，让工作台实时提取商品信息并进入现有 AI 策划流程。

给定 Amazon 页面存在跨域和反爬限制，URL 导入只做 best-effort。稳定路径是用户上传本地 DOM / HTML 文件，解析过程在浏览器本地完成，不上传 DOM 文件。

## 范围

本次实现两个导入入口：

- URL 导入：用户粘贴 Amazon 商品 URL 后点击导入。
- DOM 文件导入：用户上传 `.html`、`.htm` 或 `.txt` 文件。

导入后回填现有字段：

- `listingText`
- 商品标题
- 品牌或型号
- 类目
- 颜色
- 材质
- 包装清单
- 卖点

第一版不自动下载商品主图或详情图。Amazon 图片 URL 通常也会遇到跨域、签名和尺寸变体问题，自动参考图导入留到后续单独处理。

## 用户体验

在 `Listing 智能策划` / `A+ 图片策划` 输入区域增加一个紧凑的 `亚马逊导入` 区块。

交互：

1. 用户粘贴 URL，点击 `导入 URL`。
2. 系统尝试读取 URL HTML。
3. 成功时解析并回填输入框和商品字段。
4. 失败时显示明确提示：URL 读取可能被跨域或反爬拦截，请在浏览器中保存网页 HTML 后上传 DOM 文件。
5. 用户上传 DOM 文件时，系统直接解析文件内容并回填。

状态文案：

- 导入中：`正在读取亚马逊页面...`
- 成功：`已导入亚马逊商品信息`
- URL 失败：`URL 导入失败，可能被跨域或反爬拦截；请上传该页面保存下来的 DOM 文件。`
- DOM 解析结果不足：`DOM 中未识别到商品标题或五点描述，请确认文件来自 Amazon 商品详情页。`

## 架构

新增一个纯前端解析模块：

- `src/lib/amazonDomImport.ts`

模块职责：

- 判断 URL 是否像 Amazon 商品页。
- 从 URL 中提取 ASIN 用于展示或记录。
- 保留用户粘贴的原始 URL 作为实际采集 URL。
- 用 `DOMParser` 解析 HTML 字符串。
- 从 Amazon DOM 中提取商品信息。
- 格式化为现有 `listingText`。
- 产出可合并进 `AmazonPromptDraft` 的字段。

组件层改动：

- 在 `src/components/AmazonPlanner.tsx` 中增加 URL 输入框、DOM 文件上传按钮和导入状态。
- 成功导入后调用现有 `setListingText` 和 `setDraft`。
- 失败时复用现有 toast 风格展示错误。

## 数据模型

新增导入结果类型：

```ts
export interface AmazonDomImportResult {
  asin?: string
  title: string
  bullets: string[]
  details: Record<string, string>
  draft: Partial<AmazonPromptDraft>
  listingText: string
}
```

`details` 保留从详情表、技术规格表、byline 等位置提取的原始键值，便于后续扩展字段映射。

## DOM 解析策略

优先使用 Amazon 常见稳定选择器：

- 标题：`#productTitle`
- 五点：`#feature-bullets li span`
- 品牌：`#bylineInfo`
- 详情表：`#productDetails_detailBullets_sections1`、`#productDetails_techSpec_section_1`
- 详情列表：`#detailBullets_feature_div li`
- 变体选择：`#variation_color_name .selection`

字段映射：

- `Brand` / `品牌` / `bylineInfo` -> `brand`
- `Color` / `Colour` -> `color`
- `Material` / `Material Type` -> `material`
- `Included Components` / `Package Includes` -> `packageIncludes`
- `Best Sellers Rank` 或面包屑中的主类目 -> `category`

卖点清洗：

- 去掉空行。
- 去掉 `Make sure this fits` 等 Amazon UI 提示。
- 最多保留前 5 条。
- 保留英文原文，交给现有 AI 策划模型做后续理解。

## URL 读取策略

前端先对 URL 做基本判断，只接受 `amazon.` 域名或包含 `/dp/ASIN`、`/gp/product/ASIN` 的 URL。校验和 ASIN 提取不能改变实际采集 URL。

URL 读取使用普通 `fetch`，请求目标必须是用户粘贴的完整原始 URL，包括 query 参数、ref 参数、session 参数、variant 参数和 `th=1` 等参数。不要把 URL 规范化成 `/dp/ASIN`，不要移除参数，也不要重排参数。如果浏览器因 CORS、403、网络失败或返回非 HTML 内容导致读取失败，直接提示上传 DOM 文件，不加入重试、第三方抓取服务或隐藏 fallback。

这个设计符合当前静态前端架构，不要求新增后端。未来如果项目加入本地 Node 服务，可以把 URL 读取移到服务端再增强成功率。

## 错误处理

保持 fail-fast：

- URL 为空时不发请求，直接提示需要粘贴 URL。
- 文件为空或读取不到文本时直接提示。
- DOM 同时缺少标题和五点时视为解析失败。
- URL fetch 失败不做重试，提示用户上传 DOM 文件。

不加入自动猜测非 Amazon 页面、不加入第三方代理、不加入复杂容错映射。

## 测试

先写失败测试，再实现：

- 从 `/dp/B0G1MSW4RW` URL 提取 ASIN。
- URL 导入请求使用用户输入的完整 URL，保留所有 query 参数。
- 从典型 Amazon HTML 中提取标题和五点。
- 从详情表中提取品牌、颜色、材质、包装清单。
- 生成现有 AI 策划可用的 `listingText`。
- 缺少标题和五点时返回空解析或失败状态。

完成后运行：

```bash
npm test
npm run build
```

并使用 in-app browser 打开本地页面验收：

- 粘贴 Amazon URL 后，失败时能看到上传 DOM 的提示。
- 上传保存下来的 DOM 文件后，输入框和商品字段正确回填。
- 回填后点击现有 `AI策划` 仍走原流程。

## 非目标

本次不实现：

- 自动下载商品图片并添加为参考图。
- 服务端抓取 Amazon 页面。
- 绕过 Amazon 反爬。
- 第三方抓取 API 集成。
- 解析评论、价格、优惠、评分、销量排名等不应进入图片策划 Prompt 的信息。
