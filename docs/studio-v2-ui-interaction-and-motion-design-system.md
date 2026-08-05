# Infinite-Canvas Studio V2 UI、交互与动效设计系统

> 文档状态：详细设计基线  
> 版本：v1.0  
> 日期：2026-08-05  
> 适用仓库：`twj515895394/Infinite-Canvas`  
> 参考方向：`emilkowalski/skills` 中的 `apple-design`、`emil-design-eng` 与动画设计方法  
> 前置文档：  
> - `docs/studio-v2-frontend-architecture-overall-design.md`  
> - `docs/studio-v2-information-architecture-and-core-workflows.md`

---

## 1. 文档目的

本文档确定 Studio V2 的视觉语言、布局密度、Design Token、组件状态、交互动效、性能边界和验收规则。

目标不是复制 macOS、iOS 或某一个 Apple 产品，而是吸收其更底层的设计方法：

- 操作必须即时响应。
- 内容与指针保持连续关系。
- 动效可中断、可反向、可被用户重新接管。
- 弹层和页面变化保持空间来源。
- 视觉层级克制，内容始终是主角。
- 细节一致性比装饰性更重要。
- 高频操作越常用，动效越短、越少。
- 简洁不是隐藏信息，而是让常用路径清楚、次要信息有序退后。

---

## 2. 设计定位

Studio V2 的设计气质定义为：

```text
Calm      安静
Precise   精确
Responsive 响应迅速
Focused   内容优先
Professional 专业
Warm      有适度的人性和反馈
```

### 2.1 希望用户感受到

- 界面干净，但不是空。
- 功能复杂，但不混乱。
- 操作顺滑，但不拖沓。
- 任务很多，但状态清楚。
- AI 能力强，但用户始终掌控。
- 长时间使用不会因高饱和、高对比和持续动画疲劳。

### 2.2 明确避免

- 大面积渐变背景。
- 每张卡片都使用玻璃拟态。
- 过量阴影、发光和边框。
- 大量彩色图标。
- 所有元素都有 Hover 位移。
- 所有弹层都弹跳。
- 生成中使用持续闪烁、脉冲和跑马灯。
- 为了“高级感”降低文字对比度。
- 为了“极简”把常用操作隐藏到三层菜单。
- 将 Apple 的外形语言机械复制到 Web 工具中。

---

## 3. 前端 UI 技术选型修订

本详细设计对总体设计中的 UI primitives 选型作如下更新。

## 3.1 最终选型

```text
Tailwind CSS
shadcn/ui（Base UI 版本）
Base UI primitives
Motion for React
Lucide Icons
CSS Transitions / @starting-style
```

### 3.1.1 为什么选择 Base UI

Studio V2 是全新项目，不存在迁移成本。Base UI 更适合本项目需要的：

- 明确的 starting / ending 状态。
- 可取消的 CSS Transition。
- Popover、Tooltip、Menu 的来源 Transform Origin。
- 方向感知的弹层和导航状态。
- Headless 组件与自定义视觉。
- 与 shadcn/ui 的直接组合。

因此不再把 Radix UI 作为新前端的默认 primitives；若个别组件 Base UI 暂时无法满足，可局部评估其他 headless primitive，但不得在同一类组件中混用多套行为模型。

### 3.1.2 shadcn/ui 的角色

shadcn/ui 只作为：

- 组件源码起点。
- 可访问性基础。
- Base UI 封装模板。
- Tailwind 结构参考。

禁止直接使用默认主题后就认定设计完成。所有核心组件必须进入 Infinite-Canvas 自有 Design System。

### 3.1.3 Motion for React 的角色

Motion 用于：

- 可中断 Spring。
- Drawer、Sheet 的手势和速度衔接。
- Shared Element Transition。
- 少量 Layout Animation。
- Drag、Swipe、Rubber-band 和 Momentum。
- 低频、需要连续空间关系的状态转换。

Motion 不用于：

