# dsh-selfskin

DeepSeek Harness 桌面端的**皮肤与特效**插件：换肤、自定义导入、氛围特效，以及可开关的按钮特效。

- **皮肤** — 5 套内置令牌皮肤，外加宿主自带的「跟随系统 / 亮色 / 暗色」；支持粘贴 JSON 导入自己的皮肤。
- **按钮特效** — 悬停抬升与辉光、主按钮流光、点击涟漪（可随时关闭）。
- **氛围特效** — 极光、光尘、毛玻璃、壁纸，四者独立开关、可叠加。

不改动 DSH 本体、不替换页面根节点、不向 `document.body` 追加节点、不写宿主元素的样式。

---

## 安装

> **specifier 必须带 `file:` 前缀**，这是本机实测踩出来的坑，不是保守写法。
>
> 给 pnpm 一个**裸的本地目录路径**（`E:\AI_Pro\dsh-skin`），pnpm 会把它解析成
> **`link:` 协议**，也就是"创建一个指向源目录的目录符号链接"。跨盘符（`E:` → `C:`）创建
> 目录符号链接在默认 Windows 上需要特权，而 pnpm **不会把失败暴露出来**：它照样打印
> `+ dsh-selfskin link:...`，照样把依赖写进 `package.json` 和 `pnpm-lock.yaml`，
> 然后 `node_modules/` 里空空如也。紧接着 `dsh plugin` 的装配步骤就会以
>
> ```
> cannot resolve profile bundle "dsh-selfskin" from the dsh installation or
> C:\Users\<you>\.dsh\profiles\desktop
> ```
>
> 崩掉 —— 一路看下来像是插件写错了，其实只是链接没建出来。
>
> `file:` 协议改为把整包**硬链接进** `node_modules`，不需要任何特权。

### 方式一：命令行（推荐）

```powershell
dsh plugin --profile desktop add -w file:E:/AI_Pro/dsh-skin
```

需要 **`-w`**：profile 目录里有一个 `pnpm-workspace.yaml`，pnpm 会把该目录当成 workspace 根，
裸 `add` 会以 `ERR_PNPM_ADDING_TO_ROOT` 失败。

需要 **`file:`**：见上方说明。路径用正斜杠，写进 `pnpm-lock.yaml` 的也是这个形式。

profile 名是 **`desktop`**，不是 `web` —— 桌面版用的是 `desktop` profile。

**先退出应用再执行**：启动期间 profile 清单被锁住，包操作会等那把锁（最多 120 秒）。

#### 更省事的做法：跑 `test/install.ps1`

```powershell
powershell -ExecutionPolicy Bypass -File test\install.ps1
```

它会自己把 CLI 找出来 —— 桌面版把 CLI 打包在应用内部
（`<安装目录>\resources\runtime\cli\bin\dsh.cmd`）并且**默认不写进 PATH**，所以
`Get-Command dsh` 通常是找不到的；脚本改为解析开始菜单／桌面快捷方式，从它指向的
应用目录推出 CLI 位置。找不到时会告诉你该传 `-DshPath` 还是走方式二。

### 方式二：桌面版插件管理器（无需终端）

1. 打开左侧栏的 **插件** 页（设置里的插件列表是只读的，装插件不在那里）；
2. 在安装输入框里填**带 `file:` 前缀的绝对路径**：

   ```
   file:E:/AI_Pro/dsh-skin
   ```

   该输入框接受「包名 / GitHub 仓库地址 / 本地目录路径」三种形式。`file:` 前缀会被
   正确地识别为本地路径（插件管理器自己会剥掉前缀再校验剩下的部分是不是绝对路径）；
   **裸路径在这里同样会踩上面那个 `link:` 的坑**；
3. **重启应用**（插件集变更必须重启才生效）。

### 装完之后

重启后，**左侧边栏**会多出一行「皮肤管理」（带调色板图标，在宿主「插件」「任务」之后）。
点它就是插件的全部界面：皮肤与壁纸、按钮特效、氛围特效。通用设置里**不再**出现任何本插件的行。

> 这个入口是 1.1.0 加的。在那之前插件是嵌在「设置 → 常规」里的三行；现在的做法是注册
> `sidebar.panellist` 导航项 + `main` 面板，两者用同一个 id 关联（细节见
> `docs/dsh-selfskin-侧边栏面板-v1.6.md`）。

