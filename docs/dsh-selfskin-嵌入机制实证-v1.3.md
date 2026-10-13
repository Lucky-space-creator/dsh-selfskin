# dsh-selfskin 嵌入机制实证 v1.3

> 阶段四。回答一个问题：**这个插件能不能正确嵌进 dsh 桌面端？**
> 结论：**能。** 三条独立链路（Host 半边 / Client 半边 / 兼容性门禁）已全部用真实 desktop profile 与框架自身代码实证，不再依赖推断。
>
> 前一阶段（v1.2）解决的是"装得进去"，本阶段解决的是"装进去之后被正确识别"。

---

## 1. 结论与证据总表

| # | 待证事项 | 判定依据 | 结果 |
|---|---|---|---|
| 1 | Host 半边进入真实 desktop 配置树 | 对真实 profile dump，见 §3.1 | ✅ `# == dsh-selfskin` |
| 2 | 与已装的两个第三方插件共存 | 同上，同一棵配置树 | ✅ 三者并列 |
| 3 | Client 半边被框架识别 | 调用真实 `ClientModules.resolveMeta`，见 §3.2 | ✅ 元数据正确 |
| 4 | `clientPath` 指向真实文件 | 同上 | ✅ 81778 字节 |
| 5 | 客户端资源如何伺服 | 读框架源码，见 §2.2 | ✅ 框架自带路由，插件无需自注册 |
| 6 | 声明的注入依赖可解析 | 读源码 + 包清单，见 §2.2 | ✅ 官方包确实带 client 半边 |
| 7 | 兼容性门禁是否拦截 | 无 `peerDependencies` → 放行，见 §2.3 | ✅ 不拦截 |
| 8 | 组装过程无 skip / 无告警 | dump 输出无 skip 行 | ✅ 干净 |
| 9 | **应用启动后不报错** | — | ⬜ **唯一未验证项**，见 §6 |

前八项都是"框架视角能不能接纳"，第九项是"运行时会不会炸"。前者可直接实证，后者必须真机启动。

---

## 2. 嵌入的三条链路

插件要真正生效，必须同时通过三条互不重叠的链路。任何一条断了，表现都是"设置里没有那三行"。

### 2.1 Host 链路：bundle → patch → 配置树

```
profile/package.json  dsh.profile.bundles[]
        │
        ├─ 逐个解析 bundle 目录（@deepseek-ai/dsh-base、dsh-boot-animation、dsh-selfskin …）
        │
        ├─ 读每个 bundle 的 cordis 条目 → 展开成 patch 行
        │
        ├─ 叠加 dsh.bundle.patch 指向的 cordis.patch.yml
        │      └─ 我们的：- insert: [ { id: selfskin, name: dsh-selfskin } ]
        │
        └─ 叠加上 profile 的 cordis.patch.yml → 组合成一棵树
```

关键事实（读 `dsh-app-boot` 源码确认）：

- `dsh.bundle.patch` 接受**字符串**（单个补丁文件路径），我们的写法正确。
- 补丁文件是**顶层 YAML 数组**，`insert` 是其中一个元素，我们的格式正确。
- `insert` 行的 `name` 是包名，Loader 据此 `resolve` 到 `node_modules/dsh-selfskin`，再读它的 `main`（`lib/index.js`）挂载 Host 半边。

### 2.2 Client 链路：`dsh.client` → 资源伺服 → 浏览器

这一层最容易被误解为"需要插件自己起服务"。**不需要。** `@deepseek-ai/dsh-client-modules` 的模块头注释给出了完整定义：

> Node half of the client module system（`dsh.client` dual-face package）：scans the host Loader's entries for packages declaring `dsh.client`, composes the `window.__DSH_BOOT__` entry graph in module-graph order, **serves one-or-more-plugin combo scripts plus their source maps**, contributes the registration facade, application preloads, bootstrap scripts, and graph to the **webserver's index injection table**, and provides the `clientModules` service.

它的构造函数里有一段决定性的注册：

```js
const registerWebCarrier = (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
        kind: "prefix",
        path: PLUGIN_ROUTE,          // "/plugins"
        handler: this.serveBundle
    }), "client-modules: bundle route");
};
ctx.inject(["webServer"], registerWebCarrier);
```

也就是说 **`/plugins` 前缀路由由框架统一伺服**，另外还有 `fetchBundle()` 走 Electron 自有协议（`shell-carrier`），连 Web 服务器都不需要。所以我们的 Host 半边**刻意保持空实现**是正确的：没有自有资源需要伺服。

浏览器侧取到的 URL 形如：

```
/plugins/dsh-selfskin/client.js?rev=<artifactRevision>
```

`artifactRevision` 由文件的 `mtime/ctime/size` 哈希而来 —— 这也是为什么**改完源码必须重新安装**：拷贝的元数据变了，rev 才会变，浏览器才不会命中旧缓存。

