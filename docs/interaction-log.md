# SkillPulse 公开版交互记录

这是一份用于开源项目说明的公开版 interaction log。它记录 SkillPulse 的 vibe coding 过程：用户如何提出目标、如何通过截图和反馈修正方向，Codex 如何实现、验证和打包。

这不是原始会话逐字稿。为了避免公开本机私有路径、会话数据库、日志正文和个人上下文，本文采用“用户意图 / Codex 行动 / 结果”的方式整理。

## Round 0：从 Skill/插件讨论转向工具

用户最初在更大的 Skill 工作流中讨论过“插件”和“可成长 Skill”的方向。后续出现一个更具体的问题：如何统计所有会话里的 Skill 调用情况，并做成可视化面板。

Codex 先做过静态 HTML 仪表盘，用于验证统计口径和可视化方向。

结果：静态 HTML 证明了“Skill 使用统计”有价值，但它只是临时文件，不适合作为长期工具。

## Round 1：临时 HTML 不是最终形态

用户反馈：

> skill_usage_dashboard.html，这个是临时的吗？我倒是想做成动态刷新的？变成一个外部的SKILL管理器和面板，便于我管理以及观察和优化SKILL。

Codex 将方向从“报告文件”改为“本地 Skill 管理面板”，并提出后端读取本地日志、前端中文可视化、可导出报告的方案。

结果：项目开始从一次性报表转向本地桌面工具。

## Round 2：更轻量，贴着 Codex App

用户希望：

- 几乎不占用性能；
- 能识别 Codex App 窗口；
- 在 Codex 顶部覆盖一个小按钮；
- 点击打开小面板，支持放大、缩小、关闭；
- 第一版 Windows-only，其他 Agent 和 macOS/Linux 只预留接口。

Codex 确定技术路线：

- Tauri + React + Rust；
- Windows-only；
- Codex App overlay；
- 本机扫描、本机可视化；
- 默认小图标，点击打开面板。

结果：SkillPulse 的产品形态确定。

## Round 3：第一版 overlay 的严重交互 bug

用户反馈：

> 启动之后我都打不了字了，整个 Codex 交互全部被劫持了。

Codex 调整窗口模型：

- 将 dock 图标和 panel 拆成两个窗口；
- dock 默认不抢输入；
- panel 只有打开时才接收焦点；
- 右键菜单提供退出。

结果：解决了“覆盖层劫持输入”的核心问题。

## Round 4：图标和贴附位置反复修正

用户连续反馈：

- 默认只要小图标；
- 图标需要 24x24 或更小；
- 使用用户提供的 SVG；
- 不要方形边框；
- Codex 最小化或关闭时要跟随；
- 挪动窗口时位置不能乱；
- 图标不能闪，位置要居中。

Codex 逐步修正：

- 将图标改为小圆形；
- 调整 SVG 渲染、容器尺寸、透明背景；
- 通过 Windows 窗口定位逻辑跟随 Codex；
- 降低闪烁和错位。

结果：dock 图标成为可用入口，但仍保留后续优化空间。

## Round 5：喜欢/不喜欢统计被删除

早期设想包括统计用户对某个 Codex 回复的喜欢/不喜欢，并归因到 Skill。用户后来确认：

> 如果日志里没有稳定的 Codex UI 赞/踩事件，那就把这个功能删了。

Codex 删除该功能，不再强行做不可靠归因。

结果：数据口径更稳，不把不可验证事件写入统计。

## Round 6：中文说明与本地备注

用户指出很多 Skill 英文名无法让中文用户理解，希望 SkillPulse 能显示中文名称和中文备注。

Codex 最初考虑“在 Skill 中写备注”，用户纠正：

> 它是工具侧的中文解释/管理备注，不会污染原 Skill。

最终方案：

1. SkillPulse 导出 Skill 列表 JSON；
2. 用户把 JSON 交给 LLM；
3. LLM 生成中文名称和说明；
4. SkillPulse 导入结果；
5. 备注只保存在 SkillPulse 本地数据中。

结果：形成“用户搬运工”式 LLM 标注流程。

## Round 7：链路图从炫到可读

用户多次指出链路图问题：

- 节点挤在一起；
- 星系风格太乱；
- 弱链路和未成链 Skill 的点没有意义；
- 应参考 VOSviewer 共现网络；
- 节点大小表示频次，距离表示共现强度，颜色表示聚类；
- 不要显示所有标签，只显示重要节点，其他靠缩放和 hover。

Codex 调整：

- 参考 D3 force directed graph；
- 强共现网络单独显示；
- 弱链路和孤立节点从主图中弱化；
- 支持拖拽节点、缩放、过滤密度；
- 用中文 label 映射显示重点节点。

结果：链路页从“装饰性网络图”改为“可探索的共现网络”。

## Round 8：界面风格和毛玻璃

用户提出：

- 卡片太大，内容少，浪费空间；
- 浅色背景下浅色字体看不清；
- 希望能跟随 Codex 深浅色；
- 可以做毛玻璃，但文字必须能适应背景。

Codex 调整：

- 增加主题变量；
- 支持 Tauri theme 检测；
- 图表颜色适配 light/dark；
- surface 使用半透明、blur、边框和阴影；
- 卡片密度逐步收紧。

结果：界面更接近 Codex/Apple 风格，也降低了深浅色错配。

## Round 9：Skill 库重做

用户指出：

> Skill 库空间很浪费，明明可以做好几栏，还可以弄筛选排序的功能。

同时追问：

> 这个 Skill 库是直接展示 Codex 的所有 Skill 吗？还是不完全显示？能不能直接管理 Skill，比如开关？

Codex 查后端发现：

- 扫描 `%USERPROFILE%\.codex\skills`；
- 扫描 `%USERPROFILE%\.agents\skills`；
- 扫描 `%USERPROFILE%\.codex\plugins\cache`；
- 只识别 `SKILL.md`；
- 旧前端只显示前 220 个，导致看起来不完整。

Codex 修改：

- 去掉 220 条显示上限；
- 单列列表改成多列紧凑卡片；
- 增加搜索；
- 增加来源筛选；
- 增加状态筛选；
- 增加排序；
- 增加“可管理/受保护”标记。

关于开关管理，Codex 保守处理：

- 用户/Agent Skill 未来可做可回滚启停；
- 系统 Skill 和插件缓存 Skill 标记为受保护；
- 不做无确认的危险移动/重命名。

结果：Skill 库变成真正的管理入口雏形。

## Round 10：打包与发布

用户要求：

- 源码和发行版上传 GitHub；
- 中文版说明；
- 声明是 Codex vibe coding 产物；
- 公开整个 vibe coding 过程和交互，作为参考案例。

Codex 完成：

- 补 README；
- 补 LICENSE；
- 补 SECURITY；
- 补 release notes；
- 补 vibe coding case；
- 补 interaction log；
- 初始化 Git；
- 创建公开 GitHub 仓库；
- 上传源码；
- 创建 `v0.1.0` Release；
- 上传 standalone exe、NSIS setup、MSI 和 SHA256 校验文件。

结果：SkillPulse 从本地原型变成公开仓库和发行版。

## 这个过程的几个经验

1. 截图反馈非常有效。很多 UI/交互问题不是靠文字规格一次说清，而是靠“现在截图是这样”逐步收敛。
2. Codex 可以快速执行，但用户需要持续把关产品判断。
3. 看起来酷的可视化不一定有用，链路图最终回到可读性和交互性。
4. 本地工具必须尊重隐私边界，不应默认上传会话正文。
5. Vibe coding 的公开价值不只在最终代码，也在返工记录和决策过程。