### 改过源码之后怎么更新（有个坑）

安装产物是**拷贝**（`file:` 会硬链接进 `node_modules`），不是活链接。所以 `src/` 里的改动
要重新构建 + 重装才会进 profile：

```powershell
node build.mjs
powershell -ExecutionPolicy Bypass -File test\install.ps1 -Refresh
```

**别只是重跑一次安装。** pnpm 比较的是 specifier 字符串，它没变，于是 pnpm 直接
"Already up to date" 短路返回，profile 里留着的还是**旧那份拷贝** —— 看起来安装成功了，
实际什么都没换。`--force` 也不管用。只有先 `remove` 再 `add` 才会真正替换；
`-Refresh` 做的就是这件事。等价的手写形式：

```powershell
dsh plugin --profile desktop remove dsh-selfskin
dsh plugin --profile desktop add -w file:E:/AI_Pro/dsh-skin
```

---

## 卸载

```powershell
dsh plugin --profile desktop remove dsh-selfskin
```

再重启一次。移除后注入的样式表、令牌覆盖层、插槽注册与事件监听会一并回收；`localStorage`
里的偏好记录（`dsh-selfskin:state:v1`）会残留，如需彻底清理可在浏览器控制台执行
`localStorage.removeItem('dsh-selfskin:state:v1')`。

---

## 皮肤

### 内置

| id | 方案 | 说明 |
|---|---|---|
| `selfskin-ocean` | dark | 深海蓝 |
| `selfskin-graphite` | dark | 中性石墨 |
| `selfskin-midnight` | dark | 纯黑 OLED，紫罗兰点缀 |
| `selfskin-sakura` | light | 樱花粉 |
| `selfskin-paper` | light | 暖纸 |

另有三项宿主外观：`system`（跟随系统）、`light`、`dark`。

### 自定义导入

在「皮肤」行点 **导入…**，粘贴如下 JSON：

```json
{
  "name": "我的皮肤",
  "colorScheme": "dark",
  "tokens": {
    "--dsw-alias-brand-primary": "#ff6b6b",
    "--dsw-alias-bg-base": "#101418",
    "--dsw-alias-label-primary": "#f2f5fa"
  }
}
```

规则：

- `colorScheme` 必须是 `"light"` 或 `"dark"`，必填。它决定宿主用哪套明暗样式表。
- `tokens` 的键必须以 `--dsw-` 开头，值必须是非空字符串。**违反会被拒绝并指出是哪个键** ——
  令牌最终会被写到 `<body>` 的行内样式上，放任任意键名会污染无关表面。
- 导入的皮肤存在浏览器里，最多 20 套；同一份文档重复导入会被识别为重复。

**可覆盖的令牌**（换肤只需这几组，不要动 `--dsw-` 之外的属性）：

| 分组 | 令牌 |
|---|---|
| 画布与层级 | `--dsw-alias-bg-base`、`--dsw-alias-bg-layer-1..4`、`--dsw-alias-bg-mask-1` |
| 品牌与文字 | `--dsw-alias-brand-primary`、`--dsw-alias-label-primary/-secondary/-tertiary/-caption` |
| 描边 | `--dsw-alias-border-l1..l4` |
| 按钮 | `--dsw-alias-button-primary-fill/-hover`、`-ghost-active-fill/-border`、`-tool-bar-fill/-hover` |
| 交互 | `--dsw-alias-interactive-bg-hover/-active` |
| 局部 | `--dsw-specific-sidebar-fill`、`--dsw-specific-input-major`、`--dsw-specific-menu` |

---

## 氛围特效

| 特效 | 实现位置 | 说明 |
|---|---|---|
| 极光 | `body::after`（内容之下） | 由当前皮肤强调色着色的动态渐变，换肤即换色 |
| 光尘 | `shell.overlay`（内容之上） | 低透明度浮尘粒子，`pointer-events: none`，不挡点击 |
| 毛玻璃 | 令牌覆盖层 | 画布 / 侧栏 / 前两层表面半透明，文字表面保持不透明 |
| 壁纸 | `body::before`（内容之下） | 本地图片或图片网址；不透明度、模糊、四种铺贴方式 |

