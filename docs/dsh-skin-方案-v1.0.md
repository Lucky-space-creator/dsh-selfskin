# dsh-skin 皮肤插件 · 技术方案 v1.0

> 目标：为 DeepSeek Harness 桌面版（DSH）开发一个皮肤插件，提供**皮肤特效**（主题换肤 + 氛围视觉）与**按钮特效**（悬停/按下/涟漪/流光）。
> 插件工程目录：`E:\AI_Pro\dsh-skin`　｜　目标应用：`E:\AI\dsh\DeepSeek Harness.exe`

---

## 0. 结论先行（TL;DR）

| 项 | 结论 |
|---|---|
| 可行性 | **可行，且是官方支持路径**。DSH 内置 Cordis 插件机制，皮肤 = 「注册主题 + 令牌覆盖 + 插槽 UI + 插件自有样式注入」的组合。 |
| 插件形态 | **单包双面（dual-face）**：Host 半 `lib/index.js` + Client 半 `lib/client.js`；`package.json` 声明 `dsh.bundle.patch` 与 `dsh.client`。 |
| 本机 profile | **`desktop`**（不是 `web`）。目录 `C:\Users\LENOVO\.dsh\profiles\desktop`。 |
| 安装命令 | `dsh plugin --profile desktop add -w E:\AI_Pro\dsh-skin`，**装完需重启应用**。 |
| 最高风险 | ① 严禁替换 app root / 向 `document.body` 追加节点；② 包名 `dsh-skin` 与 GitHub 现有仓库撞名，需改唯一名。 |

---

## 1. 环境勘察结论（实测证据）

| 路径 | 说明 |
|---|---|
| `E:\AI\dsh\DeepSeek Harness.exe` | Electron 桌面壳，产品版本 44.0.0 |
| `E:\AI\dsh\resources\app.asar` | 主包（121 MB），内含 `dsh/node_modules/@deepseek-ai/*` 全部运行时 |
| `E:\AI\dsh\resources\app.asar.unpacked\dsh\package.json` | `@deepseek-ai/dsh-desktop@0.2.0-rc.2`（Electron 外壳） |
| `C:\Users\LENOVO\.dsh\profiles\desktop` | **当前生效的 profile**（`cordis.yml` + `cordis.patch.yml` + `package.json`） |
| `…\profiles\desktop\.plugin-manager\logs` | 插件管理器日志（本机已在用插件安装功能） |
| `…\profiles\node_modules\@deepseek-ai\` | 197 个官方包（`dsh-client-ui-theme`、`dsh-client-modules`、`dsh-settings` 等） |
| `C:\Users\LENOVO\AppData\Roaming\@deepseek-ai\dsh-desktop` | Electron 用户数据（localStorage / Cache / logs） |

**本机已装第三方插件（现成参照物）** —— 见 `profiles\desktop\package.json`：

| 包名 | 来源 | 价值 |
|---|---|---|
| `dsh-boot-animation` | `github:lxj5820/dsh-boot-animation` | **双面可视化插件完整样本**：Host 注册 `webServer` 路由 + 注入 head 脚本，Client 注册设置卡片。是本次开发最贴近的本地范本。 |
| `dsh-our-free-model` | `github:Ebony-Vinyl/dsh-our-free-model` | 纯 Host 插件样本 |

---

## 2. DSH 插件机制（官方权威来源，非猜测）

应用**内置了官方插件开发技能包**，路径（在 app.asar 内）：

```
app.asar/dsh/node_modules/@deepseek-ai/dsh-agent-preset/skills/cordis-plugin-development/
├─ SKILL.md                       # 总纲：安装流程 install_bundle / 验收标准
├─ references/
│   ├─ host-plugin.md             # Bundle 清单、Host 导出形式、Config、安装语义
│   ├─ ui-plugin.md               # Client 清单、模块加载器、插槽注册
│   ├─ practices.md               # 扩展点选择、性能、UI 规则（含禁用项）
│   ├─ mcp-bundle.md / verification.md / user-actions.md
└─ templates/decoration/          # UI 插件起点：package.json + cordis.patch.yml + index.js + client.js
```

### 2.1 双面插件结构（核心）

| 半边 | 文件 | 职责 | 声明 |
|---|---|---|---|
| Host | `lib/index.js` | 导出 `apply(ctx, config)`；注册 `ctx.effect`/`ctx.on` 资源（如 HTTP 路由、index 注入、Config 设置项） | `package.json` → `dsh.bundle.patch` 指向 `cordis.patch.yml` |
| Client | `lib/client.js` | 浏览器 bundle，注册主题、注入样式、挂载插槽 UI | `package.json` → `dsh.client = { platform:"web", immediately:true, inject:[...] }` |

`cordis.patch.yml`（向 loader 插入一行）：

```yaml
- insert:
    - id: dsh-skin          # 该 id 同时是设置命名空间契约，改名会孤儿化设置卡片
      name: 'dsh-skin'
