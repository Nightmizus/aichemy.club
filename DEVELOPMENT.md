# AIchemy 开发交接

这是一页炼丹社 AIchemy 的像素风官网。页面把“炼丹”表现为训练模型：中央是全屏工业高炉动画，周围有训练监测窗口，向下滚动后进入服务、活动、加入社团和社区板块。

## 快速开始

项目没有构建步骤，也不依赖外部服务。需要 Node.js 运行本地预览：

```bash
cd /mizusdev/AIchemy
npm run dev
```

然后打开 <http://localhost:3000/>。需要换端口时使用 `npm run dev -- --port 8080`。

本地开发服务器会给 CSS、JS 加内容版本号，并轮询文件变化自动刷新；部署到服务器的 HTML 不包含这个本地刷新逻辑。

## 主要文件

| 文件 | 作用 |
| --- | --- |
| `index.html` | 首页结构、标题、三个悬浮导航窗口，以及四个下滑板块：服务、活动、加入社团、社区 |
| `styles.css` | 像素字体、全屏布局、悬浮窗口、滚动导航、下滑板块和移动端适配 |
| `furnace.js` | Canvas 像素动画；默认是工业高炉，也保留 `?furnace=cauldron` 丹炉对照模式 |
| `furnace3d.js` | 首屏可切换的 3D 点阵八卦炉动画，与像素动画共用时钟、暂停状态，并使用独立的 `#hero-3d` WebGL 画布 |
| `app.js` | 训练数据模拟、窗口动画、暂停按钮、标题滚动收拢和导航状态 |
| `server.mjs` | 仅用于本地预览的 Node 静态服务器 |
| `assets/` | 本地字体、字体授权文件和社长微信二维码原图 |
| `poster/` | 独立海报项目，不参与网页首页运行 |
| `README.md` | 页面设计与功能说明 |
| `DEPLOYMENT.md` | 阿里云服务器、Nginx、Hatchery 共存和发布操作手册 |
| `DEPLOYMENT-STATUS.md` | 当前服务器版本、域名备案和 HTTPS 状态 |

## 当前页面结构

- 首屏 `#top`：全屏 Canvas 高炉场景，标题为“炼丹社 AIchemy”，副标题为“硬核AI研究社团@sdsz”。
- `#services`：服务列表当前有 `./hatchery`，显示“炼丹社 Hatchery AI 建站”，链接到现有 Hatchery 入口。
- `#activities`：社团活动占位板块，之后可替换活动列表。
- `#join`：社长微信二维码，原图完整显示，不要裁切或替换成重新生成的图片。
- `#community`：友社和友链。友社是 `ht2.club`；友链顺序是 `groovin.cn`、`mizusumi.com`。

首次打开且没有保存偏好时默认显示 3D 八卦炉；用户选择 PIXEL 后会保留该选择。

标题在滚动到页面顶部前保持原位置；触碰顶部后才缩小并移动到左上角，导航栏随之出现。首屏四个监测窗口和底部三个导航窗口属于现有视觉核心，修改时要保留全屏动画、桌面窗口散落布局和像素风格。3D 模式的标题独立放在动画上方，`furnace3d.js` 根据标题与底部导航之间的空间计算场景尺寸，并用 `--title-3d-home-top` 把标题位置交给 `app.js`；PIXEL 继续使用原有的 `--title-home-top`。手机 3D 模式的四个监测窗口移至主体下方，低高度横屏隐藏装饰性三维标注。

## 修改约定

页面是纯静态源码。新增网页公开资源放入 `assets/`，源码里使用相对路径，例如 `./assets/example.png`；正式发布时打包脚本会把官网资源改为 `/club-assets/`。不要把 `poster/`、开发截图、文档或本地预览代码放进公开资源目录。

官网和 Hatchery 共用同一台服务器。不要把首页所有未知路径改成官网兜底，也不要占用 `/api/`、`/gallery`、`/preview/` 等 Hatchery 路由。`./hatchery` 应继续指向服务器现有的 `/hatchery` 入口。涉及 Nginx 或发布包时，先阅读 `DEPLOYMENT.md`。

本地改动完成后，至少检查 JavaScript 语法：

```bash
npm run check
```

再用桌面和窄屏浏览器查看首屏、滚动标题、三个底部导航窗口、二维码和社区模块。项目没有自动化构建流程；不要为了简单内容修改引入框架或外部 CDN。

## 当前部署状态

- IP 临时预览：<http://39.106.77.105/>
- 当前发布版本：`20261009T010217Z`
- 官网源码发布到 `/var/www/aichemy/current`，Nginx 和 Hatchery 均正常运行。
- `aichemy.club` 已解析到服务器，但用户确认尚未完成 ICP 备案；HTTP 会被阿里云备案拦截，HTTPS 证书和 443 尚未启用。
- 不要把备案拦截误判为网页资源加载错误；正式域名恢复前用 IP 入口验收页面。

接手时先阅读本文件、`README.md` 和 `DEPLOYMENT-STATUS.md`。需要修改服务器或重新发布时，再完整阅读 `DEPLOYMENT.md`；部署凭据不保存在工作区。
