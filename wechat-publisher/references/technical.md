# WeChat Publisher 技术细节

## 项目结构

```
~/wechat-publisher/
├── wepub/
│   ├── __init__.py
│   ├── auth.py          # Playwright QR 登录，cookie 持久化
│   ├── cli.py           # CLI 入口：login/check/preview/publish
│   ├── config.py        # 配置管理，cookie 存储路径
│   ├── converter.py     # Markdown → 微信兼容 HTML（内联 CSS）
│   └── publisher.py     # Playwright 自动化填充编辑器并保存草稿
├── articles/            # 文章目录，每篇文章一个子目录
│   └── <slug>/
│       ├── article.md
│       ├── article.preview.html
│       └── images/
└── .venv/               # Python 虚拟环境
```

## 关键技术发现（2026-03-02）

### 编辑器 URL 必须带 token

登录后台首页后，从 URL 提取 `token` 参数：
```python
token = re.search(r'token=(\d+)', page.url).group(1)
edit_url = f"https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=77&lang=zh_CN&token={token}"
```

不带 token 的 URL 页面会加载但编辑器不渲染。

### ProseMirror 编辑器

微信新版编辑器使用 ProseMirror（class=`.ProseMirror`），不是旧版 UEditor iframe。

直接修改 `innerHTML` **不会被编辑器内部状态感知**。正确方式是通过 `ClipboardEvent('paste')` 模拟粘贴：

```javascript
const dt = new DataTransfer();
dt.setData('text/html', htmlContent);
const pasteEvent = new ClipboardEvent('paste', {
    bubbles: true, cancelable: true, clipboardData: dt
});
document.querySelector('.ProseMirror').dispatchEvent(pasteEvent);
```

### 标题

标题输入框是 `textarea#title`，直接 `fill()` 即可。

### 弹窗处理

页面加载后可能弹出"小店返佣商品"等弹窗，需自动关闭：
- 查找「稍后再说」「我知道了」「关闭」等按钮并点击

### 封面上传（未完成）

封面区域 DOM：`div.js_cover_btn_area`（右侧面板 x≈579, y≈400）

尝试过的方式：
- ❌ `expect_file_chooser` + click — 点击不触发原生 file chooser
- ❌ 直接 `set_input_files` 到隐藏 file input — 那个 input 是正文插图的
- ❌ `DragEvent('drop')` — Chromium 安全限制，构造的 DataTransfer 被忽略

封面目前需要手动在公众号后台上传。

### 保存草稿

通过 JS 查找文字为"保存为草稿"的可见元素并点击：
```javascript
const all = document.querySelectorAll('a, button, span, div');
for (const el of all) {
    if (el.textContent.trim() === '保存为草稿' && el.offsetParent !== null) {
        el.click(); break;
    }
}
```

## 微信公众号后台 URL

- 首页: `https://mp.weixin.qq.com/cgi-bin/home?t=home/index&lang=zh_CN`
- 编辑器: `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=77&lang=zh_CN&token={token}`

## Converter (Markdown → HTML)

`converter.py` 将 Markdown 转为微信兼容 HTML：
- 所有 CSS 必须内联（微信过滤 `<style>` 标签）
- 代码块用 `<pre>` + inline background/padding
- 表格转为 inline-styled `<table>`
- 外部图片 URL 会被微信过滤，不要使用

## 依赖

```
playwright (chromium)
markdown
pymdown-extensions
```

安装: `cd ~/wechat-publisher && uv sync && .venv/bin/playwright install chromium`
