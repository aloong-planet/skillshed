---
name: wechat-publisher
description: "Publish articles to WeChat Official Account (微信公众号). Use when user wants to: write/edit/preview/publish WeChat articles, generate cover images for WeChat articles, manage WeChat login sessions, or convert Markdown to WeChat-compatible HTML."
---

# WeChat Publisher (微信公众号发布)

Project path: `~/wechat-publisher/`
CLI: `cd ~/wechat-publisher && .venv/bin/python -m wepub.cli <command>`

## Commands

```bash
wepub login              # 扫码登录（弹出浏览器，用户微信扫码）
wepub check              # 检查 cookie 是否有效
wepub preview article.md # 生成 HTML 预览文件
wepub preview article.md --theme elegant  # 用 elegant 主题预览
wepub publish article.md --visible --author "阿龙Aloong"  # 发布到草稿箱
wepub publish article.md --theme elegant --accent-color "#FF5722"  # 自定义主题
wepub publish article.md --no-cite  # 禁用引用链接自动化
```

| 参数 | 说明 |
|------|------|
| `--visible` | 显示浏览器窗口（调试用） |
| `--cover cover.png` | 封面图（⚠️ 自动上传尚未完成，需手动设置） |
| `--theme` | 选择主题：`default`（橙色）或 `elegant`（蓝色） |
| `--accent-color` | 自定义强调色，如 `#4A90D9` |
| `--no-cite` | 禁用引用链接自动化（默认开启） |
| `--digest` | 覆盖摘要（建议由 LLM 生成 100-120 字） |

- Cookie 保存在 `~/.wechat-publisher/cookies.json`，约 6 小时过期

## 配置文件

支持用户偏好配置 `~/.wechat-publisher/config.yaml`：

```yaml
default_author: "阿龙Aloong"
default_theme: "default"    # default | elegant
accent_color: "#E67D22"
auto_cite: true             # 引用链接自动化
```

优先级：CLI 参数 > frontmatter > config.yaml > 默认值

## 发布流程

1. **写文章** — Markdown 格式，放在 `~/wechat-publisher/articles/<slug>/article.md`
2. **生成摘要** — Agent 读取全文后生成 100-120 字摘要（见下方「LLM 摘要生成」）
3. **生成封面** — 用 nano-banana-pro skill，使用标准封面风格（见下方）
4. **预览** — `wepub preview article.md`，浏览器查看排版效果
5. **登录** — `wepub login`（cookie 过期时需重新扫码）
6. **发布** — `wepub publish article.md --visible --author "阿龙Aloong" --digest "LLM生成的摘要"`
7. **手动设置封面** — 登录 mp.weixin.qq.com → 草稿箱 → 编辑 → 上传封面
8. **确认发布** — 在草稿箱中点击发布

## LLM 摘要生成

发布前，Agent 应使用自身能力为文章生成摘要，**不要截断开头文字**。

**要求**：
- **字数**：100-120 个中文字符
- **内容**：概括文章核心观点，突出最有价值的信息
- **风格**：吸引读者点击，但不夸张；使用陈述句
- **禁止**：不要用"本文介绍了..."开头，不要罗列所有要点

**步骤**：
1. 读取完整文章内容
2. 理解文章主题、核心论点和关键信息
3. 生成 100-120 字的中文摘要
4. 通过 `--digest "生成的摘要"` 传入发布命令

## 写作规范

### Markdown 格式

```markdown
---
title: 文章标题
author: 阿龙Aloong
digest: LLM生成的100-120字摘要
theme: default
accent_color: "#E67D22"
---

# 文章标题

正文内容...

> [!TIP]
> 使用 GFM Alert 语法创建提示框

---

## 引用链接

[1] 链接描述
https://example.com/full-url

[2] 链接描述
https://example.com/another-url
```

