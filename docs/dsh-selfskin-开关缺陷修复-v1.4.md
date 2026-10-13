# dsh-selfskin — 开关控件缺陷修复（v1.4）

> 对应版本 **1.0.2**。触发来源：真机使用中反馈"壁纸的按钮点击后图形没有反应，
> 而且和启动/未启动的按钮样式不一样"。两个问题都成立，根因都在插件这边，宿主无关。

---

## TL;DR

| # | 症状 | 根因 | 性质 |
|---|---|---|---|
| 1 | 点开关，偏好确实改了、壁纸面板也展开了，但**开关图形一动不动** | CSS 选择器写成 `.dss-switchTrack[aria-checked="true"]`，而 `aria-checked` 渲染在**外层 `<button>`** 上 —— 轨道永远拿不到该属性，两条规则都是**死代码** | 静默失效，无任何报错 |
| 2 | 开关和宿主自带的开关**长得不一样**（胶囊像方头、滑块不像正圆） | 宿主给 `*` 全局加了 `corner-shape: superellipse(1.5)`；宿主自己的胶囊/圆形控件都写 `corner-shape: round` 退出，**我们没退出**。尺寸与配色也和宿主不一致 | 观感偏离 |

两处都已修复。修法不是"调参"，而是**照抄宿主自己的 `Switch` 实现**——`practices.md` 要求的正是
"复刻宿主标记与间距，而不是引入它的组件"。

---

## 1. 症状与复现

1. 打开 **设置 → 常规 → 氛围特效**；
2. 点「壁纸」开关。

**观察到**：下方的壁纸面板展开了（说明点击确实触发了 store 写入），但**开关本身没有任何变化** ——
胶囊底色不变、滑块不移位。四个氛围开关、三个按钮特效开关全都如此。

**关键区分**：这不是"点击没绑上"。点击是生效的（面板展开即为证据）。失效的只有**视觉反馈**，
而这类失效最难发现，因为它不产生任何异常。

---

## 2. 根因一：on-state 选择器挂在了错的元素上

`src/ui.js` 的 `Toggle` 把状态属性渲染在**根 `<button>`** 上：

```js
h('button', {
    className: 'dss-switch',
    role: 'switch',
    'aria-checked': props.checked ? 'true' : 'false',   // ← 在 button 上
    onClick: ...,
}, h('span', { className: 'dss-switchTrack' }, h('span', { className: 'dss-switchThumb' })))
```

而 `src/effects/ui.css` 去匹配**轨道**：

```css
.dss-switchTrack[aria-checked="true"] { ... }                     /* 永远不匹配 */
.dss-switchTrack[aria-checked="true"] .dss-switchThumb { ... }    /* 永远不匹配 */
```

`.dss-switchTrack` 是 `aria-checked` 所在元素的**子元素**，自己当然没有这个属性。于是：

- 轨道底色永远停留在关态；
- 滑块位移规则永不生效；
- 整个控件在视觉上"冻结"。

**为什么没被测出来**：既有的 24 项装配测试断言的是"样式表随开关正确组装"
（哪些块被拼进来），而不是"选择器能否匹配上"。一条死选择器语法完全合法，构建、校验、
运行时都不会抗议。这正是本次新增断言针对的盲区。

**顺带一提**：宿主自己的写法也在同一个文件里——`dsh-client-ui-primitives/lib/Switch.module.css`
第一行注释就写着

> *The on/off appearance keys off aria-checked rather than a parallel class, so the
> visual state cannot disagree with the state assistive technology reads.*

它把 `[aria-checked]` 放在**根**元素上（`.switch[aria-checked='true']`）。
我们照做即可，且这样视觉状态与无障碍状态**在结构上就不可能不一致**。

---

## 3. 根因二：没有退出宿主的全局超椭圆圆角

`dsh-client-ui-theme` 的内联样式里有一条：

```css
@supports (corner-shape:superellipse(1.5)) {
  :root { --dsw-corner-shape: superellipse(1.5) }
  *, :before, :after { corner-shape: var(--dsw-corner-shape) }
}
```

也就是说**宿主给每一个元素都套了超椭圆**。宿主自己的控件会按需退出，例如
`Switch.module.css`、`Pill.module.css`、`StateDot.module.css`、`ImageLightbox.module.css`
都显式写了 `corner-shape: round`。

