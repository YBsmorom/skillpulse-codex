# SkillPulse for Codex

SkillPulse 是一个 Windows-only 的 Codex App Skill 使用观察工具。它会在 Codex 窗口附近放一个很小的悬浮图标，点击后打开本地可视化面板，用来查看本机 Skill 的使用次数、趋势、链路、Skill 库和维护提示。

这个项目是一次 **Codex vibe coding** 的产物：需求、设计、调试、重构和发布文档主要通过用户与 Codex 的连续对话完成。它不是官方 Codex 功能，也不代表 OpenAI 官方立场。

## 为什么做这个工具

Codex 的 Skill 会越来越多，但用户很难回答几个实际问题：

- 哪些 Skill 经常被用到？
- 哪些 Skill 已经很久没被调用，可能在吃灰？
- 哪些 Skill 名称重复、说明缺失，导致后续很难管理？
- 某些 Skill 是否经常一起出现，形成了稳定的工作链路？
- 自己写的 Skill 是否真的进入了日常工作流？

SkillPulse 的目标不是替代 Codex，而是给本机 Skill 生态做一个轻量的仪表盘。它只读取本机数据，不上传会话正文，适合个人观察、整理和改造自己的 Skill 工作流。

## 当前功能

- 悬浮小图标：贴近 Codex App 使用，点击打开面板，右键可退出。
- 总览面板：显示今日、7 日、30 日调用量，最近调用和维护提醒。
- Skill 库：扫描本机可发现的 Skill，支持搜索、来源筛选、状态筛选和排序。
- 趋势视图：查看日趋势和时段热力图。
- 链路视图：根据同会话/相邻轮次推断 Skill 共现链路，支持网络筛选和拖拽。
- 维护视图：提示重复 Skill、缺说明 Skill、吃灰 Skill、体积偏大的 Skill。
- 中文备注：支持导出 Skill 翻译包，让用户把 JSON 交给 LLM 生成中文名称和说明后再导入。
- 本地导出：支持导出 CSV / JSON 报告。

## Skill 库显示范围

当前版本扫描这些目录中存在 `SKILL.md` 的 Skill：

- `%USERPROFILE%\.codex\skills`
- `%USERPROFILE%\.agents\skills`
- `%USERPROFILE%\.codex\plugins\cache`

因此它不是只显示用户自己写的 Codex Skill，也会显示 Agent Skill 和插件缓存里的 Skill。没有落成 `SKILL.md` 文件、或在这些目录之外的 Skill 不会显示。

## 本地数据与隐私

SkillPulse 会读取：

- `%USERPROFILE%\.codex\sessions`
- `%USERPROFILE%\.codex\archived_sessions`
- `%USERPROFILE%\.codex\skills`
- `%USERPROFILE%\.agents\skills`
- `%USERPROFILE%\.codex\plugins\cache`

SkillPulse 会写入：

- `%APPDATA%\SkillPulse\settings.json`
- `%APPDATA%\SkillPulse\daily-snapshots.json`
- `%APPDATA%\SkillPulse\skill-notes.json`
- `%APPDATA%\SkillPulse\exports\*`
- `%APPDATA%\SkillPulse\icons\*`

默认设计是不上传任何数据，也不展示完整会话正文。统计逻辑主要依赖本机会话索引和对 `SKILL.md` 读取记录的推断。

## 安装

推荐直接使用 GitHub Release 中的安装包：

- `SkillPulse_0.1.0_x64-setup.exe`
- `SkillPulse_0.1.0_x64_en-US.msi`

安装或运行后，Codex 窗口顶部附近会出现 SkillPulse 小图标。点击图标打开面板。

## 从源码运行

需要 Windows、Node.js、Rust 和 Tauri 依赖环境。

```powershell
npm install
npm run dev
```

构建发行版：

```powershell
npm run build
```

检查：

```powershell
npm run check
cargo check --manifest-path .\src-tauri\Cargo.toml
```

## 目录

```text
src/                  React 前端
src-tauri/            Tauri / Rust 后端
docs/                 设计说明、发布说明、vibe coding 过程
```

## 后续随缘更新

这个工具优先服务于个人使用和实验。后续可能会继续做：

- 更安全的 Skill 启用/停用管理；
- 更好的链路网络交互；
- 更多 Agent 的 Skill 目录适配；
- 更完整的导出和周/月报；
- 更稳定的 Codex 窗口贴附逻辑。

也欢迎直接 fork 源码，把它交给自己的 Codex 改造成适合自己工作流的版本。

## Vibe Coding 声明

SkillPulse 是一个公开的 Codex vibe coding 案例。项目从“想要一个 Skill 使用小记/计数器”开始，经由多轮对话不断修正方向、界面、数据口径和交互细节。详细过程见 [docs/vibe-coding-case.md](docs/vibe-coding-case.md)。

更细的公开版交互记录见 [docs/interaction-log.md](docs/interaction-log.md)。这份记录保留产品决策和返工过程，不公开本机私有会话正文、数据库和个人路径细节。

## Contributors

- [YBsmorom](https://github.com/YBsmorom)：项目发起、需求定义、产品判断、测试反馈与发布。
- codex-gpt5.5：在 Codex 中参与 vibe coding，实现、调试、文档整理与打包发布。

## 许可证

MIT。见 [LICENSE](LICENSE)。