- 第一个 `# 标题` 会被自动提取为标题
- 代码块会被转换为微信兼容的内联样式
- 外部链接自动转为底部引用（启用 auto_cite 时），`mp.weixin.qq.com` 链接保持可点击
- 正文中的本地/远程图片会被自动处理（远程仅支持 HTTPS）
- **文章末尾必须包含「引用链接」章节**，列出正文中引用的链接，格式为：`[编号] 链接描述` 换行 `URL`
- **⚠️ 启用引用链接自动化（默认）时**，正文中的超链接会自动转为上标编号引用，引用链接章节自动生成，无需手动处理
- **如果禁用了引用链接自动化 (`--no-cite`)**，引用链接必须手动编写，格式如下：
  ```
  ## 引用链接

  [1] 链接描述
  https://example.com/full-url

  [2] 链接描述
  https://example.com/another-url
  ```

### 支持的富文本语法

| 语法 | 说明 |
|------|------|
| `> [!NOTE]` | 信息提示框（蓝色） |
| `> [!TIP]` | 技巧提示框（绿色） |
| `> [!IMPORTANT]` | 重要提示框（紫色） |
| `> [!WARNING]` | 警告提示框（黄色） |
| `> [!CAUTION]` | 危险提示框（红色） |
| `[text](url)` | 外部链接自动转底部引用 |
| `![alt](path)` | 本地/远程图片自动占位替换 |
| `**中文加粗**` | CJK 字符加粗兼容处理 |

### 高亮规范（重要）

正文高亮遵循以下规则，**保持文章干净、突出重点**：

- **普通段落正文不用 `**加粗**` 强调**——需要突出的技术术语 / 命令 / 字段名 / 文件名改用 **inline code（反引号）**，如 `SHA-256`、`F1`、`node:sqlite`、`.dmg`。
- **列表项开头当"子标题"用的引导词可以加粗**——如 `- **发文件**：选中文件 → 点发送`，引导词作小标题，这是允许的例外。
- **高亮只允许出现在**：标题（`#`/`##`/`###`）、引用块与 Alert 提示框（`>`、`> [!TIP]` 等）、inline code。
- 写完 `article.md` 自查：`grep -oE '\*\*[^*]+\*\*' article.md`——普通段落里的加粗应清掉或转 inline code，只有列表引导词的加粗可保留。

### 主题选择

| 主题 | 强调色 | 特点 |
|------|--------|------|
| `default` | 橙色 #E67D22 | h2 橙色左边框，blockquote 绿色左边框，经典风格 |
| `elegant` | 蓝色 #4A90D9 | h1 渐变背景，blockquote 蓝色左边框，精致风格 |

可通过 `--accent-color` 或 frontmatter `accent_color` 自定义强调色。

### 预览（必做）

写完文章后，**必须同时生成 `preview.html`** 供用户在浏览器中 review：

```bash
wepub preview articles/<slug>/article.md
# 生成 articles/<slug>/article.preview.html
# 同时复制一份为 articles/<slug>/preview.html
```

用户通过浏览器打开 preview.html 查看排版效果，确认无误后再发布。

## 封面图生成

使用 nano-banana-pro skill，**固定风格**：

密钥从环境变量读取，**不得把真实值写进本文件或任何命令示例**——写进来就会进 git 历史，而历史里的凭据靠改工作区是清不掉的。在 shell 配置或 `.env` 里导出 `GEMINI_API_KEY` 后再执行下面的命令。

```bash
uv run {nano-banana-pro-baseDir}/scripts/generate_image.py \
  --prompt "Sketch illustration, white background. [主体描述]. Colorful watercolor icons floating around: [图标列表]. Pencil sketch outlines with vibrant watercolor splashes on each icon. Simple, warm, hand-drawn style." \
  --filename "~/wechat-publisher/articles/<slug>/images/cover.png" \
  --resolution 1K
```