我们的轨道 `border-radius: 10px` 与滑块 `border-radius: 50%` **没有退出**，后果是：

- 胶囊被画成**压扁的方圆形**，而不是宿主的圆头胶囊；
- 滑块被画成**方块状**，而不是正圆。

这是"和宿主开关样式不一样"的直接原因。注意：方形面（面板、按钮、输入框）**不应该**退出 ——
宿主自己的方块也吃这条规则，跟着走才是一致。只有胶囊与圆形需要退出。

---

## 4. 修复：逐项对齐宿主 `Switch`

`src/effects/ui.css` 的开关段落整体重写，几何与配色全部抄自
`dsh-client-ui-primitives/lib/Switch.module.css`：

| 项 | 宿主 | 修复前 | 修复后 |
|---|---|---|---|
| 状态选择器 | `.switch[aria-checked='true']`（根） | `.dss-switchTrack[aria-checked]`（子，**死**） | `.dss-switch[aria-checked="true"] …`（根） |
| 轨道尺寸 | 36×20 | 34×20 | 36×20 |
| 轨道内边距 | 2px | 0 | 2px |
| 轨道圆角 | 999px | 10px | 999px |
| `corner-shape` | `round` | 未退出（继承超椭圆） | `round` |
| 轨道底色（关） | `--dsw-alias-border-l3` | `--dsw-alias-bg-layer-4` + 0.5px 边框 | `--dsw-alias-border-l3` |
| 轨道底色（开） | `--dsw-alias-brand-primary` | 规则为死代码 | `--dsw-alias-brand-primary` |
| 滑块尺寸 | 16×16 | 14×14 | 16×16 |
| 滑块圆角 | 50% + `corner-shape: round` | 50%（未退出） | 50% + `round` |
| 滑块色（关） | `--dsw-alias-switch-thumb` | 同 | 同 |
| 滑块色（开） | `--dsw-alias-label-primary-foreground` | 未区分（同关态） | 同宿主 |
| 位移 | `translateX(16px)` | 规则为死代码 | `translateX(16px)` |
| 过渡 | 120ms ease | 160ms | 120ms |
| 焦点环 offset | 2px | 3px | 2px |

几何自洽性核对：轨道 `box-sizing: border-box` + `padding: 2px` → 内容区 32×16；
滑块 16×16 落在内容区左端（距边框 2px）；开态 `translateX(16px)` 后右边缘到 34px，
加上右侧 2px 内边距正好等于 36px，**两侧留白对称**。

保留的差异（有意）：滑块**文字标签放在按钮内部**，整个"开关＋文字"是一个点击目标。
宿主把标签交给渲染方、按钮只画轨道。我们的做法点击区更大，且 `role="switch"` +
`aria-checked` 的无障碍语义与宿主一致。

---

## 5. 顺带加固：壁纸文件选择不再走全局 id

`AmbienceRow` 原先这样触发文件选择：

```js
onClick: () => {
    const input = document.getElementById('dss-wallpaper-file');
    if (input) input.click();
}
```

两个问题：若这一行被渲染多次，`id` 会重复、`getElementById` 取到第一个；
若插槽将来搬进 shadow tree，`document.getElementById` 会**什么都找不到**，点击静默无效。
改为 `React.useRef`：

```js
const fileRef = React.useRef(null);
...
h('input', { ref: fileRef, type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: pickFile })
...
onClick: () => { if (fileRef.current !== null) fileRef.current.click(); }
```

这条改动**不是**本次症状的根因（症状一已经由选择器解释），但它消除了一处同类静默失效。
安装副本的 bundle 里已确认不再出现 `getElementById`。

---

## 6. 可证伪验证：这两条断言真的能失败

回归测试若不能失败就没有价值。于是做了一次**注入实验**：把旧缺陷重新注入构建产物，跑测试。

**实验 A —— 把选择器挪回轨道上**

```
injected the old dead selector
  FAIL the switch on-state keys off the root button, never the track
23 passed, 1 failed
```

**实验 B —— 删掉超椭圆退出**

```
removed corner-shape opt-outs, was 2
  FAIL the switch on-state keys off the root button, never the track
  FAIL the capsule track and round thumb opt out of the global superellipse
22 passed, 2 failed
```

实验后 `node build.mjs` 重建，产物恢复（`corner-shape: round;` 计数回到 2）。

