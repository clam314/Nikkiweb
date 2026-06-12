# NIKKE Spine Player

纯静态 NIKKE Spine 播放页，可以直接托管到 GitHub Pages。

## 当前资源

- 本地播放器：`vendor/spine-player-4.0.30/spine-player.js`
- 本地播放器：`vendor/spine-player-4.1/spine-player.js`
- 本地样式：`vendor/spine-player-4.0.30/spine-player.css`
- 远程索引：运行时读取 `Nikke-db/Nikke-db.github.io/js/json/l2d.json`
- 远程角色：自动生成 `c...` 开头的人物/皮肤条目

## 打开方式

本地静态服务地址：

```text
http://127.0.0.1:5177/
```

也可以用任何静态服务打开项目根目录。

## 交互

- 鼠标贴到最左侧边缘，菜单会滑出。
- 左侧菜单里可以切换 `白天` / `黑暗` 模式，页面会记住上次选择。
- 按 `M` 固定/收起菜单。
- 按空格暂停/播放。
- 按 `R` 重新载入当前动画。

## 人物来源

页面启动时只读取 Nikke-db 的 `l2d.json` 和资源清单，并随机选择一个可用角色播放。当前会自动加入 `c...` 开头且有实际 Live2D 资源的人物/皮肤条目；名字里带 `NPC` 的条目不会展示。页面会给可用条目生成：

- `立绘`：`l2d/{id}/{id}_00.skel`
- `掩体`：`l2d/{id}/cover/{id}_cover_00.skel`
- `瞄准`：`l2d/{id}/aim/{id}_aim_00.skel`

如果某个远程人物只存在部分资源，菜单只会显示实际存在的姿态和展示入口。

自动生成的 Nikke-db 条目会优先使用索引里的 `version`；如果索引缺版本或版本不准，加载器会自动在 Spine 4.0 / 4.1 之间回退重试。

## 展示模式

菜单只放观赏用的高层预设，不再暴露所有 Spine 动画片段；当前只保留 `立绘展示` 和 `开火循环展示`。

- 有 `stand` 的角色会显示 `立绘展示`。
- 同时有 `cover` + `aim` 的角色会显示 `开火循环展示`。
- `开火循环展示`：从掩体出去开火，回到掩体待机，随后换弹，再出去开火，再回到掩体，如此循环。
- `立绘展示` 优先使用 `action` / `special` 这类更适合观赏的动作。
- 未缓存的角色或战斗姿态资源会显示加载提示，避免点击后看起来没有反应。

`掩体` 和 `瞄准` 之间会走一个轻量状态机：姿态会按需加载并缓存。切换时如果当前资源里有 `to_aim` / `to_cover`，会先在当前姿态播放转场，等目标姿态资源就绪并给转场留出一点收尾时间后再显示目标主循环；如果目标姿态还没准备好，会继续保留旧画面，避免黑屏和突兀跳切。为避免某些 Nikke-db 隐藏姿态资源不完整导致整页报错，页面不会再一选人物就强制预加载全部姿态。

底层片段仍然按战斗动作组组织，但不会直接显示给用户：比如 `cover_hit` 会自动接 `cover_stun`，`aim_hit` 会回到开火或瞄准待机，`cover_reload` 会回到 `cover_idle`。

GameKee 的图鉴页可以确认 `full`、`cover`、`aim` 分别是三套 Spine 资源，播放器混合时间为 `0.25`。本页在这个基础上额外做了 `cover` / `aim` 的交接状态机。

## GitHub Pages

仓库根目录已经放了 `.nojekyll`，可以避免 GitHub Pages 过滤带下划线的路径。

部署方式：

1. 把整个目录推到 GitHub 仓库。
2. 打开仓库 `Settings` -> `Pages`。
3. Source 选 `Deploy from a branch`。
4. Branch 选 `main`，目录选 `/root`。

GameKee 页面里这类动画是 Spine，不是普通视频。对应资源是 `.skel + .atlas + .png`。GameKee CDN 下载时通常要带页面 Referer；Nikke-db 的 `raw.githubusercontent.com` 资源带 CORS，可以被这个静态页直接加载。
