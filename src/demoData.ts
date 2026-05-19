import type { DashboardData, SkillPulseSettings } from "./types";

const now = "2026-05-19T10:30:00+08:00";

const demoRoot = "C:\\SkillPulse\\Demo\\skills";

const skillDefs = [
  ["research-topic-selection", "研究选题", "用于拆解研究方向、评估可行性，并把模糊想法收束成可执行题目。", "user", 86],
  ["literature-review", "文献综述", "适合整理研究现状、提取证据链，并形成综述或讨论框架。", "agent", 72],
  ["statistical-analysis", "统计分析", "用于建模、回归、假设检验和结果解释。", "agent", 64],
  ["data-cleaning-plans", "数据清洗计划", "帮助制定缺失值、异常值、编码和变量标准化处理方案。", "user", 54],
  ["read-as-you-write", "边读边写", "在写作过程中同步检查逻辑、证据和表达。", "user", 47],
  ["verification-before-completion", "完成前验证", "用于提交前复核测试、文件、输出和风险。", "system", 43],
  ["bilibili-render-pdf", "Bilibili 讲义 PDF", "把视频内容整理成结构化讲义和 PDF。", "user", 36],
  ["openai-docs", "OpenAI 文档", "快速定位 OpenAI API、SDK 和平台文档。", "system", 29],
  ["skill-creator", "Skill 创建", "把稳定流程沉淀为可复用 Skill。", "system", 24],
  ["citation-management", "引用管理", "整理引用、导出条目并检查格式。", "agent", 18],
  ["scientific-visualization", "科研可视化", "生成图表、网络图和科研报告图形。", "agent", 16],
  ["manuscript-revision", "论文修订", "处理返修意见、压缩篇幅并保持引用结构。", "user", 14],
  ["clinical-trials-search", "临床试验检索", "检索和整理临床试验登记信息。", "plugin", 8],
  ["protein-network-analysis", "蛋白互作网络", "用于蛋白互作网络检索、解释和可视化。", "plugin", 6],
  ["latex-compile", "LaTeX 编译", "编译 LaTeX 项目并定位错误。", "plugin", 4],
  ["archive-cleanup", "归档整理", "整理旧项目和输出文件。", "user", 0],
  ["poster-layout", "海报排版", "制作学术海报版式。", "agent", 0],
  ["meeting-brief", "会议简报", "准备会议材料和要点。", "agent", 0],
] as const;

const dailyCalls = [42, 58, 91, 126, 138, 86, 74, 112, 165, 204, 178, 151, 96, 83, 121, 147, 132, 118, 176, 228, 196, 154, 142, 101, 88, 119, 134, 162, 148, 172];

export const demoSettings: SkillPulseSettings = {
  codexHome: "C:\\SkillPulse\\Demo\\.codex",
  dataDir: "C:\\SkillPulse\\Demo\\Data",
  refreshIntervalMinutes: 30,
  startupRefresh: true,
  dailySnapshotEnabled: true,
  extraSkillRoots: [],
};

