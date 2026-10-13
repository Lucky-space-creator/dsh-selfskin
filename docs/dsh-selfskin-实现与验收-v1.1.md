# dsh-selfskin 实现说明与验收 v1.1

> 承接 `docs/dsh-skin-方案-v1.0.md`（调研与方案）。本文件记录**决策落地、最终结构、API 契约、
> 实施中修掉的真实缺陷、测试证据与验收方式**。
> 工程目录：`E:\AI_Pro\dsh-skin`　｜　包名：`dsh-selfskin`　｜　目标 profile：`desktop`

---

## 0. 结论先行

| 项 | 状态 |
|---|---|
| 代码 | **已完成并可安装**。Host 半 + Client 半齐备，`lib/` 产物已构建。 |
| 自动化验证 | **56 项断言全绿**（29 纯函数 + 19 装配 + 8 清单）。 |
| 真机观感 | **未验证**。需按 `test/verify.md` 目视确认 —— 自动化测试证明不了"看起来对不对"。 |
| 安装 | 设置 → 插件 → 安装 → 填本地路径 `E:\AI_Pro\dsh-skin`，重启；或 `test/install.ps1`。 |

---

## 1. 五项决策的落地

| 你的决策 | 落地方式 |
|---|---|
| ① 包名改 `dsh-selfskin` | `package.json.name`、patch 行名、模块加载器 id 三处一致（有清单校验守着） |
| ② 支持自定义导入 + 使用现有的 | 选择器分三组：**宿主外观**（`system`/`light`/`dark`）／**内置皮肤**（5 套）／**已导入**；导入为粘贴 JSON，经严格校验后存 localStorage |
| ③ 氛围特效全做 | 极光、光尘、毛玻璃、壁纸四项独立开关、可叠加 |
| ④ 支持本地安装 | 插件管理器认「本地目录路径」；`test/install.ps1` 自动探测 `dsh` CLI |
| ⑤ 涟漪可配置 | 设置行开关，默认**关**；Host `Config` 未使用（避免 schemastery 依赖风险），默认值走 localStorage |

---

## 2. 最终结构

```
E:\AI_Pro\dsh-skin\
├─ package.json              # dsh.bundle.patch + dsh.client；icon / exports / files
├─ cordis.patch.yml          # - insert: [{ id: selfskin, name: dsh-selfskin }]
├─ build.mjs                 # 零依赖构建：src -> lib（内联 pure/client/ui + 7 份 CSS）
├─ src\
│   ├─ index.js              # Host 半：空 apply（只让 loader 行可解析）
│   ├─ pure.js               # 纯函数（可单测；构建时剥离 export 内联）
│   ├─ client.js             # 浏览器半：store / 皮肤注册 / 特效合成 / 涟漪委托 / 插槽
│   ├─ ui.js                 # React 组件：SkinRow / ButtonsRow / AmbienceRow / ParticleField / RippleLayer
│   ├─ skins.js              # 内置 5 套皮肤 + 宿主外观项 + DEFAULT_SKIN_ID
│   └─ effects\              # 样式真源，一个开关一个文件
│       ├─ ui.css                    # 插件自有 UI（始终注入）
│       ├─ buttons.base.css          # 过渡与焦点环（始终注入）
│       ├─ buttons.lift.css          # 抬升与辉光        ← 开关 buttons.lift
│       ├─ buttons.shimmer.css       # 流光              ← 开关 buttons.shimmer
│       ├─ buttons.ripple.css        # 涟漪              ← 开关 buttons.ripple
│       ├─ ambience.aurora.css       # 极光（含占位符）   ← 开关 ambience.aurora
│       └─ ambience.wallpaper.css    # 壁纸（含占位符）   ← 开关 ambience.wallpaper
├─ lib\                      # 构建产物（index.js / client.js）
├─ locale\ zh.json en.json   # 插件卡片标题与描述
├─ icon.svg
├─ docs\                     # v1.0 方案 + 本文件
├─ test\
│   ├─ pure.test.mjs         # 29 项纯函数单测
│   ├─ client-harness.mjs    # 19 项装配集成测试（vm 沙箱加载真实产物）
│   ├─ validate-package.mjs  # 8 项清单完整性校验
│   ├─ install.ps1           # 本地安装助手（ASCII-only，规避 PS 5.1 编码坑）
│   └─ verify.md             # 真机验收清单
├─ README.md · CHANGELOG.md · LICENSE(MIT) · .gitignore
```