```

### 2.2 主题运行时 API（皮肤的技术核心）

来源：`@deepseek-ai/dsh-client-ui-theme/lib/client.js` 的 `ThemeRuntime` 类。

| API | 签名 | 用途 |
|---|---|---|
| `ctx.theme.register(definition)` | `{ id, colorScheme:'light'\|'dark', tokens }` → disposer | **注册一套皮肤**（幂等 id，重复抛错；id 不能为 `system`） |
| `ctx.theme.setTheme(id)` | 切换激活主题 | 应用皮肤；未知 id 抛错 |
| `ctx.theme.overrideTokens(source, tokens)` | `tokens: { "--dsw-xxx": { light, dark } }` → disposer | **叠加令牌覆盖层**（不改注册表，按 source 单层替换、后注册者优先）——壁纸/特效的"半透明化"就靠它 |
| `ctx.theme.getTheme()` | → 不可变快照 | 读取当前主题 |
| `ctx.on('theme/change', …)` | 事件 | 皮肤/明暗切换时重新着色 |

> 关键机制：`setTheme` 只会把 `system/light/dark` 写入宿主设置；**第三方皮肤 id 是「进程内扩展」，不跨设置 schema**——所以自定义皮肤的持久化必须由插件自己负责（参考实现统一用 `localStorage`）。

### 2.3 设计令牌体系 `--dsw-*`

实测前端 CSS（`dsh-web-frontend`）共 **95 个** `--dsw-*` 令牌，其中 `--dsw-alias-*` 是别名层，即换肤的**唯一合法注入面**：

| 分组（示例令牌） | 用途 |
|---|---|
| `--dsw-alias-bg-base / bg-layer-1..4 / bg-mask-1 / bg-module-platform` | 画布 / 面板 / 遮罩底色 |
| `--dsw-alias-brand-primary` | 品牌主色 |
| `--dsw-alias-button-primary-fill / button-primary-hover` | **主按钮**（按钮特效目标） |
| `--dsw-alias-button-ghost-active-fill / -active-border` | 幽灵按钮激活态 |
| `--dsw-alias-button-tool-bar-fill / button-tool-bar-hover` | 工具栏按钮 |
| `--dsw-alias-interactive-bg-hover / interactive-bg-active` | 通用交互悬停/激活 |
| `--dsw-alias-label-primary / -secondary / -tertiary / -caption / -dimmed` | 文字层级 |
| `--dsw-alias-border-l1..l4` | 描边层级 |
| `--dsw-alias-state-success/warn/error/business/idle-primary` | 语义状态色 |
| `--dsw-alias-markdown-* / -scrollbar-* / -toast-* / -tooltip-*` | 局部组件 |
| `--dsw-specific-input-major / --dsw-specific-menu`（+ 参考实现称 `--dsw-specific-sidebar-fill`） | 局部特异令牌 |

> 规则（官方 `practices.md`）：**样式只允许引用 `--dsw-alias-*` 令牌**；字面色仅限美术素材。令牌被重命名只会导致观感降级，不会让组件崩掉。

### 2.4 Client bundle 格式与插槽

Client 产物必须是指定的模块加载器格式（React 来自浏览器模块表，**无需二次安装/无需 CDN**）：

```js
window.__ModuleLoader__.load({
  id: 'dsh-skin',
  factory(require) {
    const React = require('react');
    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('shell.overlay', () => ctx.slots.register(
          { name: 'shell.overlay', id: 'dsh-skin-backdrop', order: 5 }, Backdrop));
      },
    };
  },
});
```

| 关注点 | 可用插槽 / 服务 |
|---|---|
| 氛围背景层（粒子/壁纸/渐变） | `shell.overlay`（需叠加层且位置明确时用） |
| 输入区装饰 | `conversation.composer.dock`（默认优选：有预留空间） |
| 设置行（皮肤选择器） | `settings.general.item`（与官方「外观」行同区） |
| 插件设置卡片 | `plugins.item` |
| 会话内行 | `conversation.chat.node`（需配 `ctx.uiConversation.events.register`） |

---

## 3. GitHub 同类实现盘点（可借鉴方案）

| 仓库 | 做法 | 借鉴点 |
|---|---|---|
| `KinGao294/dsh-skin` | Host `lib/index.js` + Client `lib/client.js`；`ctx.theme.register` 注册 7 套皮肤；`overrideTokens` 让主画布/侧栏半透明显示壁纸；壁纸为 `z-index:-1` 固定层；设置行挂进 `settings.general.item`；`localStorage` 持久化 | **架构与本次需求最接近**——皮肤 + 壁纸 + 半透明化 + 设置行完整链路 |
| `Danieltoraji/dsh-skin-kamisato` | 真源 `lib/skin.css` → `build-client.ps1` 构建出内联 CSS 的 `lib/client.js`；Host 注册 `/skin-fonts` 路由伺服本机字体 | **CSS 真源 + 构建产物分离**的工程化写法；Host 路由模式 |
| `Lichtspur/deepseek-style-theme` | 纯前端皮肤：CSS 变量 + 粒子画布 + 玻璃卡片 + DOM 补丁 + RPC 通道；卸载时一次性回收 | **氛围特效（粒子/毛玻璃）与卸载清理**的参考 |
| `laoduu/...-yizi-themes` | 19 套主题全部基于 `--dsw-alias-*` 令牌，跟随明暗模式 | **多主题令牌表**的组织方式 |

> 三者共同的工程结论：**不要改 `dsh-web-frontend/dist`**（前端一升级即被覆盖）；应做成插件装进 profile 依赖层——升级不丢、可装卸、可分享。

---

## 4. 方案设计

### 4.1 功能范围

**A. 皮肤特效**
1. **主题换肤**：3–5 套令牌级皮肤（深色×2 / 浅色×2 / 高对比×1），经 `ctx.theme.register` 注册，跟随明暗模式。
2. **氛围层**：可选「极光渐变 / 星点粒子 / 噪点纸感」三种氛围，渲染在 `shell.overlay` 的固定层（`pointer-events:none`）。
3. **玻璃拟态**：`overrideTokens` 把主画布与侧栏令牌改为半透明，配合毛玻璃；内层卡片/输入框保持不透明以保证可读性。
4. **壁纸（可选项）**：本地图片/URL，含透明度、模糊、铺贴方式。

**B. 按钮特效**
1. **主按钮**：渐变流光（`background-size` 循环动画）+ 悬停抬升与辉光阴影。
2. **通用按钮**：悬停底色过渡、按下 `scale(0.97)` 回弹。
3. **点击涟漪（ripple）**：全局事件委托 `pointerdown`，在**按钮自身**注入涟漪 span 动画——不读取其他插件的 DOM/样式。
4. **工具栏/幽灵按钮**：仅做令牌级配色与描边过渡。

### 4.2 架构设计

```
                  ┌──────────────── Host 半 (applied at profile load) ────────────────┐
