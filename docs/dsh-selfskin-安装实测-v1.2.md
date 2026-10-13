# dsh-selfskin 安装实测 v1.2

> 阶段：把 v1.1 的产出**真正装进本机 profile**，而不是只跑单测。
> 结论：装好了，装配链路端到端验证通过；过程中修掉 install.ps1 的两个真缺陷。

---

## 0. 结论先行

| 项 | 状态 |
|---|---|
| 安装到 `desktop` profile | ✅ 已装（`file:E:/AI_Pro/dsh-skin`，v1.0.1） |
| `dsh.profile.bundles` 注册 | ✅ 已自动追加 `dsh-selfskin` |
| 装配链路（bundle → patch → insert 行） | ✅ 用一次性 profile 跑通，见 §5.1 |
| 装进去的产物 = 测过的产物 | ✅ 逐文件 sha256 一致，见 §5.2 |
| 自动化测试 | ✅ 56 项全绿（29 + 19 + 8） |
| `test/install.ps1` | ✅ 语法 + 实跑 + `-Refresh` 全部验过 |
| **观感验收** | ⬜ **唯一未完成项**，需你启动应用目视，见 §7 |

---

## 1. 最终安装状态

profile：`C:\Users\LENOVO\.dsh\profiles\desktop`

```json
// package.json
"dependencies": {
  "dsh-boot-animation": "github:lxj5820/dsh-boot-animation",
  "dsh-our-free-model": "github:Ebony-Vinyl/dsh-our-free-model",
  "dsh-selfskin": "file:E:/AI_Pro/dsh-skin"          // ← 新增
},
"dsh": {
  "profile": {
    "bundles": [
      "@deepseek-ai/dsh-base",
      "@deepseek-ai/dsh-web-app",
      "dsh-our-free-model",
      "@deepseek-ai/dsh-experimental-auto-review",
      "dsh-boot-animation",
      "dsh-selfskin"                                  // ← 由 dsh plugin add 自动追加
    ]
  }
}
```

`node_modules/dsh-selfskin/` 是**实体目录**（非链接），内容为 `files` 白名单：
`lib/`、`src/`、`locale/`、`cordis.patch.yml`、`icon.svg`、`package.json`、`README.md`、
`CHANGELOG.md`、`LICENSE`。`test/`、`docs/`、`build.mjs` 未随包安装（符合预期）。

---

## 2. 根因：`link:` 跨盘符号链接**静默**失败

### 2.1 第一次安装的症状

```powershell
dsh plugin --profile desktop add E:/AI_Pro/dsh-skin    # 裸路径
```

pnpm 输出一切正常：

```
dependencies:
+ dsh-selfskin link:E:/AI_Pro/dsh-skin
Done in 2.5s using pnpm v11.7.0
```

依赖确实写进了 `package.json`，`pnpm-lock.yaml` 也有 `link:E:/AI_Pro/dsh-skin`。
但紧接着装配阶段崩了：

```
Error: dsh: cannot resolve profile bundle "dsh-selfskin" from the dsh installation
or C:\Users\LENOVO\.dsh\profiles\desktop
    at resolveBundleDir (.../@deepseek-ai/dsh-app-boot/lib/index.js:906:8)
    at bundleManifest (.../@deepseek-ai/dsh-plugin-manager/lib/types/operations.js:32:24)
    at reconcile      (.../@deepseek-ai/dsh-plugin-manager/lib/types/operations.js:57:26)
```

而 `node_modules/` 里**只有** `dsh-boot-animation` 与 `dsh-our-free-model` ——
`dsh-selfskin` 根本不存在。`test -e` 为 MISSING，穿透路径 `cat` 也读不到文件。

### 2.2 隔离复现（不碰用户 profile）

在没有 workspace 配置的空白项目里最小复现：

| 实验 | pnpm 报告 | `node_modules/` 实际 |
|---|---|---|
| `pnpm add link:E:/AI_Pro/dsh-skin` | `+ dsh-selfskin 1.0.0 <- E:\AI_Pro\dsh-skin` | 只有 `.pnpm`、`.modules.yaml`，**无 `dsh-selfskin`** |
| `pnpm add file:E:/AI_Pro/dsh-skin`（isolated linker） | `Packages: +1, added 1` | 内容被复制进 `.pnpm/.../node_modules/dsh-selfskin`，**顶层仍无链接** |
| `pnpm add file:E:/AI_Pro/dsh-skin`（**hoisted** linker） | `added 1` | ✅ **顶层出现实体目录 `node_modules/dsh-selfskin`** |

结论：这台机器上 pnpm **创建不出 node_modules 里的目录符号链接**（跨盘 `E:` → `C:`，
默认 Windows 无此特权），而 pnpm 不把失败暴露出来。

### 2.3 为什么 `file:` + hoisted 能行