**风格要求**：
- 白色背景，铅笔素描轮廓
- 核心设备用笔记本/手机素描体现
- 每个图标用不同颜色水彩晕染（红、橙、绿、蓝、黄、粉等）
- 整体简约、丰富、温暖的手绘感
- 周围散布与文章主题相关的功能图标

**Prompt 模板**：根据文章主题替换 `[主体描述]` 和 `[图标列表]`。

⚠️ 2K 分辨率会导致内存不足被 SIGKILL，统一用 1K。

## 技术细节

如需修改发布逻辑，参考 [references/technical.md](references/technical.md)。

## 排版注意事项

- **全文左对齐**：主题中 `styles["p"]` 必须用 `text-align: left`，不要用 `justify`（两端对齐在微信中排版效果差）
- 标题（h1/h2/h3）已设为 `text-align: left`
- 参考资料区域也是 `text-align: left`
- 如需修改全局排版样式，编辑 `~/wechat-publisher/wepub/themes/default_theme.py` 或 `elegant_theme.py` 中的 `STYLES` 字典
- 新增主题请在 `~/wechat-publisher/wepub/themes/` 下创建文件并在 `base.py` 注册

## 代码块实现（重要）

代码块使用 **Pygments 语法高亮 + `<pre><code>` 原生标签**，这是微信兼容性最好的方案。

### 微信编辑器的坑（踩过的）

1. **空格会被吃掉**：微信 ProseMirror 粘贴 HTML 时会折叠连续空格，导致代码缩进丢失。**解决：所有空格替换为 `&nbsp;`，换行替换为 `<br/>`**
2. **`<table>` 布局会被重写**：微信编辑器粘贴时会给 table 加自己的样式（边框等），不能用 table 做行号布局
3. **`display:flex` 不可靠**：虽然编辑器保留了 flex 结构，但最终渲染（手机预览/发布）可能不生效
4. **行内代码样式会污染代码块**：`_apply_inline_styles` 中的 `<code>` 正则会匹配到 `<pre><code>` 里的 code 标签。**解决：代码块的 `<code>` 加临时标记 `data-block="1"`，行内代码正则跳过它，最后清理标记**

### 当前方案（方案3：纯高亮无行号）

- 外层 `<section>` 容器带背景色和圆角
- 语言标签栏（如 "JavaScript"、"Bash"）
- `<pre><code>` 内用 `<span style="color:...">` 做语法高亮（GitHub 配色）
- 无行号（行号方案在微信中布局不稳定）
- Pygments tokenize → 按 token 类型映射颜色（关键字红、字符串蓝、注释灰、函数名紫等）

### 其他尝试过但失败的方案

- **方案1（行号内嵌 `<pre><code>`）**：行号前缀 `1 |` 嵌在每行代码前，可行但视觉效果一般
- **方案2（section + flex 行号）**：参考 doocs/md 的 flex 布局，编辑器中看着对但手机预览行号横排

## 项目结构

```
~/wechat-publisher/wepub/
├── __init__.py
├── auth.py         # 登录模块
├── cli.py          # 命令行入口（--theme/--accent-color/--no-cite/--digest）
├── config.py       # 配置管理（YAML 配置 + cookie）
├── converter.py    # Markdown → HTML 转换（主题/alerts/引用/CJK/图片）
├── publisher.py    # Playwright 自动化发布（含图片占位替换）
└── themes/
    ├── __init__.py
    ├── base.py           # Theme 基类
    ├── default_theme.py  # 默认主题（橙色 #E67D22）
    └── elegant_theme.py  # 精致主题（蓝色 #4A90D9）
```

## 已知限制

- 封面图需手动在公众号后台上传（自动化被微信安全机制阻止）
- Cookie 约 6 小时过期，需重新扫码
- 个人订阅号无官方 API（2025.7 后被回收），只能走 Playwright 自动化
- 图片占位替换依赖剪贴板操作，建议使用 `--visible` 模式
- 远程图片仅支持 HTTPS（拒绝 HTTP，安全限制）