---

## 3. 宿主 API 契约（实施中实测确认，写错会静默失效）

| API | 形状 | 说明 |
|---|---|---|
| `ctx.theme.register({ id, colorScheme, tokens })` | `tokens` 是**纯字符串** | 已按该皮肤的 `colorScheme` 解析。`ThemeRuntime.composeActive()` 直接 `{...active.tokens}` 铺开，成对值会以 `[object Object]` 落到 `<body>` |
| `ctx.theme.overrideTokens(source, tokens)` | `tokens` 是 **`{ light, dark }` 成对值** | `composeActive` 用 `modes[active.colorScheme]` 解析；传裸字符串会抛"teaching error" |
| `ctx.theme.setTheme(id)` | 只接受**已注册 id** 或 `system` | 其它值抛错 |
| `ctx.theme.getTheme()` | 返回不可变快照，含 `preference` | 用来判断"宿主是否已经切走" |
| `ctx.on('theme/change', …)` | 事件 | 宿主改外观时同步回本地状态 |
| `ctx.slots.register({ name, id, order }, Component)` | 需经 `ctx.slots.inject(key, () => …)` | `settings.general.item` 的行组件**无需** `store`/`locale`/`inject` 选项即可渲染 |

**关键环境事实**（决定实现方式）：

- `shell.overlay` 容器是 `.overlayLayer{z-index:20;position:absolute}`，且规则
  `.overlayLayer>*{pointer-events:auto}` —— 即**该插槽内的元素恒在内容之上**，且子元素默认可交互。
  因此：氛围底色只能挂 `body` 伪元素；插件自有图层必须显式 `pointer-events:none`。
- 令牌最终以**行内自定义属性**写到 `<body>`（`ThemePresenter.apply`），所以令牌级换肤优先级足够。
- 第三方主题 id 是**进程内扩展**，宿主只持久化 `system/light/dark` —— 偏好必须自管（localStorage）。

---

## 4. 实施中修掉的真实缺陷（测试驱动）

这两个都不是"感觉不对"，是测试跑出来的确定性缺陷：

| # | 缺陷 | 后果 | 修复 | 守它的测试 |
|---|---|---|---|---|
| 1 | `fillTemplate` 占位符正则 `[A-Z_]+` **不含数字** | `{{AURORA_1/2/3}}` 永不替换 → 极光块的 gradient 成为**非法 CSS，整层静默失效**，无任何报错 | 改为 `[A-Z0-9_]+` | `fillTemplate substitutes keys that contain digits` + 装配测试断言"样式表里不得残留 `{{`" |
| 2 | `DEFAULT_SKIN_ID = 'default'` **不是已注册主题 id** | 用户选「默认」→ `setTheme('default')` 抛错 → 被恢复分支吞掉 → **无法回到宿主外观，旧皮肤一直留着** | 改用宿主真实偏好 id，并把 `system`/`light`/`dark` 提升为选择器一等选项 | `every picker id the catalog can produce is a valid theme id` |

另修：皮肤注册改为 `Set` 去重，不再依赖"抛错被吞"作为幂等手段（原先每次 apply 会为 5 套皮肤各抛 1 次异常）。

---

## 5. 测试证据

```
node build.mjs              -> built dsh-selfskin (7 stylesheets, 5 built-in skins)
node --check lib/*.js       -> SYNTAX OK
node test/validate-package.mjs  -> 8 passed, 0 failed
node test/pure.test.mjs         -> 29 passed, 0 failed
node test/client-harness.mjs    -> 19 passed, 0 failed
```

装配测试在 `vm` 沙箱里加载**真实产物** `lib/client.js`，用桩 window/document/React 跑
`apply(mockCtx)`，断言的内容包括：

- 5 套内置皮肤按官方契约注册，且令牌值确为**纯字符串**（形状断言）；
- 保存的皮肤被推给主题服务，且**重入守卫生效**（不循环）；
- 恰好 2 个令牌覆盖层，且值确为 `{light,dark}` 成对（形状断言）；
- 3 个设置行 + 2 个覆盖层插槽被正确占用；
- 样式表随开关增删块：关时**不含** `dsh-selfskin-sheen` / `dss-ripple-out` / `dsh-selfskin-aurora` / `body::before`；
- 贴入含双引号的网址被转义进 `url("…")`；
- 极光色确实取自当前皮肤强调色；
- 一次 `pointerdown` 恰好入队 1 个涟漪，右键不入队，且涟漪带 `clip-path`（贴合按钮圆角）；
- 宿主切走外观时状态被镜像且**不回声**。