- React Flow 的每个节点位置更新。
- 所有按钮和 Hover。
- 大列表每一行的 Layout Animation。
- 每个 WebSocket Token 的动画。
- 纯颜色变化。
- 高频快捷键操作。

### 3.1.4 动效实现优先级

```text
1. 无动画，直接更新
2. CSS state / transition
3. Base UI starting / ending style
4. Motion value / spring / presence
5. 自定义 Pointer + requestAnimationFrame
```

只有上一层无法正确表达交互时，才进入下一层。

---

## 4. 设计原则

## 4.1 Response：按下即反馈

- Press feedback 从 Pointer Down / Active 开始，不等 Click 完成。
- 拖拽中内容与指针 1:1 跟随。
- 不在输入路径加入无必要 debounce。
- 点击运行后立即进入 Submitting 状态，不能等后端返回 Job ID 才反馈。
- 服务端保存不阻塞下一次本地编辑。

## 4.2 Continuity：保持对象身份

- 同一素材从网格进入预览时保持视觉连续性。
- Panel 从触发它的方向出现，并沿同一路径退出。
- Inspector 切换对象时，外壳保持稳定，只替换内容。
- 节点从创建菜单进入画布时，应落在用户触发位置附近。
- 任务结果更新原节点，而不是突然在页面其他位置出现。

## 4.3 Interruptibility：允许重新接管

- 用户可在 Drawer 开合中反向拖动。
- 快速重复打开/关闭 Popover 不出现跳帧。
- 节点拖拽不因自动布局或保存被锁定。
- 动效进行中不禁用无关输入。
- Spring 从当前屏幕值继续，不从逻辑目标重新开始。

## 4.4 Restraint：动效必须有目的

合法目的：

- 即时反馈。
- 解释空间关系。
- 维持对象连续性。
- 减轻突变。
- 表达状态和完成。
- 帮助用户理解影响范围。

“看起来酷”不是高频工作界面的充分理由。

## 4.5 Frequency：频率决定动效强度

| 使用频率 | 动效策略 |
|---|---|
| 每天数百次 | 无进出动画，状态即时变化 |
| 每天数十次 | 只保留 80～160ms 微反馈 |
| 偶尔发生 | 允许标准 Popover、Drawer、Dialog 动效 |
| 极少发生 | 可增加适度 Shared Element 或编排动效 |

典型规则：

- Command Palette 的键盘打开不播放明显动画。
- 节点选择不缩放卡片，只改变边框、阴影和控制项。
- Tooltip 第一次有延迟；同一工具栏连续浏览时立即切换。
- 模态和预览可以有更完整但仍克制的动效。

---

## 5. Design Token

所有视觉和动效值必须进入 Token，禁止组件散落 Magic Number。

## 5.1 Color Token

使用语义颜色，不以具体灰阶名称作为业务接口。

```css
:root {
  --color-canvas: oklch(0.975 0.004 255);
  --color-surface: oklch(0.995 0.002 255);
  --color-surface-subtle: oklch(0.965 0.005 255);
  --color-surface-raised: oklch(1 0 0 / 0.86);

  --color-text: oklch(0.20 0.012 255);
  --color-text-secondary: oklch(0.46 0.012 255);
  --color-text-tertiary: oklch(0.60 0.010 255);

  --color-border: oklch(0.78 0.010 255 / 0.42);
  --color-border-strong: oklch(0.58 0.015 255 / 0.48);

  --color-accent: oklch(0.62 0.19 255);
  --color-accent-hover: oklch(0.57 0.20 255);
  --color-accent-soft: oklch(0.93 0.04 255);

  --color-success: oklch(0.62 0.16 150);
  --color-warning: oklch(0.72 0.16 75);
  --color-danger: oklch(0.60 0.21 25);
  --color-info: var(--color-accent);
}
```

Dark Theme 采用独立语义值，不简单执行颜色反转。

### 5.1.1 颜色规则