---

## 7. 新增断言（5 条）与既有断言的修正

`test/client-harness.mjs` 从 19 项增至 **24 项**：

| 断言 | 守的是什么 |
|---|---|
| the switch on-state keys off the root button, never the track | on-state 选择器必须在根元素；且**不得**存在 `.dss-switchTrack[aria-checked` |
| the capsule track and round thumb opt out of the global superellipse | `corner-shape: round` 至少出现 2 次（胶囊 + 滑块） |
| the built bundle never reaches for a document-wide element lookup | 产物不含 `getElementById` / `dss-wallpaper-file` |
| aria-checked and the capsule track live on the same element | 结构层面：`aria-checked` 与轨道同属一个元素（三个开关逐个查） |
| the wallpaper file input is reached through a ref, and its guard holds | 文件输入由 ref 持有、无全局 id、ref 为空时点击是 no-op 而非抛错 |

其中最后一条顺带修正了测试基建的一个盲点：React 桩里的 `h(Toggle, props)` 只记录组件、
**不会像 React 那样调用它**，因此直接遍历树只能看到组件边界。为此新增 `expand()`
显式展开函数组件后再遍历。

---

## 8. 安装同步与证据

应用（6 个 Electron 进程）当时**正在运行**，而官方安装路径要改 profile 清单、
会与运行中的锁竞争。因此本轮采用**零风险同步**：按安装器 `files` 白名单把产物覆盖进
安装副本，**不触碰 profile 清单、锁文件与 `node_modules` 其余部分**（这正是 `file:` 安装本身做的事）。

```
=== 覆盖前 ===  "version": "1.0.1"
synced  lib / src / locale / cordis.patch.yml / icon.svg / README.md / CHANGELOG.md / LICENSE / package.json
=== 覆盖后 ===  "version": "1.0.2"

=== 逐文件 sha256 比对 ===
MATCH   lib/index.js     (3161da65d29022de)
MATCH   lib/client.js    (fddcc478d40d36e1)
MATCH   cordis.patch.yml (a734b322a3aa91a4)
MATCH   package.json     (00578f6d349eb515)
MATCH   icon.svg         (6cff2699286c45e6)

=== 安装副本里的关键修复 ===
.dss-switch[aria-checked=\"true\"] .dss-switchTrack
2                                     ← corner-shape: round; 出现 2 次

=== profile 清单未被触碰 ===
"bundles": [ ... "dsh-boot-animation", "dsh-selfskin" ]
```

测试：**61 项全绿**（pure 29 + client-harness 24 + validate-package 8）。

---

## 9. 仍未验证 / 需要你确认

- **观感**。测试只能证明选择器挂对了、属性齐了，**不能证明看上去对**。
  重启应用后请按 `test/verify.md` §8 逐条确认 —— 判据是**开关图形随点击立即变化**，
  而不是"面板有没有展开"。
- 你提到的"启动和未启动的按钮样式不同"，我按两种读法都做了处置：
  - 若是**同一个开关的开/关两态**看起来不对 → 本次修复（on-state 可见）解决；
  - 若是**我们的开关与宿主的开关**对比不一样 → 本次修复（几何/配色/超椭圆）解决。
  - 若你指的其实是**氛围特效那一行四个开关换行**导致某个开关单独占一行（`.dss-stack`
    带 `flex-wrap: wrap`），那是布局问题、不是样式问题，请回我一句，我改行内布局。
- 「选择本地图片」若点不出来，请把控制台报错原文发我 —— 该路径已改用 ref，理论风险已消除。

---

## 10. 变更文件

| 文件 | 变更 |
|---|---|
| `src/effects/ui.css` | 开关段落重写：状态选择器移到根元素、几何与配色对齐宿主、补 `corner-shape: round` |
| `src/ui.js` | `AmbienceRow` 的文件输入改用 `React.useRef`，移除全局 id |
| `test/client-harness.mjs` | +5 条断言；新增 `expand()` 展开函数组件 |
| `test/verify.md` | §0 修正安装命令（`file:` / 安装助手）；新增 §8 开关控件专项复验；测试计数更新 |
| `CHANGELOG.md` | 新增 1.0.2 条目 |
| `package.json` | 版本 1.0.1 → 1.0.2 |
| `docs/dsh-selfskin-开关缺陷修复-v1.4.md` | 本文档 |
