# dsh-diy-theme 实现方案（v2.0）

> 目标：在 DeepSeek Harness（DSH）桌面端做一个**让用户自己造皮肤**的插件 ——  
> 取色器调几颗主色 → 自动推导整套界面配色 → 实时预览 → 保存/导入/导出/分享。  
> 本文先复盘成熟插件，再给出可落地的架构、API 精确用法、核心推导算法与代码骨架。

---

## 0. 调研结论：三个成熟家族横向对比

我读了当前最成熟的几款 DSH 皮肤插件，归纳成三条技术路线：

| 插件                                           | 路线                 | 皮肤来源                  | 构建                            | 持久化            | 评价                                                                              |
| -------------------------------------------- | ------------------ | --------------------- | ----------------------------- | -------------- | ------------------------------------------------------------------------------- |
| **KinGao294/dsh-skin** (v0.4.0)              | 正规 ThemeRuntime 插件 | 7 套内置调色板 + 自定义壁纸 + 桌宠 | 无（直接写 `__ModuleLoader__` 包格式） | localStorage   | **最规范**：`ctx.theme.register` 注册，`settings.general.item` 挂行                      |
| **Lichtspur/deepseek-style-theme** (v2.1.91) | 纯前端 CSS 注入         | 1 套官网风皮肤（液态玻璃/粒子）     | 无                             | 无（刷新即走）        | 简单但**脆弱**：靠注入 CSS 品牌变量，宿主改结构就崩；不注册 theme，无法随亮/暗切换                               |
| **HeiGeAi/deepseek-harness-skin** (21 套)     | **源码级补丁**          | 21 套 + 「传图自动出配色」      | 要 `pnpm run build`            | `~/.dsh/skins` | 皮肤**模型最科学**（见下），但**不是干净插件**——覆盖 `packages/client/ui-theme` + 8 个宿主补丁，需随宿主版本重新构建 |

**关键取舍**：

- `deepseek-style-theme` 的 CSS 注入路线**不要学**——它绕过 ThemeRuntime，亮/暗切换、对比度、可维护性全靠手调，DSH 一升级就失效。
- `HeiGeAi` 的**皮肤数据模型**要学，但**交付形态**不要学（源码补丁不可分发）。它把「一套皮肤 = 一份 JSON seed」做到极致，且用 OKLab 保对比度推导，这是 DIY 的核心思想。
- `KinGao294` 的**插件形态**要学——双面临时插件 + ThemeRuntime 注册，是我们 `dsh-selfskin` 已在用的路线，也是 DSH 官方认可的分发方式。

---

## 1. DSH 皮肤系统的真实机制（写代码前必须先懂）

DSH 的主题是 **token 驱动**的：Web 外壳预定义了 `--dsw-*` 设计令牌，ThemeRuntime 让第三方插件覆盖别名层（`--dsw-alias-*`）和特定层（`--dsw-specific-*`）。

### 1.1 唯一可信的 API（`ctx.theme`）