cordis.patch.yml →│ lib/index.js  ctx.effect(样式路由/资源) · Config(可调项) · 无 UI 渲染 │
                  └──────────────────────────────┬───────────────────────────────────┘
                                                 │ dsh.client → /plugins/dsh-skin/client.js
                  ┌──────────────── Client 半 (browser) ──────────────────────────────┐
                  │ lib/client.js                                                     │
                  │  ├ ctx.effect(注入插件自有全局样式)                                 │
                  │  ├ ctx.theme.register(每套皮肤) / overrideTokens(氛围令牌层)         │
                  │  ├ ctx.slots.register('shell.overlay', Backdrop)   ← 氛围层         │
                  │  ├ ctx.slots.register('settings.general.item', SkinRow) ← 设置行    │
                  │  └ ctx.on(pointerdown 委托) → 涟漪                                  │
                  └───────────────────────────────────────────────────────────────────┘
```

### 4.3 目录结构（对齐你已建的文件夹）

```
E:\AI_Pro\dsh-skin\
├─ package.json                 # name/version/type/exports/dsh{bundle,client}/icon/meta/files
├─ cordis.patch.yml             # - insert: [{ id: dsh-skin, name: dsh-skin }]
├─ src\                         # ★ 源码（可读真源，唯一维护面）
│   ├─ index.js                 #   Host 半
│   ├─ client.js                #   Client 半（被构建/或直接产出到 lib）
│   ├─ skins\                   #   每套皮肤 = 一份令牌表（*.js）
│   │   ├─ ocean.js / graphite.js / sakura.js …
│   ├─ effects\                 #   特效样式真源
│   │   ├─ buttons.css          #     按钮悬停/按下/涟漪/流光
│   │   └─ ambience.css         #     极光/粒子容器/毛玻璃
│   └─ ui\                      #   设置行与氛围层的 React 组件
│       ├─ SkinRow.js
│       └─ Backdrop.js
├─ lib\                         # ☆ 构建产物（index.js / client.js，插件实际加载这里）
├─ docs\                        # ★ 方案与机制文档（本文件所在）
├─ test\                        # ★ 验证脚本 / 手动验收清单
├─ locale\ en.json zh.json      # 插件卡片标题与描述（Plugin Manager 读取）
├─ icon.svg                     # 插件图标（≤256 KiB）
└─ README.md · LICENSE(MIT) · CHANGELOG.md
```

### 4.4 特效 ↔ 令牌映射表

| 特效 | 实现手段 | 命中令牌 |
|---|---|---|
| 皮肤主色板 | `register` 的 `tokens` 全量别名覆盖 | `--dsw-alias-bg-*` / `brand-primary` / `label-*` / `border-l*` |
| 玻璃拟态 | `overrideTokens` 覆盖底色为半透明 | `--dsw-alias-bg-base`、侧栏 `--dsw-specific-sidebar-fill` |
| 主按钮流光 | 插件自有 CSS 动画 | 语法基于 `--dsw-alias-button-primary-fill` / `-hover` |
| 悬停/按下 | 插件自有 CSS（`:hover` / `:active`） | `--dsw-alias-interactive-bg-hover` / `-active` |
| 点击涟漪 | `pointerdown` 委托 → 目标按钮内注入 span | 不依赖令牌；颜色取品牌主色令牌 |
| 极光/粒子 | React 组件挂 `shell.overlay` + 插件自有 canvas 样式 | 颜色取 `--dsw-alias-brand-primary` |
| 壁纸 | 同上固定层 + `overrideTokens` 半透明化 | `--dsw-alias-bg-base` |

---

## 5. 实施步骤（分阶段，每阶段可独立验收）

| 阶段 | 交付 | 验收标准 |
|---|---|---|
| **P1 骨架跑通** | 复制官方 `templates/decoration` 四文件 → 本地包装配 → 安装 | 重启后 `conversation.composer.dock` 出现装饰圆点；`install_bundle` 返回 `application: applied` |
| **P2 主题换肤** | 3 套皮肤 + `settings.general.item` 设置行 + `localStorage` 持久化 | 设置区出现「皮肤」行；切换立即生效；刷新后保持 |
| **P3 按钮特效** | `effects/buttons.css` + 涟漪委托 | 主按钮流光 / 悬停辉光 / 按下回弹 / 点击涟漪均生效；卸载后无残留监听 |
| **P4 氛围特效** | `Backdrop` 组件（极光/粒子）+ 玻璃拟态 + 可选壁纸 | 氛围层不遮蔽交互（`pointer-events:none`）；明暗切换下均正常着色 |
| **P5 打磨** | 多语言、图标、`README`、打包（npm/GitHub 二选一） | 明暗双主题下与宿主页面观感一致；控制台无 `slot entry crashed` |

---

## 6. 安装与验证流程

```bash
# 1) 安装（绝对路径；-w 必需——profile 内含 pnpm-workspace.yaml，pnpm 会拒绝裸 add）
dsh plugin --profile desktop add -w E:\AI_Pro\dsh-skin

