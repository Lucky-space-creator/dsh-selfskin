# 侧边栏面板改造 v1.6

> 两条需求：① 壁纸从「氛围特效」搬到「皮肤」；② 插件不再是通用设置里的三行，
> 而是侧边栏一个叫「皮肤管理」的入口。版本 1.0.3 → **1.1.0** ｜ 断言 65 → **67**

---

## 1. 两条需求，一次改完

| 需求 | 落实 |
|---|---|
| 壁纸归皮肤 | 壁纸开关 + 整个壁纸面板（网址 / 本地图片 / 清除 / 不透明度 / 模糊 / 显示方式）搬进 `SkinRow`；「氛围特效」只剩极光、光尘、毛玻璃 |
| 独立导航入口 | 侧边栏多一行「皮肤管理」，点开是插件自己的面板；`settings.general.item` **零注册** |

---

## 2. 宿主机制：取证结论

需求 ② 不是"找个地方塞 UI"，宿主的插槽系统里有明确的两半结构。全部读自
`app.asar` 内的官方包：

| 插槽 | 定义处 | 作用 |
|---|---|---|
| `sidebar.panellist` | `dsh-client-ui-sidebar` | 侧边栏面板**列表**，`kind: "list"` |
| `main` | `dsh-client-ui-layout` | 内容区，`kind: "keyed"` |

**导航项注册**（官方插件管理器的写法，`order: 0`；任务管理器 `order: 10`）：

```js
ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 20,
    label: () => t('panel')
}, PluginsPanelIcon));
```

侧边栏消费时只取三样 —— `{ id, order, label }`，按 `order` 排序：

```js
const next = ctx.slots.entriesOfSlot('sidebar.panellist').map(({ options }) => ({
    id: options.id,
    order: options.order ?? 0,
    label: resolveSlotLabel(options.label) ?? id
})).sort((a, b) => a.order - b.order);
```

`resolveSlotLabel` 只做一件事：**函数就调用，否则原样返回**。所以我们直接给字符串也合法。

**面板内容注册**：

```js
ctx.slots.inject('main', function* () {
    yield ctx.slots.register({ name: 'main', key: PANEL_ID, ... }, PluginManagerPage);
});
```

**匹配规则**（`dsh-client-ui-layout` 的 `MainPanel`）：

```js
return renderSlot('main', {}, { entryKey: usePanelInfo(info => info.activePanelId) ?? 'conversation' });
```

即：**内容区渲染 `key` 等于当前面板 id 的那个 `main` 条目**。而侧边栏行点击时
`selectPanel(id)` 把 `activePanelId` 设成它的 `id`。

### 于是契约只有一条

```
sidebar.panellist 的 id   ==   main 的 key
```

两者一旦漂移，侧边栏照样列出这一行、照样可点、照样高亮，**但内容区什么都不显示** ——
一个没人点不出来的静默故障。这是本次唯一值得用断言钉死的东西。

---

## 3. 几个设计取舍

**`order: 20`** —— 宿主自己的插件管理是 `0`、任务管理是 `10`。皮肤面板排在它们之后，
和宿主的管理类面板同组，而不是抢在最前面。

**图标自绘，不借宿主的** —— `practices.md` 禁止伸手进宿主 UI 包。而且宿主传给
图标组件的 props 是 `{ size, active }`，`size` 在侧边栏收起时是 18、展开时是 16，
所以尺寸必须来自 props。图形用 `currentColor`，颜色跟随侧边栏行。

**`label` 不用 locale** —— 插件其余文案全是硬编码中文（"选择内置皮肤，或导入你自己的
令牌皮肤。"等），把一个多语言导航标签塞进一个整体未翻译的面板里，不一致才是问题。
真要做 i18n 时应整面板一起做。