profile 的 `pnpm-workspace.yaml` 里写着：

```yaml
packages:
  - .
nodeLinker: hoisted
autoInstallPeers: false
```

`nodeLinker: hoisted` 下 pnpm 不使用符号链接，而是把包**硬链接**进 `node_modules`
顶层 —— 这也正是已装的两个 GitHub 插件是实体目录的原因。`file:` 在 hoisted 模式下
走同一条路径，因此不需要任何特权。

### 2.4 对两条安装入口的影响

- **命令行**：必须写 `file:E:/AI_Pro/dsh-skin`。
- **插件管理器输入框**：同样必须带 `file:`。它内部的 `parseInstallSpec` 会**剥掉**
  `file:`／`link:` 前缀再校验剩下部分是不是绝对路径，所以 `file:E:/...` 被正
  确识别为本地路径；而裸路径虽然也能通过校验，却会被原样交给 pnpm → `link:` → 同一个坑。

---

## 3. 安装机制（读源码确认，写错就装不上）

装之前把装配链路的每一环都读了一遍，避免把"装不上"误判成"插件写错"。

| 环节 | 实现事实 | 我们的清单 |
|---|---|---|
| bundle 解析 | `resolveBundleDir` 依次从 dsh 安装目录、profile 目录解析 `node_modules/<name>/package.json` | ✅ |
| 必须有 `dsh.bundle` | `dsh.bundle` 缺失时只警告"作为普通依赖安装，不是 profile 层" | ✅ 有 |
| patch 声明形状 | `bundlePatchFiles`：`typeof bundle.patch === "string" ? [bundle.patch] : bundle.patch` | ✅ 字符串合法 |
| patch 内容 | 顶层 YAML 数组，`PatchOptions`（`insert` 列表、id 定向覆盖） | ✅ |
| 兼容性闸门 | `evaluatePluginCompatibility` 在**完全没有 `peerDependencies` 字段时直接返回 `undefined`** | ✅ 无该字段 → 放行 |
| **自动启用** | `runProfilePnpm` 成功后调 `reconcile()`：对每个新增直接依赖，若其 `dsh.bundle` 存在就把包名**追加进 `dsh.profile.bundles`** | ✅ 已生效（见 §1） |
| 客户端声明 | `parseDshClient`：`platform` 必须是字符串；`inject` 必须是字符串数组；`immediately` 必须是布尔 | ✅ 三者合规 |
| 客户端入口 | `clientExportOf`：`exports["./client"]` 允许是字符串，或含字符串 `default` 的对象 | ✅ 字符串 |
| `inject` 语义 | 客户端取的是**图行 id**（包名），找不到就静默跳过 → 软排序依赖，不是硬闸门 | ✅ 指向真实存在的包 |

两个附带结论：

- 对 desktop profile，`rejectElectronProfile` 会拦住 `--dump-config`，所以**没法**用
  CLI 直接 dump desktop 的装配结果（§5.1 绕开了这一点）。
- 桌面版 CLI 打包在 `<安装目录>\resources\runtime\cli\bin\dsh.cmd`，**默认不写进 PATH**，
  `Get-Command dsh` 通常找不到。

---

## 4. 修掉的三个真实缺陷

### 缺陷 #4：`install.ps1` 一启动就崩（原脚本就有）

`param()` 默认值里用了 `$PSScriptRoot`：

```powershell
[string] $PackagePath = (Split-Path -Parent $PSScriptRoot)
```

在 Windows PowerShell 5.1 上，**求值参数默认值时 `$PSScriptRoot` 还是空字符串**，
于是脚本在做任何事之前就抛：

```
Split-Path : 无法将参数绑定到参数"Path"，因为该参数为空字符串。
    + CategoryInfo : InvalidData: (:) [Split-Path]
```

`PARSE OK` —— 语法检查完全发现不了，只有实跑才会暴露。

**修复**：默认值留空，改到脚本体内用 `$PSCommandPath`（回退 `$MyInvocation.MyCommand.Path`）
解析包根，并在两者都拿不到时给出明确报错。

### 缺陷 #5：裸路径 → `link:` 静默失败

见 §2。**修复**：`install.ps1` 把包根规范化为 `file:` + 正斜杠形式再交给 pnpm；
README 与 v1.1 文档同步改正。

### 顺带改进：CLI 自动发现

原脚本假设 `dsh` 在 PATH 上，找不到就只打印指引。现在按顺序尝试：

1. `-DshPath` 显式传入；
2. `Get-Command dsh`（用户自己装过 CLI）；
3. **解析开始菜单／桌面快捷方式**，从 `.lnk` 指向的应用目录推出
   `<app>\resources\runtime\cli\bin\dsh.cmd`；
4. 常见安装根目录（`ProgramFiles`、`LOCALAPPDATA\Programs` 等）。