# 2) 重启应用（插件集变更必须重启；改 bundle 内容亦需重启重新扫描）
```

验证清单：
1. 安装结果以 `application` / `warnings` 字段为准，**不看日志/进程**；
2. `cordis_inspect_query` 确认新行已挂载（无需审批，比翻 `list_plugins` 更快）；
3. 硬刷新（Ctrl+F5）后目视确认；缺失时检查是否命中「第三方设置命名空间不暴露」的边界（→ 改用 `localStorage`）；
4. 明暗双模式下分别比对宿主同类页面，确认只用令牌着色。

---

## 7. 风险与边界

| 风险 | 影响 | 对策 |
|---|---|---|
| 替换 app root / 向 `document.body` 追加节点 | 违反官方硬规则，可能整页崩 | 所有 UI 走插槽（`shell.overlay` 等）渲染为 React 组件 |
| `require('@deepseek-ai/dsh-client-ui-primitives')` 等客户端包 | 官方包随时变；组件抛错会空白该插槽 | **禁止**引入；自写控件并复制宿主外观，只保留 `--dsw-alias-*` 依赖 |
| 使用字面色而非令牌 | 明暗切换/升级后观感割裂 | 令牌优先，字面色仅用于美术素材 |
| 第三方设置命名空间不通（`settings-not-exposed`） | 设置无法落盘 | 皮肤/特效偏好统一走 `localStorage`，与官方边界一致 |
| 包名 `dsh-skin` 与 GitHub `KinGao294/dsh-skin` 撞名 | 安装/发布冲突、上游更新覆盖 | **改用唯一名**（建议 `@<你的scope>/dsh-skin-effects`），行 id 与之解耦 |
| 改 `dist` 求免重启 | 前端升级即被覆盖 | 不做；坚持插件化（升级不丢、可装卸） |
| 直接改 profile 的 `package.json`/`cordis.patch.yml` | 每次手写都需单独审批，易损坏 | 一律走 `install_bundle`（或 `dsh plugin add`），由工具落盘 |
| Windows PowerShell 读 BOM-less UTF-8 | 构建脚本中文乱码 | 涉及 `.ps1` 时保存为 **UTF-8 with BOM** |

---

## 8. 待确认项

1. **插件包名**：沿用 `dsh-skin`（有撞名风险）还是改唯一作用域名？（建议后者）
2. **皮肤数量与风格**：先做几套？是否需要你提供品牌色/参考图？
3. **氛围特效优先级**：极光渐变 / 星点粒子 / 毛玻璃 / 壁纸——是否全做，还是先做 1–2 种？
4. **分发方式**：本地目录安装即可，还是需要发布 npm / GitHub 供他人安装？
5. **按钮特效尺度**：是否接受全局涟漪（对所有按钮生效），还是仅限主按钮与工具栏？

---

*文档版本：v1.0 ｜ 建立于 2026-10-13 ｜ 依据：本机 DSH 0.2.0-rc.2 实测 + 官方内置插件开发技能包 + GitHub 同类实现*