**面板自己带页面 chrome** —— 宿主的 `main` 插槽是**裸列**：官方插件面板、任务面板
都自带宽度、内边距和标题，因为 layout 除了框架本身不提供任何页面外壳。
所以 `.dss-page`（max-width 760、居中、上下留白）必须我们自己写，这不是可选项。

**壁纸为什么归皮肤** —— 它是铺在最底下的背景，所有特效全关时它依然在，而且它改变的是
"看起来是什么样"而不是"有什么在动"。把它和极光、光尘、毛玻璃并排会让用户以为关掉
特效它也会消失。放在皮肤选择器下面，语义才对。

---

## 4. 过程中修掉的两个真问题

| # | 问题 | 怎么暴露的 |
|---|---|---|
| 7 | `SkinPanelIcon` 读 `props.size` 前不判空 | 测试"每个已注册组件都能无错调用"直接打出来：`TypeError: Cannot read properties of undefined (reading 'size')`。宿主总会传 `{size, active}`，但一个渲染不出就抛异常的图标会**拖垮侧边栏那一行**，而不是只丢个尺寸 |
| 8 | 搬迁壁纸时把三元表达式的 `: null` 分支删了 | `node --check` 报 `Unexpected token ','`。`open ? 面板` 少了 else，语法直接崩 —— 这个有编译器兜底，不算静默 |

第 8 个值得记一句：圆括号、花括号分别数都是**平衡的**（我写了脚本逐行跟踪深度，
两个都是 0），所以"括号配平"根本不足以发现这类错误 —— 三元被截断才是根因。

---

## 5. 证据

**67 项断言全绿**：pure 29 + client-harness 30 + validate-package 8。

新增的两条 + 一条迁移断言：

| 断言 | 守的是什么 |
|---|---|
| `the sidebar row and the panel share the id the layout matches on` | id === key、order 是数字、label 可解析为非空、Component 是函数 |
| `the plugin claims one sidebar row, one panel and two overlay entries` | 各插槽计数正确，且 `settings.general.item` **必须为 undefined** |
| `the wallpaper lives with the skin, not with the ambience effects` | 壁纸开关在皮肤分区、氛围分区只剩三个 |

**可证伪验证（2 组注入）**：

| 注入的缺陷 | 结果 |
|---|---|
| 把 `main` 的 `key` 改成 `'selfskin-panel'` | ❌ `the row id must be the panel key` |
| 在 `main` 前插回一个 `settings.general.item` 注册 | ❌ `no settings rows` |

两组各自只打掉一条断言，实验后重建恢复。

---

## 6. 真机验收要点

重启应用后：

1. **侧边栏**应出现「皮肤管理」一行，带调色板图标，位于宿主「插件」「任务」之后；
   点击后内容区切到插件面板，侧边栏该行高亮、图标填充。
2. **面板**顶部有「皮肤管理」标题与说明，下面依次是皮肤行（含壁纸）、按钮特效、氛围特效。
3. **皮肤行**应看到「皮肤」主行 + 「壁纸」子行；打开壁纸开关后展开网址/本地图片/
   清除/不透明度/模糊/显示方式。
4. **氛围特效行**应只有极光、光尘、毛玻璃三个开关，**没有壁纸**。
5. **通用设置里不应再出现**皮肤/按钮特效/氛围特效三行（这是需求 ② 的判据）。
6. 特效（涟漪、光尘、极光、壁纸）应照旧工作 —— 它们走 `shell.overlay`，与入口无关。

---

## 7. 剩余风险

| 项 | 说明 |
|---|---|
| 面板内边距可能与宿主叠加 | `main` 是裸列，但若未来宿主给它加内边距，我们的 28px 会叠加。已按官方面板同样的方式处理（自带外壳），届时随宿主调整 |
| 侧边栏收起时的图标可读性 | 18px 的单色轮廓图标在收起态是否够清晰，需目视 |
| `order: 20` 的相对位置 | 若宿主新增自己的面板并也用 20，两者顺序不定。属显示细节，不影响功能 |