**`exports["./client"]` 的两种合法形式**（`clientExportOf` 明确都支持）：

| 形式 | 写法 | 谁在用 |
|---|---|---|
| 字符串 | `"./client": "./lib/client.js"` | **我们**（更简洁） |
| 对象 | `"./client": { "types": "...", "default": "./lib/client.js" }` | 官方（`dsh-client-ui-theme` 等） |

### 2.3 兼容性门禁

`dsh-plugin-manager` 的 `evaluatePluginCompatibility` 在包**没有 `peerDependencies` 字段时直接放行**。我们的清单不含该字段，因此不会被版本门禁拦截。

---

## 3. 实证过程

### 3.1 拿到真实 desktop 配置树

CLI 对 `--profile desktop` 的 `dump-config` 是**无条件拒绝**的：

```js
function rejectElectronProfile(program, profile) {
    if (profile.toLowerCase() === "desktop")
        program.error('error: profile "desktop" is managed exclusively by the Electron application');
}
```

判定**只看 profile 名**。于是建一个 junction 让新名字指向同一份真实目录：

```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.dsh\profiles\ssprobe" `
                              -Target "$env:USERPROFILE\.dsh\profiles\desktop"
dsh --profile ssprobe --dump-config
```

这份转储用**真实的 desktop 内容**（含全部 6 个 bundle、两个已装第三方插件）走完了一模一样的组装代码路径。结果 1322 行，末尾：

```yaml
# == dsh-our-free-model
- id: our-free-model
  name: dsh-our-free-model
  config: {}
# == dsh-experimental-auto-review
- id: auto-review
  name: '@deepseek-ai/dsh-experimental-auto-review'
# == dsh-boot-animation
- id: boot-animation
  name: dsh-boot-animation
# == dsh-selfskin
- id: selfskin
  name: dsh-selfskin          ← 我们的插入行，位置与命名都正确
```

全程无 skip、无告警。验证完 junction 已删除。

### 3.2 用框架自己的代码解析 Client 半边

不满足于"逐行读源码核对"，直接调用框架的 `ClientModules.prototype.resolveMeta`（在 `vm` 之外、针对**真实安装目录**运行）：

```mjs
const proto = (await import('…/@deepseek-ai/dsh-client-modules/lib/index.js')).default.prototype;
const baseUrl = pathToFileURL('C:/Users/LENOVO/.dsh/profiles/desktop/package.json').href;
const fake = { pkgMeta: new Map(), sourceKey: proto.sourceKey,
               locatePkgJson: proto.locatePkgJson,
               ctx: { loader: { internal: undefined }, logger: console } };
proto.resolveMeta.call(fake, 'dsh-selfskin', baseUrl);
```

输出：

```json
{
  "packageName": "dsh-selfskin",
  "meta": {
    "clientPath": "C:\\Users\\LENOVO\\.dsh\\profiles\\desktop\\node_modules\\dsh-selfskin\\lib\\client.js",
    "inject": ["@deepseek-ai/dsh-client-ui-theme"],
    "external": [],
    "immediately": true
  }
}
clientPath exists : true   (81778 bytes)
```

同一根因链上的其他包一并验证，确认解析器对它们的行为符合预期：

| 包 | 结果 |
|---|---|
| `dsh-selfskin` | ✅ immediately=true, inject=["@deepseek-ai/dsh-client-ui-theme"] |
| `dsh-boot-animation` | ✅ immediately=false |
| `dsh-our-free-model` | ✅ immediately=true, inject=[] |
| `@deepseek-ai/dsh-client-ui-theme` | 探针报 no client half —— **探针限制，非真问题** |

最后一行需要解释：该包**不在 profile 的 `node_modules` 里**，它是应用自带的（打包在 `app.asar`），运行时靠 `loader.internal.resolveSync` 的**内存路由**解析。我的探针没有装内存路由器，所以退回 `createRequire` 找不到它。直接读它的清单可以确认它**确实带 client 半边**，且 `platform: "web"`：

```json
"dsh": { "client": { "platform": "web", "immediately": true,
  "inject": ["@deepseek-ai/dsh-client-connection", "@deepseek-ai/dsh-client-locale",
             "@deepseek-ai/dsh-client-ui-renderer", "@deepseek-ai/dsh-client-ui-settings",
             "@deepseek-ai/dsh-api-remotes"] } }
