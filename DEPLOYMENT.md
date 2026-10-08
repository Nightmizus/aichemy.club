# AIchemy 官网：阿里云部署交接

核对日期：2026-09-26。本文供后续接手部署的人或 AI 使用。

**2026-10-08 更新：官网服务器部署已完成，正式域名仍待 ICP 备案及 HTTPS 启用。** 当前版本为 `20261008T084617Z`，`/var/www/aichemy/current` 已指向发布目录，四个域名已解析到 `39.106.77.105`。公网 IP 可预览官网，但域名访问被阿里云备案系统拦截。详细验收、备份和收尾步骤见 [当前部署状态](DEPLOYMENT-STATUS.md)。再次执行本手册前重新检查实际状态；不要重复执行首次安装步骤。

本手册的打包步骤已在本地实跑：9 个 HTML 资源引用和 CSS 内字体路径均有效，源码 HTML 未改动；所有 Bash 示例通过语法检查。官网首页、资源 alias、旧登录回跳及保留根路径代理的分工，已用隔离的本地 Nginx 和模拟后端响应检查通过。这些检查不代替服务器上线及正式 HTTPS 验收。

## 1. 目标与现有服务

官网直接由现有 Nginx 托管，和 Hatchery 共用服务器、80/443 端口。官网是纯静态 HTML/CSS/JS，无构建步骤、业务后端或数据库；不需要安装 Node、运行 `npm start`、创建 systemd 服务或 Docker 容器。页面中的训练、GPU 等数值是浏览器动画，不会在服务器上训练模型。

| 项目 | 配置 |
| --- | --- |
| 阿里云公网 IP | `39.106.77.105` |
| 系统与规格 | Ubuntu 24.04，2 vCPU / 2 GiB，40 GiB 系统盘，另有 2 GiB swap |
| SSH | `ssh root@39.106.77.105`，端口 22 |
| 社团官网目标 | `https://aichemy.club/` |
| Hatchery 正式入口 | `https://aichemy.club/hatchery` |
| Hatchery 别名 | `hatchery.aichemy.club` 跳转到上述入口 |
| 已恢复的发布站点 | `taffy.aichemy.club`、`m0nesy.aichemy.club` |
| 官网源文件 | 当前工作区 `/mizusdev/AIchemy` |
| 官网部署目录（待创建） | `/var/www/aichemy/releases/<版本>/`，`current` 软链接指向当前版本 |
| Hatchery | `/opt/hatchery`，`hatchery.service`，监听 `127.0.0.1:4173` |
| 生效中的 Nginx 站点 | `/etc/nginx/sites-available/hatchery`，由 `sites-enabled` 引用 |
| 待启用的 HTTPS 配置模板 | `/etc/nginx/hatchery-https.template` |

SSH 密码由所有者私下提供，不写入仓库、命令示例或部署包。重装后已核对的 ED25519 主机指纹是 `SHA256:mP54AIqhmG477Yk4tPGbtWCFJsmtpRa99UuSZjpXlOU`；如果后续发生变化，先核对原因，不要直接关闭主机密钥检查。

只操作上表中的服务器。不要清空 `/opt/hatchery`、改写它的 `.env` 或重装 Nginx；官网无需访问 Neon、AI 服务密钥或原 Mac。Hatchery 的其他迁移边界见相邻项目的 [阿里云部署交接](../AIchemyHatchery/docs/ALIYUN-DEPLOYMENT.local.md)。

## 2. 共存路由：必须保留的约定

两个项目都有 `styles.css`。Hatchery 目前仍通过根路径加载 CSS、JS 和 API，因此不能把官网源码直接作为根路径的全部静态文件服务，也不能把现有 `location /` 改成官网的兜底页。

采用以下分工：