- 主界面以中性灰和内容缩略图为主。
- 一个页面最多一个高强调 Primary Action。
- Accent 用于选中、主要操作和链接，不用于大面积背景。
- Status 色必须同时有图标、文字或形状，不能只依赖颜色。
- Error 红只在真正错误和危险操作中使用。
- Running 状态优先使用稳定进度和文字，不持续闪烁蓝光。

## 5.2 Surface Token

```text
Canvas       无限画布和页面底层
Surface      普通卡片、表格、面板
Subtle       分区、输入背景、次级区域
Raised       Popover、Menu、Tooltip、浮动工具栏
Modal        Dialog、Lightbox
Scrim        阻断式任务背景
```

### 材质规则

- 半透明只用于 Top Bar、浮动工具栏、Popover、Sheet 等悬浮 Chrome。
- 普通内容卡片保持近实色。
- 禁止在半透明面板上再叠加半透明卡片。
- Backdrop Blur 只用于小面积、低数量层级。
- Material 的目的在于区分层级，不是装饰。

## 5.3 Radius Token

```css
--radius-xs: 4px;
--radius-sm: 7px;
--radius-md: 10px;
--radius-lg: 14px;
--radius-xl: 18px;
--radius-round: 999px;
```

使用建议：

- Input / Button：7～10px。
- Node Card：12～14px。
- Inspector Panel：0 或 14px，取决于是否停靠。
- Popover：12px。
- Dialog：16～18px。
- Chip：圆角胶囊仅用于标签和状态，不用于所有按钮。

禁止整个产品统一使用超大圆角。

## 5.4 Spacing Token

采用 4px 基线：

```text
1: 4px
2: 8px
3: 12px
4: 16px
5: 20px
6: 24px
8: 32px
10: 40px
12: 48px
```

密度策略：

- 工具栏和表格使用 Compact Density。
- 表单和 Inspector 使用 Standard Density。
- 项目概览和空状态可使用 Comfortable Density。
- 不通过无限加大留白制造高级感。

## 5.5 Typography Token

字体栈：

```css
--font-sans:
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  "PingFang SC",
  "Microsoft YaHei",
  "Noto Sans CJK SC",
  sans-serif;

--font-mono:
  ui-monospace,
  SFMono-Regular,
  Menlo,
  Monaco,
  Consolas,
  monospace;
```

字号建议：

| Token | Size | Line Height | 用途 |
|---|---:|---:|---|
| Display | 28～32 | 1.15 | 项目欢迎和少量大标题 |
| H1 | 22～24 | 1.25 | 页面标题 |
| H2 | 18～20 | 1.30 | 分区标题 |
| H3 | 15～16 | 1.35 | 卡片和 Inspector 标题 |
| Body | 14 | 1.50 | 常规内容 |
| Small | 12～13 | 1.45 | 辅助信息 |
| Micro | 11 | 1.35 | 极少量状态和刻度 |

规则：

- 大标题适度负字距。
- 小字号不使用过细字重。
- 正文最小不低于 13px，核心操作不低于 14px。
- 中文正文默认 400～450 字重；强调使用 550～600。
- 数字进度、时长和计数使用 Tabular Numbers。
- 代码、模型 ID、任务 ID 使用 Mono。

## 5.6 Elevation Token

阴影必须轻量且与层级对应：

```css
--shadow-1: 0 1px 2px rgb(15 23 42 / 0.06);
--shadow-2: 0 6px 18px rgb(15 23 42 / 0.10);
--shadow-3: 0 16px 44px rgb(15 23 42 / 0.16);
```

- 普通卡片主要靠 Surface 和 Border，不默认使用明显阴影。
- Popover 使用 shadow-2。
- Dialog 和 Lightbox 使用 shadow-3。
- Node Selected 不能用大面积发光，使用清晰 Accent Ring。

---

## 6. Layout Token

```text
Top Bar Height: 52px
Navigation Rail: 56px
Expanded Sidebar: 232px
Inspector Default: 340px
Inspector Range: 300～480px
Task Shelf Collapsed: 40px
Task Shelf Expanded: 220～360px
Floating Toolbar Control: 32～36px
Standard Page Padding: 20～24px
```

