# AIchemy 部署状态

核对时间：2026-10-08 02:48（America/Denver）。

服务器部署已完成。`aichemy.club` 尚未正式开放：域名已正确解析，但用户确认尚未完成 ICP 备案，阿里云实际返回 `403 / Non-compliance ICP Filing`。HTTPS 尚未签发，443 尚未监听。

## 当前发布

| 项目 | 当前值 |
| --- | --- |
| 服务器 | `39.106.77.105` |
| IP 临时预览 | `http://39.106.77.105/` |
| 正式目标 | `https://aichemy.club/` |
| 版本 | `20261008T084617Z` |
| 发布目录 | `/var/www/aichemy/releases/20261008T084617Z` |
| 当前软链接 | `/var/www/aichemy/current` |
| 部署前备份 | `/var/backups/aichemy/pre-deploy-20260926T081833Z` |
| 服务器发布记录 | 上述备份目录内的 `deployment-status.json`、`release-manifest.json` |
| 本地发布包 | `/tmp/aichemy-20261008T084617Z.tar.gz` |
| 本地验收截图与补丁 | `/tmp/aichemy-deploy-20261008T084617Z/` |

发布包 SHA-256：`a2ca6cbf5b6794d661808884b3f15d3af4e8ea7a00d844670b1405a99925416b`。

只发布官网 HTML、CSS、JS、favicon、字体及授权文件、微信二维码原图，共 11 个文件。发布副本的 9 个资源引用改为 `/club-assets/`，CSS 与脚本版本号使用本次版本。源码仍使用本地相对地址；未上传开发服务器、海报、文档或凭据。

## 已完成与验证

- 2026-09-27 内容更新已发布：社区模块的友社简介改为“装机 · 回收 · CS 赛事 · 社区”，友链顺序调整为 `groovin.cn`、`mizusumi.com`，并移除重复的“访问友社网站/访问友链网站”文案。三条简介根据对应网站当前公开页面整理。
- 2026-09-29 内容更新已发布：服务列表新增 `./hatchery`，名称为“炼丹社 Hatchery AI 建站”，链接至 Hatchery 服务入口。
- 2026-09-29 内容更新已发布：Hatchery 服务条目的状态按钮改为“敬请期待”。
- 2026-10-08 内容更新已发布：新增 PIXEL / 3D 首屏切换，3D 点阵星核脚本随官网资源部署。
- 当前 Nginx 配置和 `/etc/nginx/hatchery-https.template` 同步加入官网首页及 `/club-assets/`；原 Hatchery 根资源、API、预览、子域名代理保留。修改前实际配置哈希与交接快照一致。
- 11 个远程发布文件逐一通过 SHA-256 校验。官网 HTML/JS/CSS、字体、二维码和 favicon 内容及类型正确。
- `/` 为官网；`/club-assets/styles.css` 为官网样式；`/styles.css` 仍是 Hatchery 样式。缺失官网资源返回 404，`/.env` 返回 403。
- Gallery 的“回到控制台”链接从 `/` 改为 `/hatchery`，本地和服务器 `server.py` 同步；改动前有备份，Python 语法检查通过，Hatchery 重启后健康检查通过。原有 `frontend/index.html` 与 `frontend/script.js` 未覆盖。
- `/hatchery`、聊天深链接、`/gallery` 均正常；旧 `/?returnTo=...` 保留 302 兼容；未登录 `/api/auth/me` 保留 401 JSON。
- 在服务器回环入口按 Host 验证，`hatchery.aichemy.club` 保留跳转，`taffy` 与 `m0nesy` 返回原发布站点。由于公网域名备案拦截，子域名公网 HTTPS 尚不能验收。
- 公网 IP 浏览器验证桌面 1440×900、手机 390×844：像素字体、标题碰顶后向左收拢、导航跳转、完整二维码均正常；无未捕获脚本异常、资源 404 或 `/_aichemy/revision` 开发刷新请求。
- 公网 IP 下 Gallery 点击返回 Hatchery，控制台与聊天深链接页面正常渲染。未使用实际用户账号验证登录后会话与发布流程，未创建测试账号或用户内容。
- Nginx 当前配置校验通过；HTTPS 模板已在独立的本地 Nginx 环境用临时测试证书检查语法，该证书没有用于生产且检查后已删除。
- `nginx` 和 `hatchery` 为 active；Hatchery 仍只监听 `127.0.0.1:4173`。未新增官网进程、容器或公开端口。

## 域名与证书待办

工作区与服务器解析均确认以下四个名称仅返回 `39.106.77.105`：

- `aichemy.club`
- `hatchery.aichemy.club`
- `taffy.aichemy.club`
- `m0nesy.aichemy.club`

公网 `http://aichemy.club/` 返回阿里云备案拦截页，`https://aichemy.club/` 连接被拒绝。用户已确认尚未完成备案，不能将当前状态报告为正式域名上线成功。阿里云说明见 [备案阻断排查](https://help.aliyun.com/zh/icp-filing/basic-icp-service/support/web-site-suddenly-appeared-for-the-record-to-block-or-hang-and-so-on-and-so-forth)。

为避免备案拦截期间反复向 CA 发起失败请求，`hatchery-https-bootstrap.timer` 已停用并禁用开机启动；部署前状态为 enabled，已记录在备份目录的 `bootstrap-enabled.txt`。`certbot.timer` 保持 enabled。未签发正式证书、未启用 HTTPS 配置、未创建 HTTPS 完成标记。

等待原因另记录于 `/var/lib/hatchery-https-bootstrap/website-waiting-for-icp.json`。这是说明文件，不替代 bootstrap 脚本已有的 `complete.json`。

完成阿里云网站 ICP 备案并确认公网四个域名不再被拦截后，在服务器恢复首次 HTTPS 任务：

```bash
nginx -t
systemctl enable --now hatchery-https-bootstrap.timer
systemctl start hatchery-https-bootstrap.service
journalctl -u hatchery-https-bootstrap -n 40 --no-pager
```

任务只有在四个名称解析出的地址集合正确时才签发；失败后有一小时冷却，勿高频重试。成功后自动应用已包含官网路由的 HTTPS 模板，停止首次任务，日常续期由 `certbot.timer` 负责。

随后按 [部署手册的验收表](DEPLOYMENT.md#8-验收) 用真实公网域名核验 HTTPS、官网与 Hatchery；不得通过忽略证书错误宣布完成。备案所要求的主体资料及页面展示内容待用户完成备案后另行核对，本次未编造备案号。

## 回滚

本次为首次官网部署，没有上一版官网软链接。当前备份保留 Nginx 生效配置、HTTPS 模板、Hatchery 原 `server.py` 和原 timer 状态。若撤销，在确认期间没有其他更新后按 [首次部署回滚步骤](DEPLOYMENT.md#9-更新回滚与排查) 恢复配置；不要将今后已启用的 HTTPS 配置直接覆盖成旧 HTTP 配置。

本地与服务器 `server.py` 当前 SHA-256：`25935ea14c9be64c9ae98942e3fdec28e3d7075e6faf92b2fb0eb3c6a82c7cf8`。
