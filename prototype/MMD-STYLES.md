# mmd 风格预设

原则一句话:**结构用颜色说话(紫=角色、蓝=控制、黄=阶段、绿红=路径定性),内容一律灰阶;编号讲因果,箭头讲方向。**

## 时序图预设(sequenceDiagram)

新建时序图 `.mmd` 时,把下面 init 块**原样拷贝到文件首**。mermaid 没有外部主题引用机制,in-file 是唯一能让 IDE 预览/GitHub/画廊/文章导出全部生效的方式;in-file 指令优先于渲染器的 initialize 配置,因此与 Logic 页的状态图配色互不干扰。

```
%%{init: {
  'theme': 'base',
  'themeVariables': {
    'actorBkg': '#ECECFF',
    'actorBorder': '#D5D5FF',
    'actorTextColor': '#000000',
    'activationBkgColor': '#bbdefb',
    'activationBorderColor': '#90caf9',
    'sequenceNumberColor': '#1976d2',
    'sectionBkgColor': '#f5f5f5',
    'altColor': '#fafafa',
    'gridColor': '#e0e0e0',
    'lineColor': '#757575',
    'signalColor': '#424242',
    'signalTextColor': '#212121',
    'labelBoxBkgColor': '#bbdefb',
    'labelBoxBorderColor': '#90caf9',
    'labelTextColor': '#1976d2',
    'loopTextColor': '#aaaaaa',
    'noteBkgColor': '#FFF6B8',
    'noteBorderColor': '#E4C800',
    'noteTextColor': '#5C5100'
  },
  'sequence': {
    'height': 50
  }
}}%%
```

### 配色语义(改色前先懂分工)

| 色系 | 角色 |
|---|---|
| 淡紫(`#ECECFF`/`#D5D5FF`) | 参与者框 |
| Material 蓝(`#bbdefb`/`#90caf9`/`#1976d2`) | 控制结构:alt/loop 标签框、激活条、序号 |
| 暖黄(`#FFF6B8`/`#E4C800`/`#5C5100`) | 阶段横幅(Note) |
| 灰阶(`#757575`/`#424242`/`#212121`) | 一切线与消息文字——内容不抢色 |

本预设为**浅底**(文章配图/导出)设计;`sequence.height: 50` 放宽行距利于截图。

## 时序图写法约定

1. **阶段横幅**:`Note over <跨列>: 阶段名`——把 Note 用作 section banner,不用 box。
2. **消息编号按阶段重开**,分支内小数层级(3.1 / 4.1–4.3)——编号表达因果链,不是全局流水号。
3. **箭头语义严格**:请求实线 `->>`,响应虚线 `-->>`,无例外。
4. **alt 分支内套 `rect` 色块定性**:执行路径淡绿 `rect rgb(240, 255, 240)`,收尾路径淡红 `rect rgb(255, 240, 240)`。
5. **participant 单字母别名** `as` 显示名;显示名中文为主,术语保留英文。
6. 消息文案:动词开头短句。

## 状态图预设(stateDiagram)

同一套色语言映射到状态图:淡紫=状态节点、暖黄=注释(note)、灰阶=迁移线与标签文字。init 块拷入 `.mmd` 文件首(`%% title:` 行之后):

```
%%{init: {
  'theme': 'base',
  'htmlLabels': false,
  'state': { 'htmlLabels': false },
  'flowchart': { 'htmlLabels': false },
  'themeVariables': {
    'primaryColor': '#ECECFF',
    'primaryBorderColor': '#D5D5FF',
    'primaryTextColor': '#000000',
    'lineColor': '#757575',
    'textColor': '#212121',
    'edgeLabelBackground': 'transparent',
    'noteBkgColor': '#FFF6B8',
    'noteBorderColor': '#E4C800',
    'noteTextColor': '#5C5100',
    'tertiaryColor': '#f5f5f5',
    'background': '#FFFFFF'
  }
}}%%
```

`htmlLabels: false` 让标签走纯 SVG `<text>` 渲染而非 foreignObject——根治 mermaid 已知 bug(#6424:foreignObject 宽度算不准致长词/CJK 标签被裁);SVG text 宽度精确测量,viewBox 自然算对(Chrome 实测两侧各余 8px 不裁)。状态图标签为纯文本,无富文本损失。

### 状态图写法约定(防标签与节点覆盖)

mermaid 排版无标签避让,靠写法 + 页面 CSS 规避:

1. **平行边合并**:同起同终点的多条迁移合成一条,触发事件用 ` / ` 枚举进同一标签——第二个标签是碰撞的头号来源。
2. **标签求短**:细分枚举不必全上图(细节归代码/spec),图上留类别词。
3. **拥挤时 `direction LR`**:横排给标签让出水平空间。
4. **长标签逐字折行/被裁**:由预设的 `htmlLabels: false` 根治(见上,标签走 SVG text,不用 foreignObject)。曾试 `state.wrappingWidth`(对 UMD 版无效)与 CSS `white-space:nowrap`(治折行但文字溢出 viewBox 被裁),均非正解——已实测弃用。logic-page 的 pan 画布 SVG 另加 `overflow:visible` 兜底缩放边缘。

两套预设都是**浅底**设计;in-file 指令优先于渲染器 initialize——logic-page 的 themeVariables 只作"无 init 块的图"的兜底,pan 画布固定浅色以承载浅底图。