实测：在 `-DshPath` 未传的情况下正确报出
`found dsh : E:\AI\dsh\resources\runtime\cli\bin\dsh.cmd`。

### 缺陷 #6：重跑 `add` 刷新不了拷贝，且**同样静默**

`file:` 装出来的是硬链接拷贝。改完 `src/` 重新构建后重跑 `add`：

```
Already up to date
Done in 316ms using pnpm v11.7.0
```

退出码 0、输出干净，唯一的问题是 `node_modules/dsh-selfskin/package.json` **还是旧版本** ——
pnpm 比较的是 specifier 字符串 `file:E:/AI_Pro/dsh-skin`，它没变，于是直接短路。
`pnpm install --force` 也无效（同样报 `Already up to date`）。

只有**先 `remove` 再 `add`** 会真正替换。实测 `remove` → `add` 后版本从 `1.0.0` 变为 `1.0.1`。

**修复**：`install.ps1` 增加 `-Refresh` 开关，执行 remove → add，并把这条坑写进成功输出；
README 给出等价手写形式。

**验证方式**（可证伪）：先删掉安装副本里的 `icon.svg`，再跑 `-Refresh`，脚本报
`icon.svg restored: True`。

---

## 5. 验证证据

### 5.1 装配链路端到端（真实组合，非推断）

desktop profile 不能 dump，于是建了一个**一次性 profile**（web 模板）走完全相同的代码路径：

```powershell
dsh --profile selfskincheck --from-default-profile web --dump-config   # 基线
dsh plugin --profile selfskincheck add -w file:E:/AI_Pro/dsh-skin
dsh --profile selfskincheck --dump-config
```

组合结果里出现了：

```yaml
# == dsh-selfskin
- id: selfskin
  name: dsh-selfskin
```

这一行证明四件事全部成立：bundle 从 profile 的 `node_modules` 解析成功 →
`dsh.bundle.patch` 被读取 → YAML 解析通过 → `insert` 行被 Loader 真正注入。
`bundles` 数组同时被追加为 `["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "dsh-selfskin"]`。

验证后该 profile 已删除，`~/.dsh/profiles/` 只剩 `desktop`、`web`、`node_modules`。

### 5.2 装进去的就是测过的

| 文件 | 源 ↔ 安装 sha256（前 16 位） |
|---|---|
| `lib/index.js` | MATCH `3161da65d29022de` |
| `lib/client.js` | MATCH `8525481c650ac7cb` |
| `cordis.patch.yml` | MATCH `a734b322a3aa91a4` |
| `package.json` | MATCH `d9911ef8fad77a93` |
| `icon.svg` | MATCH `6cff2699286c45e6` |

对安装副本单独跑 `node --check`：`index.js`、`client.js` 均通过。
重建（`node build.mjs`）后重新比对，仍然全部 MATCH —— 构建可复现。
装进去的版本为 **1.0.1**。

### 5.3 回归

```
node build.mjs               -> built dsh-selfskin -> lib/index.js, lib/client.js
                                (7 stylesheets, 5 built-in skins)
node test/pure.test.mjs      -> 29 passed, 0 failed
node test/client-harness.mjs -> 19 passed, 0 failed
node test/validate-package.mjs -> 8 passed, 0 failed
```

`test/install.ps1` 单独验过：`ParseFile` 语法通过；对一次性 profile 实跑，
`-PackagePath` 未传时自动推出 `E:\AI_Pro\dsh-skin`，CLI 自动发现成功，
`Test-Path` 落地确认 True。

---

## 6. 回退

```powershell
dsh plugin --profile desktop remove dsh-selfskin
```

实测有效：依赖、锁文件条目、`dsh.profile.bundles` 里的名字一并清除。
偏好记录仍在 localStorage（`dsh-selfskin:state:v1`），需要时可手动 `removeItem`。

---

## 7. 剩余：真机目视验收

自动化测试证明的是**装配与逻辑**，不证明**页面好不好看**。以下仍需启动应用确认：

- 三行设置项是否出现在官方「外观」下方且不遮挡；
- 5 套内置皮肤在明暗两种宿主外观下的对比度；
- 自定义导入（含含双引号的 URL、非法 JSON 的报错文案）；
- 按钮涟漪是否贴合圆角、流光是否只在有背景的按钮上可见；
- 氛围特效（极光／光尘／毛玻璃／壁纸）在真实页面里的观感，尤其**壁纸打开后正文可读性**；
- 与已装的两个第三方插件（`dsh-boot-animation`、`dsh-our-free-model`）互不干扰。

清单见 `test/verify.md`；调参落点见 v1.1 §8。

> 提醒：安装是**拷贝**。改过 `src/` 之后要 `node build.mjs`，再跑
> `test/install.ps1 -Refresh`（等价于 remove + add）。**只重跑一次普通安装不行** ——
> 见缺陷 #6。