### 测试**未**覆盖（必须真机确认）

观感、布局遮挡、明暗双模式对比度、性能、`shell.overlay` 图层在实际页面里的叠放观感、
本地图片选择器的真实行为。→ 见 `test/verify.md`。

---

## 6. 安装与回退

> **本节命令已被 v1.2 修正。** 原先写的裸路径形式会走到 pnpm 的 `link:` 协议，在跨盘符
> 的默认 Windows 上**静默不落地**（打印成功、写进清单、`node_modules/` 里什么都没有），
> 随后装配阶段以 `cannot resolve profile bundle` 崩掉。原因、证据与最终命令见
> `docs/dsh-selfskin-安装实测-v1.2.md`。

```powershell
# 安装（二选一）
#   A) 左侧栏「插件」页 -> 安装 -> 填 file:E:/AI_Pro/dsh-skin -> 重启
#   B) 命令行（先退出应用）
dsh plugin --profile desktop add -w file:E:/AI_Pro/dsh-skin

# 或者：跑 test/install.ps1，它会自己找出 CLI 与正确 specifier
powershell -ExecutionPolicy Bypass -File test\install.ps1

# 卸载
dsh plugin --profile desktop remove dsh-selfskin
```

`file:` 前缀与 `-w` 都**不能省略**：前者避开 `link:` 跨盘符号链接，后者避开
`ERR_PNPM_ADDING_TO_ROOT`（profile 目录带 `pnpm-workspace.yaml`）。

装完**必须重启**（插件集变更需重启；改 bundle 内容亦然）。安装是拷贝而非活链接，
改过 `src/` 后需 `node build.mjs` 并用 `install.ps1 -Refresh`（= remove + add）替换，
**只重跑一次普通安装会被 pnpm 以 "Already up to date" 短路掉**。
偏好残留可手动清：`localStorage.removeItem('dsh-selfskin:state:v1')`。

---

## 7. 剩余风险（明确列出）

| 风险 | 影响 | 现状/对策 |
|---|---|---|
| 观感未验证 | 可能出现过透、辉光过强、光尘干扰阅读 | 已按令牌取色、光尘低透明度（α≈0.08–0.30）、涟漪/流光受 `prefers-reduced-motion` 约束；待真机确认 |
| 涟漪依赖 `getComputedStyle` 的 `borderRadius` | 极少数控件圆角表达异常时，clip 圆角不精确 | 已做空值回退（`8px`）与 insets 夹紧；不触碰宿主元素 |
| 全局按钮选择器 | 可能给某些特殊控件加上非预期过渡 | 全部 `:where()` 零特异性，宿主声明一律胜出 |
| 壁纸需画布半透明 | 打开壁纸会同时降低画布/侧栏不透明度 | 只降 `bg-base` 与侧栏，`bg-layer-1..4` 保持不透明以保可读性 |
| 宿主版本演进 | 令牌被重命名会让个别表面观感降级 | 只改 `--dsw-*` 令牌，不用行内元素样式，降级不崩 |
| 不用 `backdrop-filter` | "毛玻璃"不是真模糊 | 宿主表面类名是构建生成的哈希名，无法稳定选中；模糊正文反而伤可读性。此为有意取舍，已在 README 说明 |
| 第三方设置命名空间不暴露 | 偏好无法走宿主设置同步 | 统一 localStorage，与宿主对浏览器偏好的处理一致 |

---

## 8. 后续可做（未做，等你定）

1. 真机验收后按 `verify.md` 调参（不透明度默认值、辉光强度、光尘密度）。
2. 皮肤缩略图预览（当前是 3 色色块 chip，非真实截图）。
3. 皮肤 JSON 的导出（当前只能导入）。
4. 若确认要发布：`npm publish --registry https://registry.npmjs.org`（本机默认 registry 是镜像，
   发到镜像等于没发到 npmjs）。

---

*文档版本 v1.1 ｜ 2026-10-13 ｜ 依据：本机 DSH 0.2.0-rc.2 实测 + 官方内置 `cordis-plugin-development` 技能包 + 56 项自动化断言*
