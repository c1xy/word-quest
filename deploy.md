# 📴 部署与离线游玩指南

游戏是纯静态网页，任何静态托管都能跑。推荐 **GitHub Pages**（https、免费、手机可安装 PWA 离线玩）。

## 方式一：GitHub Pages（推荐，已配置好）

1. 把整个 `word-quest` 文件夹推送到 GitHub 仓库（或用 `gh repo create word-quest --public --source . --push`）
2. 仓库 Settings → Pages → Source 选 `main` 分支 / root，保存
3. 约 1 分钟后访问 `https://你的用户名.github.io/word-quest/`
4. 手机浏览器打开该地址 → 菜单 →「添加到主屏幕 / 安装应用」
5. 之后**断网也能玩**（Service Worker 已缓存全部文件）

> 更新词库或代码后重新 `git push` 即可，玩家端刷新即得最新版（SW 网络优先策略）。

## 方式二：Netlify Drop（不想用 Git）

1. 打开 https://app.netlify.com/drop
2. 把 `word-quest` 文件夹拖进去，几秒后得到一个 https 地址
3. 手机安装方式同上

## 方式三：电脑开热点/同 WiFi 局域网玩（无需注册）

1. 双击 `启动本地服务.bat`（或在此目录运行 `python -m http.server 8931`）
2. 手机浏览器访问 `http://电脑局域网IP:8931`（IP 用 `ipconfig` 查看 IPv4 地址）

> 注意：局域网 http 不是安全上下文，手机端**离线缓存不可用**，仅在线玩；离线请用方式一/二。

## 注意事项

- 手机端的进度存在手机浏览器里；电脑和手机进度**不互通**，需要迁移时用游戏内「设置 → 导出/导入存档」
- iOS 需 Safari「添加到主屏幕」；Android Chrome 会提示「安装应用」