| API                                                 | 形状                  | 用途                        | 坑                                                                                                      |
| --------------------------------------------------- | ------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ctx.theme.register({ id, colorScheme, tokens })`   | `tokens` 是**纯字符串**表 | 注册一个完整皮肤                  | `tokens` 里**绝不能**放 `{light,dark}` 配对对象，否则 `ThemePresenter` 把 `[object Object]` 写进 `body.style`，界面直接变空白 |
| `ctx.theme.overrideTokens(source, { light, dark })` | 成对覆盖                | 做「半透明画布/侧栏」这类**随亮暗切换**的覆盖 | 这是**唯一**接受 `{light,dark}` 的地方；`composeActive()` 按当前 `colorScheme` 解析                                   |
| `ctx.theme.setTheme(id)`                            | 字符串 id              | 应用已注册皮肤                   | 传未注册的 id（如 `'default'`）会抛错，被吞掉后静默失效——所有可选项都必须是已注册 id                                                   |

- **`colorScheme` 是承重墙**：驱动 `body[data-ds-dark-theme]` 与 `document.documentElement.style.colorScheme`。暗色皮肤不声明 `dark`，宿主自己的暗色样式不会激活。
- **作用域只动 `--dsw-*`**：令牌改名时只丢一个面的观感，不会破坏渲染。禁止写死字面色（那是美术资源的事）。
- **写入位置**：`ThemePresenter.apply()` 把 `tokens` 每项用 `style.setProperty(name, value)` 写到 `<body>` 上。
- **模块边界**：`lib/client.js` 只能 `require` 模块表里的实体——平台种子（`react`、`react/jsx-runtime`…）和已注册客户端包（`@deepseek-ai/dsh-client-ui-theme/client`…）。

### 1.2 双面 Cordis 插件形态（`dsh-selfskin` 已在用）

- **Host 半 `lib/index.js`**：`dsh.bundle` 补丁层（`cordis.patch.yml` 插入一个 loader 入口），`apply` 是空实现，和官方 `ui-*` 包同构。
- **Client 半 `lib/client.js`**：`dsh.client` 包（服务于 `/plugins/<name>/client.js`）。我们用 `build.mjs` 把 `export` 剥掉、内联 CSS、注入 React/h，产出一个零依赖包；KinGao294 则直接手写 `__ModuleLoader__` 格式（无构建，但组件多了难维护）。
- **`package.json` 关键字段**：
  ```jsonc
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",      // 注意：是「加载契约」不是产品描述；桌面端也填 "web"
      "immediately": true,
      "inject": ["@deepseek-ai/dsh-client-ui-theme"]
    }
  }
  ```

### 1.3 插槽（slot）选择

| 插槽                           | 用法                                                        | 我们/他人                                                                             |
| ---------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `sidebar.panellist` + `main` | 侧边栏加一个导航项；`main` 是 **keyed 插槽**，只渲染 `key === 当前面板 id` 的条目 | `dsh-selfskin` v1.1.0 用的就是它（id=`selfskin`）。**导航 id 必须等于 main 的 key，否则点开空白（静默故障）** |
| `settings.general.item`      | 在「通用设置」里插一行                                               | KinGao294 用这个（order 40/41/42）                                                     |
| `shell.overlay`              | 固定层（壁纸/粒子/涟漪）                                             | 两者都用                                                                              |

**结论**：DIY 编辑器交互重，用 `sidebar.panellist` + `main` 开一个「主题工作室」面板，比塞进通用设置里更顺手。

---

## 2. DIY 主题插件定位

| 项    | 决策                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------ |
| 插件名  | `dsh-diy-theme`（独立插件；也可把功能合并进 `dsh-selfskin` 的「皮肤管理」面板）                                                            |
| 核心能力 | 用户用**取色器**调 4 颗种子色 → 自动推导整套 `--dsw-alias-*` 令牌 → **实时预览** → 保存为「我的主题」→ 导入/导出/分享 JSON → （进阶）**传一张图自动出配色**           |
| 复用   | 直接复用 `dsh-selfskin` 的：ThemeRuntime 注册/应用逻辑、`sidebar.panellist`+`main` 骨架、localStorage 持久化、零依赖 `build.mjs`、67 项测试体系 |
| 新做   | 取色器 UI、OKLab 保对比度推导引擎、JSON 导入导出、图取色（可选）                                                                            |

---

## 3. 皮肤数据模型：从 4 颗种子推导整套令牌（DIY 的心脏）

借鉴 HeiGeAi 但**不**做源码补丁：把「一套皮肤 = 一份 JSON」收敛成只让用户填 4 颗种子色，其余由插件推导。

```jsonc
// 用户只需要填这 4 颗（UI 就是 4 个取色器）
{
  "id": "diy-<timestamp>",
  "name": { "zh": "我的主题", "en": "My Theme" },
  "appearance": "dark",          // 用户选 亮/暗，决定 colorScheme
  "seeds": {
    "accent":   "#7c5cff",       // 品牌主色
    "secondary":"#b39dff",       // 辅色
    "surface":  "#0d1020",       // 背景基色
    "text":     "#eef0f6"        // 主文字色
  }
}
```

**推导引擎（核心，`src/derive.js`，纯函数、可单测）**：

```js
// sRGB <-> OKLab（保感知均匀，推导出的明暗阶梯不会“塌”）
function srgbToOklab(hex) { /* 标准实现：sRGB→linear→OKLab */ }
function oklabToSrgb(L,a,b) { /* 逆变换，色域外做色度二分拉回 */ }