export const demoData: DashboardData = {
  summary: {
    scannedFiles: 128,
    uniqueSessions: 46,
    highConfidenceCalls: 2856,
    rawReads: 3194,
    uniqueSkills: 64,
    installedSkills: skillDefs.length,
    lastRefresh: now,
    topSkills: skillDefs
      .filter(([, , , , calls]) => calls > 0)
      .map(([name, , description, , calls], index) => ({
        name,
        calls,
        rawReads: calls + 8 + index,
        lastUsed: minutesAgo(index * 36),
        description,
        path: `${demoRoot}\\${name}`,
      })),
    recentCalls: [
      ["research-topic-selection", "demo-session-01", "turn-12", 8],
      ["literature-review", "demo-session-01", "turn-13", 12],
      ["statistical-analysis", "demo-session-02", "turn-7", 24],
      ["verification-before-completion", "demo-session-02", "turn-8", 28],
      ["bilibili-render-pdf", "demo-session-03", "turn-4", 52],
      ["read-as-you-write", "demo-session-04", "turn-19", 78],
      ["openai-docs", "demo-session-05", "turn-3", 114],
      ["skill-creator", "demo-session-06", "turn-9", 142],
    ].map(([skillName, sessionId, turnId, minutes]) => ({
      skillName: String(skillName),
      skillPath: `${demoRoot}\\${skillName}`,
      sessionId: String(sessionId),
      turnId: String(turnId),
      timestamp: minutesAgo(Number(minutes)),
    })),
    daily: dailyCalls.map((calls, index) => ({
      date: dateDaysAgo(dailyCalls.length - index - 1),
      calls,
      uniqueSkills: Math.max(4, Math.round(calls / 24)),
    })),
  },
  analytics: {
    sevenDayCalls: dailyCalls.slice(-7).reduce((sum, value) => sum + value, 0),
    thirtyDayCalls: dailyCalls.reduce((sum, value) => sum + value, 0),
    ninetyDayCalls: 7312,
    activeSkills30d: 14,
    coldSkills: ["archive-cleanup", "poster-layout", "meeting-brief"].map((name) => issue("cold", "吃灰 Skill", "30 天内没有看到高置信调用。", name, "low")),
    duplicateSkills: [issue("duplicate", "可能重复", "相近能力在多个 Skill 中出现，可考虑合并或改名。", "research-topic-selection", "medium")],
    missingDescriptionSkills: [issue("missing", "缺少中文说明", "建议补充中文备注，方便后续检索。", "archive-cleanup", "low")],
    newUnusedSkills: [issue("new-unused", "新装未调用", "已安装但还没有进入工作流。", "meeting-brief", "low")],
    oversizedSkills: [issue("oversized", "入口偏大", "SKILL.md 偏长，可拆出参考文件。", "literature-review", "medium")],
    chains: [
      edge("research-topic-selection", "literature-review", 48, "high", 18),
      edge("literature-review", "statistical-analysis", 42, "high", 16),
      edge("statistical-analysis", "verification-before-completion", 39, "high", 14),
      edge("data-cleaning-plans", "statistical-analysis", 34, "high", 12),
      edge("research-topic-selection", "data-cleaning-plans", 31, "medium", 11),
      edge("read-as-you-write", "literature-review", 28, "medium", 10),
      edge("read-as-you-write", "manuscript-revision", 24, "high", 8),
      edge("manuscript-revision", "citation-management", 19, "medium", 7),
      edge("bilibili-render-pdf", "scientific-visualization", 18, "medium", 6),
      edge("openai-docs", "skill-creator", 17, "medium", 6),
      edge("skill-creator", "verification-before-completion", 15, "medium", 5),
      edge("clinical-trials-search", "statistical-analysis", 12, "low", 4),
      edge("protein-network-analysis", "scientific-visualization", 10, "low", 3),
      edge("latex-compile", "manuscript-revision", 8, "low", 2),
    ],
    hourly: Array.from({ length: 7 * 24 }, (_, index) => ({
      weekday: Math.floor(index / 24),
      hour: index % 24,
      calls: index % 24 >= 9 && index % 24 <= 23 ? Math.round(((index % 7) + 1) * ((index % 5) + 2)) : 0,
    })),
  },
  catalog: skillDefs.map(([name, localizedName, localizedNote, source, calls], index) => ({
    id: `demo-${name}`,
    name,
    displayName: name,
    description: localizedNote,
    localizedName,
    localizedNote,
    source,
    root: demoRoot,
    path: `${demoRoot}\\${name}`,
    skillMdPath: `${demoRoot}\\${name}\\SKILL.md`,
    hasScripts: index % 3 === 0,
    hasReferences: index % 4 === 0,
    hasAssets: index % 5 === 0,
    modifiedAt: dateTimeDaysAgo(index + 1),
    sizeBytes: 2200 + index * 530,
    frontmatterValid: true,
    duplicateGroupId: index === 0 ? "demo-topic" : undefined,
  })),
};

function minutesAgo(minutes: number) {
  return new Date(Date.parse(now) - minutes * 60 * 1000).toISOString();
}

function dateDaysAgo(days: number) {
  return new Date(Date.parse(now) - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dateTimeDaysAgo(days: number) {
  return new Date(Date.parse(now) - days * 24 * 60 * 60 * 1000).toISOString();
}

function edge(
  fromSkill: string,
  toSkill: string,
  weight: number,
  confidence: "high" | "medium" | "low",
  sessionCount: number,
) {
  return {
    fromSkill,
    toSkill,
    weight,
    confidence,
    sessionCount,
    lastSeen: minutesAgo(weight * 9),
  };
}

function issue(kind: string, title: string, detail: string, skillName: string, severity: string) {
  return {
    kind,
    title,
    detail,
    skillName,
    path: `${demoRoot}\\${skillName}`,
    severity,
  };
}