### 6.1 视觉节奏

- Top Bar、Sidebar、Inspector 使用稳定边界，不随页面跳动。
- 主内容宽度变化使用快速、可中断布局过渡；拖动调整宽度时 1:1 跟随，不使用 Spring。
- Inspector 打开时主内容被重新布局，默认不覆盖；窄屏才使用 Overlay。
- 页面局部工具栏不重复 Top Bar 的动作。

---

## 7. Motion Token

## 7.1 Duration

```css
--duration-instant: 0ms;
--duration-press: 100ms;
--duration-fast: 140ms;
--duration-normal: 180ms;
--duration-medium: 240ms;
--duration-slow: 320ms;
--duration-sheet: 360ms;
```

约束：

- 高频 UI 动效尽量不超过 180ms。
- Popover、Menu、Tooltip 不超过 200ms。
- Dialog、Drawer 通常 220～360ms。
- 超过 400ms 的 UI 动效必须有明确理由。
- Loading 和进度不是靠延长动画表达。

## 7.2 Easing

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
--ease-standard: cubic-bezier(0.2, 0, 0, 1);
```

使用规则：

- 进入和响应：Ease Out。
- 屏幕中已有对象移动：Ease In Out。
- Drawer / Sheet：Drawer Curve 或 Spring。
- Spinner 和确定性进度轨迹：Linear。
- 禁止 UI Entrance 使用 Ease In。

## 7.3 Spring

默认 Spring：

```ts
const springDefault = {
  type: "spring",
  duration: 0.38,
  bounce: 0,
};
```

动量 Spring：

```ts
const springMomentum = {
  type: "spring",
  duration: 0.42,
  bounce: 0.16,
};
```

规则：

- 默认无 Bounce。
- 只有 Flick、Drag Release、Snap 等带真实动量的交互允许轻微 Bounce。
- Menu、Tooltip、普通 Dialog 禁止弹跳。
- 动效必须从当前显示值继续。

---

## 8. 组件交互规范

## 8.1 Button

状态：

```text
Default / Hover / Pressed / Focus / Loading / Disabled / Destructive
```

规则：

- Pointer Down 使用 `scale(0.97～0.985)`。
- Press 动效 100～140ms。
- Loading 时保持按钮宽度，避免文字切换导致布局跳动。
- 图标和文字同时存在时，图标 16px，间距 6～8px。
- Primary Button 只用于当前区域最主要动作。
- Disabled 不能只降低透明度到无法阅读。

## 8.2 Icon Button

- 默认点击区域不小于 32×32px。
- 密集工具栏可以视觉尺寸 28px，但 Hit Target 保持 32px 以上。
- 必须有 Tooltip 和 aria-label。
- Press 反馈比 Hover 更明确。
- 同组 Icon Button 使用统一 Active 指示，不混用填充、边框和发光三种语言。

## 8.3 Tooltip

- 首次出现延迟 350～500ms。
- 同组 Tooltip 连续切换时立即出现。
- 进入 100～140ms，`opacity + scale(0.97)`。
- 从 Trigger 的 Transform Origin 展开。
- 不使用 Bounce。
- 不放复杂表单和关键操作。

## 8.4 Popover / Menu

- 与 Trigger 保持视觉锚点。
- 起始 Scale 不低于 0.94。
- 使用 Opacity + Scale，可增加 2～4px 方向偏移。
- 关闭沿相反路径返回。
- 快速反复触发时可中断。
- 菜单项 Hover 不左右移动。
- 破坏性操作与普通操作有分区。

## 8.5 Dialog

- Modal 保持中心 Origin，不伪装成从某个按钮长出来。
- 背景使用稳定 Scrim。
- 进入：Opacity + Scale 0.97～1，220～280ms。
- 退出更短，180～220ms。
- 仅对真正阻断流程的操作使用 Dialog。
- 普通属性编辑进入 Inspector 或 Sheet。

## 8.6 Sheet / Drawer

- 从其所在边缘进入和退出。
- 支持鼠标和触控拖拽关闭时，内容 1:1 跟随。
- Release 时根据位置和速度共同判断目标。
- 越界采用 Rubber-band，不硬停。
- 可在动画中重新抓取。
- Overlay Sheet 配合 Scrim；平行工作面板不使用 Scrim。

## 8.7 Tabs

- 高频工作区 Tabs 切换以即时内容更新为主。
- Indicator 可以 140～180ms Layout Transition。
- Tab Panel 不默认整页左右滑动。
- 只有明确前后顺序的步骤页使用 Direction-aware Transition。
- 键盘切换应快速，不播放大面积动画。

## 8.8 Toast

- 从固定边缘进入和退出，路径一致。
- 只用于异步结果和非阻断反馈。
- 表单错误使用 Inline Validation，不使用 Toast。
- 相同任务事件合并，不连续堆叠几十条。
- 支持 Hover 暂停自动关闭。
- Swipe Dismiss 才允许轻微动量。

## 8.9 Input / Select / Combobox

- Focus Ring 清楚但不过度发光。
- Label、描述和错误信息位置稳定。
- 错误出现不让整个表单大幅跳动。
- Select Popover 使用 Origin-aware Transition。
- Combobox 结果列表虚拟化时不使用每行入场动画。
- 参数变更若会触发高成本操作，明确显示 Apply 或 Run，不静默执行。

## 8.10 Context Menu

- 出现在指针附近，但保持视口安全边距。
- 进入动效极短或无动效。
- 画布右键菜单按对象上下文排序。
- 第一屏只展示常用命令；供应商和高级设置进入子级。

---

## 9. App Shell 动效规范

## 9.1 Sidebar

- 点击折叠：宽度 180～240ms Ease In Out。
- 拖拽调整：完全 1:1，无自动动画。
- 导航项 Active 背景 100～140ms。
- 文本淡入可比宽度变化稍晚 30～50ms，但不做明显 Stagger。
- 键盘快捷切换工作区不等待 Sidebar 动效完成。

## 9.2 Inspector

- 桌面停靠模式：宽度过渡 180～240ms。
- 内容切换：短 Crossfade 100～140ms，标题保持位置稳定。
- 对象连续切换时取消 Crossfade，优先即时响应。
- Inspector 内 Accordion 使用高度过渡，但大量内容时优先条件渲染。

## 9.3 Task Shelf

- 第一个任务出现时从底部展开 220～280ms。
- 后续任务更新不重复触发整体动画。
- 进度条使用真实进度；未知进度使用低对比 Indeterminate，不使用强闪烁。
- 成功状态在 300～600ms 后归入历史，避免突然消失。

## 9.4 Command Palette

- 键盘触发：即时出现，最多使用极短 Opacity。
- 鼠标触发：允许 100～140ms Scale + Opacity。
- 搜索结果不逐行 Stagger。
- 类别切换保持列表位置连续。

---

## 10. React Flow 画布视觉与动效

## 10.1 画布底层

- 背景使用低对比点阵或网格。
- 点阵在低缩放时不形成摩尔纹。
- 不使用大面积动态背景、流动渐变和粒子。
- MiniMap 为功能组件，默认低对比，Hover 后增强。

## 10.2 Node Card

统一结构：

```text
Header
Preview / Content Summary
Meta
Status / Actions
Handles
```

状态：

| 状态 | 表达方式 |
|---|---|
| Default | Surface + 轻 Border |
| Hover | Border 增强，出现轻量操作 |
| Selected | Accent Ring + 清晰 Handle |
| Running | 状态条或边缘 Progress，不脉冲整张卡片 |
| Success | 短暂 Success 标记，随后回归普通状态 |
| Warning | 黄色状态图标和说明 |
| Error | Danger Ring + 可读错误摘要 |
| Disabled | 降低交互强调，内容仍可读 |

### 节点动效规则

- 拖拽位置完全交给 React Flow，不在节点外包 Motion Layout。
- 拖拽中关闭阴影过渡和复杂 Filter。
- 选中不缩放节点，避免连接线和坐标视觉抖动。
- 新建节点可使用 120～180ms Opacity + Scale 0.97。
- 删除节点默认即时，Undo Toast 提供恢复；不做长时间缩小消失。
- 自动布局完成时可选择性平滑移动，但必须可取消，并支持大节点数时关闭。

## 10.3 Edge

- 默认 Edge 低对比。
- 选中节点相关 Edge 提升对比。
- Running Flow 可以使用有限的方向指示，但禁止所有边持续流动。
- 错误连接明确标红并提供原因。
- 创建连接时跟随指针 1:1，不使用拖尾。

## 10.4 Node Picker

- 从用户双击位置或快捷键上下文出现。
- Origin 与触发点一致。
- 搜索为首要交互。
- 节点分类仅做短 Crossfade，不使用大幅滑动。
- 选择节点后 Picker 立即关闭，节点在触发点附近创建。

## 10.5 Zoom Level Detail

```text
Zoom > 80%：完整节点摘要
Zoom 45～80%：隐藏次级 Meta 和操作
Zoom 20～45%：仅标题、预览色块、状态和 Handle
Zoom < 20%：轻量轮廓和类别标识
```

降级切换不使用复杂动画，避免缩放过程中额外渲染。

---

## 11. Asset Library 动效

- 网格滚动不使用 Scroll Reveal。
- Hover 只增强 Border、背景和操作，不放大整张图片。
- Hover Preview 延迟 300～450ms，离开后快速关闭。
- 从缩略图打开 Preview 可使用 Shared Element Transition。
- 图片加载完成使用 120～180ms Crossfade。
- Skeleton Shimmer 对比度极低，并在 Reduced Motion 下停止移动。
- 批量选择使用稳定 Checkbox 和 Selection Bar，不让卡片上下跳动。
- 拖入画布时使用 Drag Preview，Drop 后在目标位置创建 Node。

---

## 12. Agent 与任务动效

## 12.1 消息流

- Streaming Text 不对每个 Token 做位置或透明度动画。
- 新消息块第一次出现可短 Fade。
- Tool Call 折叠区展开使用 160～220ms。
- Plan 更新只高亮变化区域，不让整块重新入场。
- Permission Request 使用稳定卡片，不持续脉冲。

## 12.2 状态变化

```text
Starting → Running → Waiting → Completed / Failed / Cancelled
```

- 状态图标可 Morph 或 Crossfade。
- Completed 使用一次短反馈，不播放庆祝动画。
- Failed 使用清晰原因和操作，不使用 Shake，除非用户刚提交了无效本地输入。
- 长任务进度变化使用 Tabular Numbers，防止宽度抖动。

## 12.3 Artifact 回写

- Artifact 创建后在当前上下文出现轻量 Preview Card。
- 用户选择“添加到画布”时使用可追踪的空间移动或明确 Toast。
- 不自动把结果插入用户当前视口中央并打断操作。

---

## 13. Loading、Empty、Success 与 Error

## 13.1 Loading

- 首屏使用结构对应的 Skeleton。
- 已有数据刷新时保留旧内容。
- 200ms 内完成的请求不显示 Spinner，避免闪烁。
- 超过阈值才显示局部 Loading。
- Spinner 速度稳定，不通过夸张速度制造焦虑。

## 13.2 Empty

空状态包含：

- 简短原因。
- 最主要下一步。
- 一个次要入口。

不使用巨大插画占据专业工具主空间。

## 13.3 Success

- 保存成功通常只更新安静状态文字。
- 创建成功可使用 Toast。
- 重要导出完成提供“打开文件夹”或“查看结果”。
- 成功反馈不长期保持绿色背景。

## 13.4 Error

- 本地字段错误 Inline 展示。
- 后端任务错误显示在 Node、Inspector 和 Task Shelf 的关联位置。
- Toast 只做全局摘要。
- Raw Error 折叠在 Technical Details。
- 不可恢复错误必须说明数据是否安全。

---

## 14. Accessibility 与 Reduced Motion

必须支持：

```text
prefers-reduced-motion
prefers-contrast
forced-colors
键盘导航
屏幕阅读器
200% 文本缩放
```

## 14.1 Reduced Motion

启用后：

- Slide、Spring、Parallax 替换为短 Crossfade 或即时变化。
- Shared Element Transition 降级为 Crossfade。
- Rubber-band 和 Bounce 关闭。
- Skeleton Shimmer 停止，改为静态占位。
- 画布自动布局可直接跳到最终位置或使用极短过渡。

Reduced Motion 不是关闭所有反馈；Focus、Pressed、状态和颜色变化仍保留。

## 14.2 Reduced Transparency / High Contrast

浏览器支持有限，因此提供应用内设置：

```text
Transparency: Auto / Reduced
Contrast: Auto / Standard / High
Motion: Auto / Reduced
Density: Compact / Standard / Comfortable
```

Reduced Transparency 下：

- Floating Surface 提高不透明度。
- 关闭 Backdrop Blur。
- 增强 Border。

## 14.3 Focus

- 所有可交互组件必须有清晰 Focus Visible。
- 鼠标点击不强制显示键盘 Focus Ring。
- 画布节点可以键盘遍历。
- Popover、Dialog、Menu 正确管理 Focus Trap 和 Return Focus。

---

## 15. 性能边界

漂亮的 UI 不能以牺牲画布性能为代价。

## 15.1 强制规则

- 动画优先只修改 Transform 和 Opacity。
- 禁止 `transition: all`。
- 拖拽路径禁止 Backdrop Filter、Blur 和 Box Shadow 动画。
- React Flow Node 不使用全局 Motion Layout。
- 虚拟化列表行不使用 Presence Exit Animation。
- 不在大量元素上常驻 `will-change`。
- WebSocket 高频更新必须聚合到每帧或更低频率。
- 大面积 Blur 同时存在不超过 2～3 层。
- Filter Blur 动画只用于小面积、低频过渡。
- 避免动画 Width、Height、Top、Left；面板拖动除外且应直接赋值。

## 15.2 Motion Bundle

- 使用 `LazyMotion` 或按需导入减少体积。
- 将手势和 Shared Element 能力限定在明确组件中。
- 普通 Button、Input、Menu 优先 CSS。
- 首屏不加载低频预览和复杂手势代码。

## 15.3 性能降级

满足任一条件时自动减少动效：

- 节点数量超过阈值。
- 浏览器检测到持续掉帧。
- 用户开启 Reduced Motion。
- 低性能设备或远程桌面环境。
- 页面不可见。

降级内容：

- 关闭节点新建动画。
- 关闭自动布局动画。
- 关闭 Shared Element。
- 停止非必要 Shimmer。
- 降低 Blur。

---

## 16. 设计系统代码结构

```text
frontend/src/design-system/
├── tokens/
│   ├── colors.css
│   ├── typography.css
│   ├── spacing.css
│   ├── radius.css
│   ├── elevation.css
│   └── motion.ts
├── primitives/
│   ├── button/
│   ├── input/
│   ├── popover/
│   ├── tooltip/
│   ├── dialog/
│   ├── sheet/
│   ├── menu/
│   └── tabs/
├── components/
│   ├── NodeCard/
│   ├── MediaThumbnail/
│   ├── InspectorSection/
│   ├── TaskProgress/
│   ├── AgentMessage/
│   ├── ToolCallCard/
│   ├── ArtifactCard/
│   └── EmptyState/
├── motion/
│   ├── presets.ts
│   ├── ReducedMotionProvider.tsx
│   ├── SharedPreview.tsx
│   └── useMotionPreference.ts
└── stories/
```

禁止业务页面绕过 Design System 自行创建另一套 Button、Modal 和 Tooltip。

---

## 17. 原型与评审流程

## 17.1 必须先做交互原型

以下交互不能只靠静态图确认：

- Sidebar 和 Inspector 开合。
- Node Picker。
- 节点创建、选中和运行状态。
- Asset Preview Shared Element。
- Task Shelf。
- Agent Tool Call 和 Permission。
- Drawer 拖拽和反向中断。

## 17.2 评审方式

每个动效至少检查：

- 正常速度。
- 0.25x 慢放。
- 快速重复触发。
- 动画中途反向。
- Reduced Motion。
- 低性能模式。
- 鼠标和触控板。
- 键盘操作。

## 17.3 Before / After 评审表

UI 评审统一使用：

| Before | After | Why |
|---|---|---|
| 当前实现 | 建议实现 | 设计或性能原因 |

不接受只写“更高级”“更有质感”而没有可验证原因的评审意见。

---

## 18. 第一阶段组件优先级

### P0

- App Shell。
- Button / IconButton。
- Tooltip。
- Popover / Menu / Context Menu。
- Dialog / Sheet。
- Tabs。
- Input / Select / Combobox。
- Toast。
- NodeCard。
- Inspector。
- Task Shelf。
- Media Thumbnail / Preview。
- Command Palette。
- Skeleton / Empty / Error。

### P1

- Agent Message。
- Tool Call Card。
- Permission Card。
- Artifact Card。
- Version Switcher。
- Before / After Compare。
- Drag Reorder。
- Shared Element Preview。

### P2

- 自由画板专用工具。
- 时间轴组件。
- 多窗口布局。
- 可定制工具栏。

---

## 19. UI 验收标准

### 视觉

- 页面不依赖大面积渐变和装饰建立层级。
- 明暗主题均达到可读对比度。
- 卡片、Popover、Dialog、Inspector 层级明确。
- 节点状态视觉统一。
- 高频界面保持低噪音。

### 交互

- Button 在按下时立即反馈。
- Popover 从 Trigger 方向出现。
- Panel 进入和退出路径一致。
- 动画中可再次操作，不锁输入。
- 键盘高频操作无明显等待动画。
- 用户能够撤销普通删除和编辑。

### 动效

- 绝大多数 UI 动效不超过 300ms。
- 普通弹层无 Bounce。
- 只有动量交互使用轻微 Bounce。
- Reduced Motion 完整可用。
- 快速反复触发不跳帧或闪烁。

### 性能

- React Flow 拖拽不因 UI 动效掉帧。
- 节点不套全局 Layout Animation。
- 100 个节点下交互稳定。
- 大列表虚拟化后不执行逐项入场动画。
- Background Blur 不成为持续 GPU 压力来源。

---

## 20. 技术决策摘要

| 决策项 | 最终决定 |
|---|---|
| 视觉方向 | 安静、精确、内容优先、专业、克制 |
| 是否复制 Apple UI | 否，只吸收响应、连续性、空间关系和动效原则 |
| Headless Primitive | Base UI |
| 组件源码基座 | shadcn/ui Base UI 版本 |
| 样式 | Tailwind CSS + 自有 Token |
| 复杂动效 | Motion for React |
| 高频微交互 | CSS Transition / Base UI 状态 |
| 画布节点位置动画 | React Flow 原生，不套 Motion Layout |
| 默认 Spring | 无 Bounce、可中断 |
| Bounce | 仅动量手势 |
| Material | 只用于少量悬浮层级 |
| Accessibility | Reduced Motion、Contrast、键盘和 Focus 为强制要求 |

---

## 21. 最终原则

> 好用先于好看，但真正优秀的界面不需要在两者之间二选一。

> 动效不是装饰层，而是输入、空间、状态和反馈之间的连续关系。

> 用户每次都能看到的动效应极短或不存在；用户偶尔需要理解的空间变化，才值得更完整的过渡。

> 让内容、素材和创作结果成为视觉主角，让工具栏、面板和状态安静地完成工作。

> 每个动画、间距、颜色和层级都必须能够说明其用途；无法说明用途的设计应被删除。