// 在 OKLab 空间按比例 t 插值，比 sRGB 直接 lerp 观感更准
function mix(aHex, bHex, t) {
  const A = srgbToOklab(aHex), B = srgbToOklab(bHex);
  return oklabToSrgb(
    A.L+(B.L-A.L)*t, A.a+(B.a-A.a)*t, A.b+(B.b-A.b)*t
  );
}

// 保对比度：把前景色向文字色 mix，直到与背景达到目标对比度
function ensureContrast(bgHex, fgHex, ratio = 4.5) {
  let fg = fgHex;
  for (let i = 0; i < 12 && contrast(bgHex, fg) < ratio; i++) {
    fg = mix(fg, /*textSeed*/ fgHex, 0.12); // 逐步压暗/提亮
  }
  return fg;
}

// 由 4 颗种子推出 dsh-selfskin 同构的 tokens 表
export function deriveTokens({ accent, secondary, surface, text, appearance }) {
  const dark = appearance === 'dark';
  const rampBg   = mix(surface, dark ? '#000' : '#fff', 0.04); // bg-layer-1..4 阶梯
  const rampBd   = mix(surface, dark ? '#fff' : '#000', 0.14); // border-l1..4
  return {
    '--dsw-alias-bg-base':     surface,
    '--dsw-alias-bg-layer-1':  mix(surface, rampBg, 0.5),
    '--dsw-alias-bg-layer-2':  mix(surface, rampBg, 1.0),
    '--dsw-alias-bg-layer-3':  mix(surface, rampBg, 1.6),
    '--dsw-alias-bg-layer-4':  mix(surface, rampBg, 2.2),
    '--dsw-alias-brand-primary': accent,
    '--dsw-alias-label-primary':   text,
    '--dsw-alias-label-secondary': ensureContrast(surface, mix(text, accent, 0.25), 4.5),
    '--dsw-alias-label-tertiary':  ensureContrast(surface, mix(text, accent, 0.45), 3.0),
    '--dsw-alias-label-caption':   ensureContrast(surface, mix(text, accent, 0.6),  2.5),
    '--dsw-alias-border-l1':    rampBd,
    '--dsw-alias-border-l2':    mix(rampBd, surface, 0.4),
    '--dsw-alias-border-l3':    mix(rampBd, surface, 0.7),
    '--dsw-alias-border-l4':    mix(rampBd, surface, 1.0),
    '--dsw-alias-link':         ensureContrast(surface, secondary, 4.5),
    '--dsw-alias-button-primary-fill':   `linear-gradient(135deg, ${mix(accent,'#000',0.15)}, ${accent})`,
    '--dsw-alias-button-primary-hover':  `linear-gradient(135deg, ${mix(accent,'#000',0.05)}, ${mix(accent,'#fff',0.12)})`,
    '--dsw-alias-button-ghost-active-fill':   hexToRgba(accent, 0.14),
    '--dsw-alias-button-ghost-active-border': hexToRgba(accent, 0.5),
    '--dsw-alias-interactive-bg-hover':  hexToRgba(text, dark ? 0.06 : 0.05),
    '--dsw-alias-interactive-bg-active': hexToRgba(text, dark ? 0.1  : 0.09),
    '--dsw-alias-state-business-primary': accent,
    '--dsw-alias-markdown-inline-code':  hexToRgba(accent, 0.14),
    '--dsw-alias-markdown-code-block':   mix(surface, dark ? '#000' : '#fff', 0.06),
    '--dsw-alias-scrollbar-bg-l2':       hexToRgba(text, 0.12),
    '--dsw-alias-scrollbar-hover-l2':    hexToRgba(text, 0.2),
    '--dsw-specific-sidebar-fill': mix(surface, dark ? '#000' : '#fff', 0.02),
    '--dsw-specific-input-major':   mix(surface, dark ? '#000' : '#fff', 0.08),
    '--dsw-specific-menu':          mix(surface, dark ? '#000' : '#fff', 0.05)
  };
}
```

**为什么必须保对比度**：HeiGeAi 的教训——原生色板是「73 级绝对色阶 + 89 个语义别名」，从 4 颗种子推导整条阶梯时若只做线性插值，按钮/边框/禁用态的层次会塌掉、文字会读不清。在 OKLab 里推导 + 对比度兜底，能避免「看着挺花、实际瞎眼」的废皮肤。

---

## 4. DIY 编辑器：三个入口（对应三种用户）

| 入口                | 交互                                                                     | 产出                                                       |
| ----------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| **A. 取色器**        | 4 个 `<input type=color>`（accent/secondary/surface/text）+ 亮暗开关 + 不透明度滑条 | 实时调 `deriveTokens` → 预览                                  |
| **B. 导入/导出 JSON** | 「导出」把当前种子+推导结果存成文件；「导入」解析 JSON 还原                                      | 复用 `dsh-selfskin` 的 `parseImportedSkin` + `fillTemplate` |
| **C. 传图取色（进阶）**   | 选一张图 → canvas 采样（96px 取主/副/底/文字四色 + 判明暗）→ 喂给 A                         | 仿 HeiGeAi「扔张图配色跟着走」，原图不出本机                               |

**编辑器骨架（`src/ui.js` 里的 `ThemeStudio` 组件）**：

```
┌─ 主题工作室 (sidebar 面板, key="diy-theme") ──────────────┐
│  [名称输入框]   外观: (○亮 ○暗)                            │
│  主色  [🟣#7c5cff]  辅色 [🟣#b39dff]                      │
│  背景 [⬛#0d1020]  文字 [⬜#eef0f6]                        │
│  ── 实时预览卡片（用 deriveTokens 直接 setProperty 到预览区）│
│  [保存为我的主题] [导出 JSON] [导入 JSON] [传图取色]        │
│  已保存主题列表：                                          │
│   • 我的主题A  [应用][编辑][删除]                          │
└──────────────────────────────────────────────────────────┘
```

**实时预览技巧**：不要每次改动都 `setTheme`（会污染全局）。在预览卡片的局部容器上用 `style.setProperty` 铺推导出的 tokens，卡片内放几个原生控件（按钮/输入框/卡片）即可看到真实观感；点「应用」时才 `ctx.theme.register` + `ctx.theme.setTheme`。

---

## 5. 关键代码骨架

### 5.1 `cordis.patch.yml`

```yaml
# 双面临时插件：把客户端入口插进 web 插件名册
- insert:
    - id: ui-skin-diy-theme
      name: 'dsh-diy-theme'
```

### 5.2 `lib/index.js`（Host 半，空实现）

```js
export function apply() {}   // 与官方 ui-* 包同构，真正的逻辑全在 client 半
```

### 5.3 `lib/client.js`（Client 半，精简骨架）

```js
import { deriveTokens } from './derive.js';

export function apply(ctx) {
  const React = ctx.require('react');           // 模块表实体
  const h = ctx.require('react/jsx-runtime').jsx;
  const { ThemeStudio } = ctx.require('./ui.js'); // 本地模块（build.mjs 内联）

  // 1) 注册「我的主题」：从 localStorage 读出用户保存的种子，推导并注册
  ctx.inject(['theme', 'slots'], (theme, slots) => {
    const mine = loadMine();                    // 读 localStorage
    if (mine) {
      theme.register({
        id: 'diy-mine',
        colorScheme: mine.appearance,
        tokens: deriveTokens(mine.seeds)         // 纯字符串表，绝不放 {light,dark}
      });
    }
    // 2) 侧边栏入口 + keyed main 面板（id 必须一致）
    slots.get('sidebar.panellist').set({
      id: 'diy-theme', order: 21,
      label: { zh: '主题工作室', en: 'Theme Studio' },
      icon: ThemeStudioIcon
    });
    slots.get('main').set({ key: 'diy-theme', render: () => h(ThemeStudio, { theme }) });

    // 3) 启动时若上次选定的是 DIY 主题，重新应用（DSH 自身只持久化 system/light/dark）
    if (loadLast() === 'diy-mine') theme.setTheme('diy-mine');
    theme.on('change', () => {/* 同步亮暗到预览 */});
  });
}
```

### 5.4 持久化（localStorage，沿用 dsh-selfskin 约定）

```
dsh-diy-theme:mine      → 用户当前种子 + 推导结果
dsh-diy-theme:last      → 上次应用的主题 id
dsh-diy-theme:library   → 用户保存的多套主题数组
```

> 注意：DSH Host 设置只向浏览器暴露白名单命名空间，第三方命名空间走 `settings-not-exposed`；视觉偏好用 localStorage 是社区共识（KinGao294 同款做法），同源刷新可存活。

---

## 6. 落地点位 & 与 dsh-selfskin 的关系

**推荐：合并进 `dsh-selfskin` 的「皮肤管理」面板**，理由：


- 两者共用 ThemeRuntime 注册、sidebar 骨架、持久化、build 管线；
- 用户心智统一：内置皮肤 + DIY 皮肤在同一个「皮肤管理」里；
- 已有的 67 项测试可直接扩展（`derive.test.mjs` 新增对比度断言）。

若想独立成 `dsh-diy-theme` 也完全可行——把本文 `src/derive.js` + `ThemeStudio` 组件 + 上面骨架复制过去即可，依赖面为零。

---

## 7. 测试与验收（复用并扩展 dsh-selfskin 的 67 项）

| 测试文件                        | 新增内容                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `test/derive.test.mjs`      | ① 4 颗种子 → 令牌表字段齐全；② `ensureContrast` 真能把 label-primary 拉到 ≥4.5:1；③ OKLab 推导在色域外不崩（注入越界色验证兜底）     |
| `test/pure.test.mjs`        | 导入 JSON 解析（含畸形输入）、导出往返一致                                                                         |
| `test/client-harness.mjs`   | vm 沙箱挂载 `ThemeStudio`，断言 `sidebar.panellist`/`main` 注册、点「保存」后 `theme.register` 被调用且 tokens 为纯字符串 |
| `test/validate-package.mjs` | `files` 白名单含 `derive.js`/`ui.js`；`dsh.client.inject` 含 theme 包                                   |

**可证伪原则**（沿用 v1.x）：每个断言都要先注入一个旧缺陷确认它能失败，再修正确认变绿。

---

## 8. 安装与发布

```bash
# 桌面端（注意 -w：每个 profile 是 pnpm workspace 根，裸 add 会被拒）
dsh plugin --profile desktop add -w /path/to/dsh-diy-theme
# 然后重启 dsh（桌面端退出重开），bundle 重新 hash 后生效

# 发布到 npm（DSH 当前没有独立市场，npm 就是分发渠道）
npm publish --registry https://registry.npmjs.org   # 镜像发不到 npmjs
# 用户安装：dsh plugin --profile desktop add -w dsh-diy-theme
```

---

## 9. 风险与边界（必读）

1. **`register` 的 tokens 必须是纯字符串**：放 `{light,dark}` 配对对象 → `body.style` 写 `[object Object]` → 界面空白。这是最高频的坑。
2. **导航 id 必须 == main 的 key**：否则点开面板静默空白（v1.1.0 已踩过）。
3. **`colorScheme` 漏声明**：暗色皮肤忘了写 `dark`，宿主暗色样式不激活，半屏发白。
4. **不要用 CSS 注入路线**（deepseek-style-theme 那种）：不随亮暗切换、DSH 升级即碎。
5. **不要做源码级补丁**（HeiGeAi 那种）：不可分发、要随宿主重新构建。
6. **取色器/图取色只在浏览器本地**：图不出本机，符合隐私预期；但自定义皮肤无法跨设备同步（localStorage 同源）。
7. **`platform` 填 `"web"`**：即使装进 `desktop` profile，这是加载契约，不是产品描述（v1.0 文档已校正）。

---

## 10. 下一步

本方案已可直接开工。若你确认，我可以：

- **(A)** 把 `src/derive.js`（OKLab 推导 + 对比度兜底）+ `ThemeStudio` 组件直接写进现有 `dsh-selfskin` 的「皮肤管理」面板（合并路线，推荐）；或
- **(B)** 从零 scaffold 一个独立 `dsh-diy-theme` 插件仓库。

告诉我选 A 还是 B，以及取色器入口（A 取色器 / B 导入导出 / C 传图取色）要做到哪几个，我就接着实现。