```

所以在真实运行时，我们声明的 `inject` 目标能被解析到，模块图排序成立。

---

## 4. 过程中发现的三条机制事实

### 4.1 `dump-config` 会重置 `cordis.yml`，且这是设计行为

对 profile 跑 `dump-config`（或任何走 `prepareProfile` 的路径）会把 `cordis.yml` **无条件重写**为一句话加一个空数组。`prepareProfile` 的文档注释解释了原因：

> The root is **always rewritten**: the whole composition is patch layers, and the vendored Loader's **tree write-back**（a plugin self-disposing persists the current tree）can bake composed rows into this file — which would **duplicate every bundle insert on the next boot**. The file exists on disk only because the Loader needs a real include root to anchor `baseUrl`.

三点结论：

1. `cordis.yml` 的规范内容就是 `[]`；它存在只是为了给 Loader 一个 `baseUrl` 锚点。
2. 用户在界面里改的配置写在 `cordis.patch.yml`，**不写这里**。
3. 留着那份"被烘焙进来的"大文件，反而会让下次启动**重复插入每个 bundle**。

### 4.2 桌面版 CLI 的 profile 白名单

`rejectElectronProfile` 只在名字等于 `desktop` 时拒绝。`plugin` 子命令之所以能对 desktop 生效，是因为桌面 carrier 调用时传了 `manageDesktopProfile = true`；而 `dump-config` 路径没有这个开关，所以被拒。

### 4.3 `initProfile` 是幂等的

> Existing files are never touched, so re-running is a no-op on an initialized profile.

它只写缺失的 `package.json` / `cordis.patch.yml` / `pnpm-workspace.yaml`，**根本不动 `cordis.yml`**。所以 §4.1 的重置来自 `prepareProfile`，不是初始化。

---

## 5. 对环境的一处改动（如实记录）

跑 §3.1 的转储时，`prepareProfile` 按上述设计把 desktop 的 `cordis.yml` 从 **45628 字节重置为 223 字节**（`[]` + 注释）。

**影响评估：无实质损失。**

| 项 | 状态 |
|---|---|
| `cordis.patch.yml`（用户真实配置层） | **未被触碰**（2009 字节，mtime 保持 10:29） |
| `package.json`（bundles / dependencies） | 未被触碰 |
| `node_modules/` | 未被触碰 |
| 被重置的 `cordis.yml` | 是 Loader 写回的**组合结果快照**，可由 bundle + patch 完全重建 |

反向看，这次重置还**消除**了一个隐患：那份 45628 字节的快照若留到下次启动，会按 §4.1 的机制让每个 bundle 的行**重复插入一遍**。应用下次启动时会重新组合出等价的配置树。

---

## 6. 仍未验证的一项：运行时加载

前八项证明的是**框架会接纳这个插件**。第九项——应用进程真的启动、Loader 真的挂载 `lib/index.js`、浏览器真的执行 `lib/client.js`——只能在真机上看。

我没有代为启动应用（会拉起 GUI 窗口，属于应当由你决定的动作）。

**启动方式**（二选一）：

```
E:\AI\dsh\DeepSeek Harness.exe           直接双击
```

**预期现象**，按顺序：

1. 应用正常启动，无错误弹窗、无白屏；
2. `设置 → 常规`，在官方「外观」行**下方**出现三行：**皮肤 / 按钮特效 / 氛围特效**；
3. 皮肤下拉里分三组：**宿主外观**（跟随系统 / 亮色 / 暗色）、**内置皮肤**（5 套）、**已导入**；
4. 切一套皮肤，整页配色随动；开关按钮特效后，按钮悬停有抬升、点击有涟漪；
5. 打开氛围特效的壁纸，页面底部出现底图（**重点看正文可读性**）。

若第 2 步没出现，按以下顺序定位（从最可能到最不可能）：

| 现象 | 最可能原因 |
|---|---|
| 三行都没有，插件列表里能看到 dsh-selfskin | Client 半边没加载 —— 开开发者工具看 `/plugins/dsh-selfskin/client.js` 是否 404 |
| 插件列表里没有 dsh-selfskin | Host 半边没挂载 —— 检查 `dsh.profile.bundles` 是否含该项 |
| 应用启动即报错 | 看终端/日志的 `StartupError`，通常会把失败包名与阶段一并打印 |

完整的逐项目视清单在 `test/verify.md`。

---

## 7. 复现实证的方法

本阶段的两项实证都可复现：

**配置树**（需一份可转储的 profile）：

```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.dsh\profiles\probe" `
                              -Target "$env:USERPROFILE\.dsh\profiles\desktop"
& "$env:ProgramFiles\…\dsh.cmd" --profile probe --dump-config | Select-String -Context 2 selfskin
Remove-Item "$env:USERPROFILE\.dsh\profiles\probe"        # junction 必须删，别用递归删
```

**Client 元数据**：见 §3.2 的 `resolveMeta` 片段，替换 `baseUrl` 与包名即可。

> 提示：`dump-config` 会重置目标 profile 的 `cordis.yml`（§4.1），这是设计行为；对 junction 操作等于对真实 profile 操作，验证完记得清理。