| 路径 / 域名 | 由谁处理 |
| --- | --- |
| `aichemy.club/` | 官网 `index.html` |
| `aichemy.club/club-assets/...` | 官网 CSS、JS、字体、二维码、favicon |
| `aichemy.club/hatchery`、`/hatchery/...` | Hatchery 控制台，代理到 4173 并去掉 `/hatchery` 前缀 |
| 原有 `/c/...` | 跳转到 `/hatchery/c/...`，保留已有行为 |
| `/api/...`、`/gallery`、`/preview/...`、`/ai-preview/...`、`/pages/...`、`/attachments/...` | 保留现有 Hatchery 代理 |
| `/styles.css`、`/mica.css`、`/ai-chat.css`、`/motion.css`、`/auth.js`、`/script.js`、`/viewer.js` | 保留现有 Hatchery 根路径资源 |
| `hatchery.aichemy.club` | 保留跳转，不托管官网 |
| 已发布网站的子域名 | 保留现有 Hatchery 站点路由 |

官网发布副本中的 HTML 资源地址改为 `/club-assets/...`，源文件仍保留 `./...`，方便本地预览。CSS 自己的 `./assets/...` 相对地址会自然解析到 `/club-assets/assets/...`。此映射使用 Nginx 的 [`alias` 指令](https://nginx.org/en/docs/http/ngx_http_core_module.html#alias)，路径两端的末尾斜杠均需保留。

官网将来增加后端或更多页面时，要另行规划路径；当前方案仅接管首页和 `/club-assets/`，不能直接占用 `/api/` 或把所有未知地址回退到首页。

## 3. 本地检查与打包

以下命令在保存本项目的 Linux / Bash 工作区执行，需要 Python 3、tar、SSH。`npm run check` 只用于本地 JavaScript 语法检查，不要求服务器安装 Node。

```bash
cd /mizusdev/AIchemy
npm run check
```

只打包 `index.html`、`styles.css`、`app.js`、`furnace.js`、`stardust.js`、`favicon.svg` 和 `assets/`。当前这些文件合计约 367 KiB。字体授权文件随 `assets/` 保留；不上传 `poster/`、开发服务器、文档、`.git`、`.env` 或备份。新增资产后先检查 `assets/` 中仍全部是允许公开的文件。

```bash
set -euo pipefail
cd /mizusdev/AIchemy
export AICHEMY_RELEASE="$(date -u +%Y%m%dT%H%M%SZ)"
export AICHEMY_STAGING="$(mktemp -d /tmp/aichemy-site.XXXXXX)"
export AICHEMY_ARCHIVE="/tmp/aichemy-${AICHEMY_RELEASE}.tar.gz"

python3 - <<'PY'
import os
import re
import shutil
from pathlib import Path

source = Path.cwd()
staging = Path(os.environ['AICHEMY_STAGING'])
for name in ('index.html', 'styles.css', 'app.js', 'furnace.js', 'stardust.js', 'favicon.svg'):
    shutil.copy2(source / name, staging / name)
shutil.copytree(source / 'assets', staging / 'assets')
index = staging / 'index.html'
html = index.read_text(encoding='utf-8')
html, count = re.subn(r'''((?:src|href)=["'])\./''', r'\1/club-assets/', html)
if count == 0:
    raise SystemExit('未找到相对资源地址；请检查 HTML 后再发布')
index.write_text(html, encoding='utf-8')
print(f'已转换 {count} 个 HTML 资源引用，发布版本：{os.environ["AICHEMY_RELEASE"]}')
PY

tar -czf "$AICHEMY_ARCHIVE" -C "$AICHEMY_STAGING" .
sha256sum "$AICHEMY_ARCHIVE" > "$AICHEMY_ARCHIVE.sha256"
tar -tzf "$AICHEMY_ARCHIVE"
scp "$AICHEMY_ARCHIVE" "$AICHEMY_ARCHIVE.sha256" root@39.106.77.105:/tmp/
printf '服务器步骤中的 AICHEMY_RELEASE 填写：%s\n' "$AICHEMY_RELEASE"
```

转换只处理当前 HTML 的 `src`、`href` 相对地址。将来增加 `srcset`、CSS 内联图片或 JavaScript 动态加载资源时，需要相应更新发布流程；不要假定脚本会自动处理所有新引用。

## 4. 服务器准备与备份

通过 SSH 登录，在同一个远程 Bash 会话中完成后续服务器命令。先把版本变量改成上一步打印的值，不要重新生成时间戳。

```bash
ssh root@39.106.77.105
```

```bash
set -euo pipefail
AICHEMY_RELEASE='替换为本次打包版本'
[[ "$AICHEMY_RELEASE" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]
AICHEMY_BACKUP="/var/backups/aichemy/pre-deploy-${AICHEMY_RELEASE}"

systemctl is-active hatchery nginx
nginx -t
systemctl list-timers hatchery-https-bootstrap.timer certbot.timer --no-pager
test ! -e "$AICHEMY_BACKUP"
install -d -m 700 "$AICHEMY_BACKUP"
systemctl is-enabled hatchery-https-bootstrap.timer > "$AICHEMY_BACKUP/bootstrap-enabled.txt" || true
```

**先暂停 HTTPS 首次启用任务。** 它会将 HTTPS 模板整份覆盖到当前 Nginx 配置，仅修改生效文件会在 DNS 就绪时丢失官网配置。下面等待已经启动的任务结束，再备份它最终留下的配置。不要停用负责正常续期的 `certbot.timer`。

```bash
systemctl stop hatchery-https-bootstrap.timer
while systemctl is-active --quiet hatchery-https-bootstrap.service; do
    sleep 2
done
cp -a /etc/nginx/sites-available/hatchery "$AICHEMY_BACKUP/nginx-active.conf"
cp -a /etc/nginx/hatchery-https.template "$AICHEMY_BACKUP/nginx-https.template"
readlink /var/www/aichemy/current > "$AICHEMY_BACKUP/previous-release.txt" || true
if test -f /var/lib/hatchery-https-bootstrap/complete.json; then
    cp -a /var/lib/hatchery-https-bootstrap/complete.json "$AICHEMY_BACKUP/https-complete.json"
fi
sha256sum -c "/tmp/aichemy-${AICHEMY_RELEASE}.tar.gz.sha256"
install -d -m 755 /var/www/aichemy/releases
test ! -e "/var/www/aichemy/releases/${AICHEMY_RELEASE}"
install -d -m 755 "/var/www/aichemy/releases/${AICHEMY_RELEASE}"
tar --no-same-owner -xzf "/tmp/aichemy-${AICHEMY_RELEASE}.tar.gz" \
    -C "/var/www/aichemy/releases/${AICHEMY_RELEASE}"
find "/var/www/aichemy/releases/${AICHEMY_RELEASE}" -type d -exec chmod 755 {} +
find "/var/www/aichemy/releases/${AICHEMY_RELEASE}" -type f -exec chmod 644 {} +
ln -s "/var/www/aichemy/releases/${AICHEMY_RELEASE}" "/var/www/aichemy/.current-${AICHEMY_RELEASE}"
mv -Tf "/var/www/aichemy/.current-${AICHEMY_RELEASE}" /var/www/aichemy/current
```

发布目录保持 root 所有、Nginx 只读即可。不要使用 `chmod 777`。已有 `current` 如果是实体目录而非软链接，应先查明来源，上述原子切换命令不应用于覆盖实体目录。

## 5. 修改 Nginx：同时修改生效配置和 HTTPS 模板

查看 `/etc/nginx/sites-available/hatchery` 的实际内容。当前 HTTP 阶段是 `server_name aichemy.club 39.106.77.105` 的 server 提供主站内容；HTTPS 完成后则是 `listen 443 ssl` 且 `server_name aichemy.club` 的 server 提供内容。

在**提供主站内容的现有 server** 中加入 `root` 与下面三个 location。删除该 server 原来的 `location = /` 和 `location = /index.html` 两个跳转块，再换成这里的同名块，避免重复定义。其他已有 location、listen、server_name、TLS 配置和 proxy include 均保留。

```nginx
# 放在现有主站内容 server { ... } 内，不是独立 server。
root /var/www/aichemy/current;

location = / {
    # Hatchery 的预览登录链接仍可能使用 /?returnTo=...。
    # 只把这类旧登录入口送回控制台；普通首页请求展示官网。
    if ($arg_returnto != "") {
        return 302 /hatchery$is_args$args;
    }
    try_files /index.html =404;
    add_header Cache-Control "no-cache";
}

location = /index.html {
    return 302 /$is_args$args;
}

location ^~ /club-assets/ {
    alias /var/www/aichemy/current/;
    autoindex off;
    add_header Cache-Control "no-cache";
}
```

使用 `no-cache` 让浏览器重新验证文件，避免固定的 `?v=blast-5` 使后续发布长期保留旧 CSS/JS。这里的公开目录只包含审核过的发布文件；不要向里面放密钥或源码备份。

以下原有路由必须继续存在，特别是最后的根路径代理。原站点已经有这些块，不要重复添加：

```nginx
location ^~ /.well-known/acme-challenge/ { root /var/www/letsencrypt; }
location ~ /\. { deny all; }
location /c/ { return 308 /hatchery$request_uri; }
location = /hatchery { proxy_pass http://127.0.0.1:4173/; }
location /hatchery/ { proxy_pass http://127.0.0.1:4173/; }
location / { proxy_pass http://127.0.0.1:4173; }
```

然后在 `/etc/nginx/hatchery-https.template` 中对 **443 的 `server_name aichemy.club` 内容块**进行完全相同的修改。模板内其他 HTTP 重定向块、`hatchery.aichemy.club` 别名块以及 `taffy`、`m0nesy` 发布站点块保留。不要全文件替换 `/hatchery`，也不要新增第二个同域名 server 与现有配置争抢请求。

```bash
diff -u "$AICHEMY_BACKUP/nginx-active.conf" /etc/nginx/sites-available/hatchery || true
diff -u "$AICHEMY_BACKUP/nginx-https.template" /etc/nginx/hatchery-https.template || true
nginx -t
systemctl reload nginx
```

`nginx -t` 只检查当前生效配置，不会检查尚未启用的模板。若仍处于 HTTP 阶段，不能把引用尚不存在证书的模板直接启用；核对两份补丁一致，后续 HTTPS 自动启用时还会先检查配置，失败会回退旧配置。已有正式证书时可在隔离的 Nginx 测试配置中检查模板。

## 6. Hatchery 入口兼容检查

上线官网前修复并核对以下已知入口：

- 相邻 Hatchery 项目的 `server.py` 中，Gallery 页“← 回到控制台”的链接目前是 `href="/"`。将**该链接**改成 `href="/hatchery"`，同时同步本地源码与服务器 `/opt/hatchery/server.py`；只改链接，不替换其他站点模板中的根路径。修改前备份该文件，运行 Python 语法检查，修改后重启 `hatchery.service` 并确认恢复 200。
- `frontend/viewer.js` 中的旧登录入口是 `/?returnTo=...`，上面的 Nginx 查询参数跳转用于兼容它；实际浏览器验证跳到 `/hatchery?returnTo=...` 且登录后可回到原预览页。若选择在源码中直接更新登录入口，也应保留旧链接兼容。
- Hatchery 已有 `/hatchery` 前缀下的聊天地址修复；不要覆盖当前 `frontend/script.js` 和 `frontend/index.html` 为旧备份版本。测试新聊天、切换聊天、刷新深链接。
- 将来启用 SSO 时，单独核对其默认回跳地址；已有迁移尚未完成 SSO 端到端验收。官网本身不需要新增登录系统。

如果需要上述 Gallery 修复，可先执行以下备份与检查；实际编辑只针对明确的链接：

```bash
cp -a /opt/hatchery/server.py "$AICHEMY_BACKUP/hatchery-server.py"
# 编辑本地源码，并同步对应改动到 /opt/hatchery/server.py 后：
/opt/hatchery/.venv/bin/python -c 'import ast; from pathlib import Path; ast.parse(Path("/opt/hatchery/server.py").read_text(encoding="utf-8"))'
systemctl restart hatchery
systemctl is-active hatchery
curl --fail --silent --show-error -o /dev/null http://127.0.0.1:4173/
```

服务恢复可能需要数秒；检查失败时先看 `journalctl -u hatchery -n 60 --no-pager`，不要以未就绪状态继续验收。

## 7. 域名、HTTPS 与自动任务

正式开放需要以下四个名称的 A 记录指向 `39.106.77.105`：

| 类型 | aichemy.club 内的名称 | 值 |
| --- | --- | --- |
| A | `@` | `39.106.77.105` |
| A | `hatchery` | `39.106.77.105` |
| A | `taffy` | `39.106.77.105` |
| A | `m0nesy` | `39.106.77.105` |

本方案直接连接阿里云，不使用 Cloudflare Tunnel 或 Worker。若权威 DNS 仍在 Cloudflare，可以只保留其 DNS 管理，将这四条设为 DNS only（灰云），并清理这些名称冲突的旧 CNAME/A/AAAA。不要顺带删除其他业务的解析、Worker 或凭据。只修改配置文件或删除 Worker 都不等于完成 DNS 切换。

公网 80/443 已在前次部署中验证可达；应用 4173 保持仅回环监听。部署时重新检查安全组和本机防火墙，不需要开放 3000 或 4173。

官网与 Hatchery 的 HTTP 验收通过、两份 Nginx 配置都修改后，若原先启用了 bootstrap timer 且尚未完成 HTTPS，则恢复任务：

```bash
if grep -qx enabled "$AICHEMY_BACKUP/bootstrap-enabled.txt" \
    && ! test -f /var/lib/hatchery-https-bootstrap/complete.json; then
    systemctl enable --now hatchery-https-bootstrap.timer
fi
systemctl list-timers hatchery-https-bootstrap.timer certbot.timer --no-pager
journalctl -u hatchery-https-bootstrap -n 30 --no-pager
```

`/usr/local/sbin/hatchery-enable-https.py` 每约两分钟检查上述四个名称，只有它们解析出的地址集合都为本机 IPv4 才尝试 HTTP-01 签发；残留旧 IPv6 也会阻止开始。失败后有一小时重试间隔，不要高频强制签发。

成功后证书位于 `/etc/letsencrypt/live/hatchery-aichemy/`，加载修改后的 HTTPS 模板，写入 `/var/lib/hatchery-https-bootstrap/complete.json`，并停用 bootstrap timer。后续由 `certbot.timer` 续期，续期 hook 只检查并 reload Nginx，不会整份覆盖配置。HTTPS 完成后**重新检查官网和 Hatchery**，确认没有被旧模板覆盖。

当前证书计划只覆盖上述四个名称，没有通配符证书；新增任意发布站点的子域名还需要配置 DNS 和证书覆盖。

## 8. 验收

DNS 切换前可在本地用 `--resolve` 定向到新服务器验证 HTTP；此时不要通过 HTTP 输入真实账号密码。

```bash
curl --fail --resolve aichemy.club:80:39.106.77.105 http://aichemy.club/ -o /tmp/aichemy-home-check.html
curl --fail --resolve aichemy.club:80:39.106.77.105 http://aichemy.club/club-assets/styles.css -o /tmp/aichemy-style-check.css
curl --fail --resolve aichemy.club:80:39.106.77.105 http://aichemy.club/styles.css -o /tmp/hatchery-style-check.css
curl -I --resolve aichemy.club:80:39.106.77.105 'http://aichemy.club/?returnTo=%2Fgallery'
curl -I --resolve aichemy.club:80:39.106.77.105 http://aichemy.club/hatchery
curl -I --resolve hatchery.aichemy.club:80:39.106.77.105 http://hatchery.aichemy.club/
```

HTTP 已切到 HTTPS 后，主站 HTTP 返回 308 是正常现象；使用相应的 `https://...` 和 `--resolve aichemy.club:443:39.106.77.105` 再验证。不要通过 `-k` 忽略证书错误来宣布 HTTPS 验收成功。

| 检查 | 预期 |
| --- | --- |
| `/` 普通访问 | 200，标题含“炼丹社 AIchemy”，呈现像素炉官网 |
| `/club-assets/styles.css` 与 `/styles.css` | 都为 200，前者是官网 CSS，后者仍是 Hatchery CSS，不能是 HTML |
| 官网 JS、字体、二维码与 favicon | 请求 200，内容类型正确，二维码可打开原图 |
| `/hatchery` | 原登录/控制台页面，样式正常 |
| `/hatchery/c/<实际会话 ID>` | 刷新、切换聊天仍停留在控制台 |
| `/?returnTo=%2Fgallery` | 302 到 `/hatchery?returnTo=%2Fgallery`；登录回跳单独验证 |
| `/gallery` | 原页面正常，“回到控制台”指向 `/hatchery` |
| 未登录 `/api/auth/me` | 原有 401 JSON，不能变成官网 HTML |
| `/club-assets/not-found.js` | 404，不能回退成首页 |
| `/.env` | 403，不能暴露配置 |
| Hatchery 别名 | 跳转到 `https://aichemy.club/hatchery` |
| `taffy`、`m0nesy` 子域名 | 原站点内容，不显示社团首页 |
| 公网 HTTPS | 四个域名证书均有效，HTTP 跳 HTTPS 后官网与应用仍正常 |

用浏览器检查桌面、手机布局、滚动导航、暂停动画和二维码；控制台不应有新的异常或资源 404，也不应每 1.5 秒请求 `/_aichemy/revision`（那是开发服务器注入的刷新逻辑）。旧主页曾返回 308，浏览器可能缓存跳转；必要时用无痕窗口与 curl 区分旧缓存和服务器问题。

已知 `taffy` 的旧视频文件缺失会 404，原 Mac 部分运行数据也尚未取回；这些是 Hatchery 既有迁移缺项，不代表本次官网部署新引入故障。发布完成后记录版本、文件哈希、解析/证书状态及上述验收结果。

## 9. 更新、回滚与排查

后续仅更新官网内容时，重复打包、校验、上传并切换 `current` 即可；无需重启 Hatchery 或 Nginx。每次保留前一个版本和发布记录；不要在仍需回滚时删除旧目录。首次共存改造才需要修改 Nginx 和相关控制台入口。

内容回滚：先确认上一版目录仍存在，再在服务器同一会话执行。`AICHEMY_BACKUP` 应指向要撤销的那次发布备份。

```bash
AICHEMY_PREVIOUS="$(cat "$AICHEMY_BACKUP/previous-release.txt")"
test -n "$AICHEMY_PREVIOUS"
test -d "$AICHEMY_PREVIOUS"
ln -s "$AICHEMY_PREVIOUS" "/var/www/aichemy/.rollback-${AICHEMY_RELEASE}"
mv -Tf "/var/www/aichemy/.rollback-${AICHEMY_RELEASE}" /var/www/aichemy/current
```

首次部署没有上一版，或需撤销路由改造时：暂停 bootstrap timer 并等待 service 结束，恢复 Nginx 生效文件和 HTTPS 模板的备份，`nginx -t` 成功后 reload。恢复后首页应重新跳转到 Hatchery。**如果期间已经从 HTTP 切换到 HTTPS，不要直接覆盖为旧 HTTP 配置**；保留当前证书与 TLS 结构，只撤销主站 `root`、官网 alias 和首页 location 的改动，把 `/`、`/index.html` 恢复为 `308 /hatchery$is_args$args`，模板也同步撤销。不删除证书或续期任务。

如果同时修改了 Gallery 链接，可保留指向 `/hatchery` 的兼容链接；确需撤销该源码改动时，先确认备份后没有其他更新，再同步回退本地和服务器文件、检查语法并重启 Hatchery。恢复 bootstrap timer 时仍按第 7 节的原状态与完成标记判断。

```bash
systemctl status nginx hatchery --no-pager
nginx -t
journalctl -u nginx -n 50 --no-pager
journalctl -u hatchery -n 60 --no-pager
journalctl -u hatchery-https-bootstrap -n 30 --no-pager
tail -n 50 /var/log/nginx/error.log
readlink -f /var/www/aichemy/current
```

常见定位：官网串样式先看资源是否走 `/club-assets/`；Hatchery 串样式先看根资源是否仍代理到 4173；HTTPS 后首页又跳回控制台先检查模板是否同步；官方域名不通但 `--resolve` 正常先查 DNS。官网部署不涉及清理原 Mac、撤销旧密钥或删除 Neon 数据。