壁纸需要画布透明才能看见，因此打开壁纸会同时降低 `--dsw-alias-bg-base` 与侧栏的不透明度；
卡片、气泡、输入框用自己的不透明令牌，保持可读。

---

## 开发

```powershell
node build.mjs                  # 从 src/ 生成 lib/index.js 与 lib/client.js
node test/pure.test.mjs         # 纯函数单测（29 项）
node test/client-harness.mjs    # 客户端装配集成测试（19 项）
```

零依赖：无需 `npm install`。

### 目录

```
dsh-selfskin/
├─ package.json          # dsh.bundle.patch + dsh.client 声明
├─ cordis.patch.yml      # 向 loader 插入 selfskin 行
├─ build.mjs             # 零依赖构建（src -> lib）
├─ src/                  # 唯一可编辑真源
│   ├─ index.js          #   Host 半（空 apply，只负责让 loader 行可解析）
│   ├─ pure.js           #   纯函数：解析 / 归一化 / 转义 / 几何（可单测、构建时内联）
│   ├─ client.js         #   浏览器半：store、皮肤注册、特效合成、涟漪委托、插槽
│   ├─ ui.js             #   React 组件（侧边栏面板、三个分区、氛围层、涟漪层）
│   └─ effects/*.css     #   样式分块（每个开关一个文件）
├─ lib/                  # 构建产物（插件实际加载这里）
├─ docs/                 # 技术方案
└─ test/                 # 测试与验收
```

`src/` 内的 `pure.js` / `client.js` / `ui.js` 是**普通脚本**而非 ES 模块 —— 构建会把它们
拼进同一个 factory 作用域，因此这三处**不要写 `import` / `export`**（`pure.js` 例外，它的
`export` 会被构建剥离）。

### 修改样式

样式真源在 `src/effects/`，每个可开关特效一个文件：

| 文件 | 归属 |
|---|---|
| `ui.css` | 插件自有 UI（始终注入） |
| `buttons.base.css` / `buttons.lift.css` / `buttons.shimmer.css` / `buttons.ripple.css` | 按钮特效分层 |
| `ambience.aurora.css` / `ambience.wallpaper.css` | 氛围特效（含 `{{占位符}}`） |

改完**必须重跑 `node build.mjs`** —— `lib/client.js` 是生成物，直接改它会被下次构建覆盖。
改 bundle 内容后需要重启应用，插件集变更亦然。

### 宿主 API 契约（本插件依赖）

- `ctx.theme.register({ id, colorScheme, tokens })` —— `tokens` 是**纯字符串**（已按该皮肤的
  `colorScheme` 解析）。
- `ctx.theme.overrideTokens(source, tokens)` —— `tokens` 是 **`{ light, dark }` 成对值**。
  两者形状不同，写错会让表面变成 `[object Object]`。
- `ctx.theme.setTheme(id)` / `getTheme()` / `ctx.on('theme/change')`。
- `ctx.slots.inject(key, () => ctx.slots.register({ name, id, order }, Component))`。
- 插槽：`sidebar.panellist`（侧边栏「皮肤管理」行）、`main`（该行打开的面板）、
  `shell.overlay`（全屏覆盖层，**恒在内容之上**）。前两者用同一个 id 关联 ——
  `main` 是 keyed 插槽，内容区渲染 `key` 等于当前面板 id 的条目。

---

## 已知边界

- **第三方设置命名空间不对外暴露**（宿主只放行白名单），偏好只能存在 `localStorage`，
  与宿主自身的处理一致；因此偏好是"本机浏览器"范围，不跨设备同步。
- **`shell.overlay` 在内容之上**，所以壁纸与极光只能挂在 `body` 的伪元素上才在内容之下；
  光尘作为顶层低透明度浮尘，是刻意的取舍。
- **不用 `backdrop-filter`**：宿主表面的类名是构建生成的哈希名，无法稳定选中，模糊正文
  反而损害可读性；毛玻璃因此以令牌半透明实现。
- 皮肤与特效的观感需真机确认，自动化测试只覆盖装配与逻辑（见 `test/verify.md`）。

## License

MIT。随附的字体、图标均为本项目自绘，不包含任何第三方美术资源。
