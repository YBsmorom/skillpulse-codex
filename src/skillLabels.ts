import type { DashboardData } from "./types";

export interface SkillLabeler {
  displayName: (name: string) => string;
  englishName: (name: string) => string;
  displayByPath: (path: string | undefined, fallback: string) => string;
}

export function createSkillLabeler(data: DashboardData): SkillLabeler {
  const byName = new Map<string, DashboardData["catalog"][number]>();
  const byPath = new Map<string, DashboardData["catalog"][number]>();

  for (const skill of data.catalog) {
    byPath.set(normalizePath(skill.path), skill);
    const existing = byName.get(skill.name);
    if (!existing || scoreSkillLabel(skill) > scoreSkillLabel(existing)) {
      byName.set(skill.name, skill);
    }
  }

  return {
    displayName(name: string) {
      const skill = byName.get(name);
      return skill?.localizedName || humanizeSkillName(skill?.displayName || name);
    },
    englishName(name: string) {
      return byName.get(name)?.name || name;
    },
    displayByPath(path: string | undefined, fallback: string) {
      const skill = byPath.get(normalizePath(path));
      return skill?.localizedName || humanizeSkillName(skill?.displayName || fallback);
    },
  };
}

export function humanizeSkillName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return name;
  const parts = trimmed
    .split(/[^A-Za-z0-9]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return trimmed;

  const translated = parts.map((part) => translateToken(part)).filter(Boolean);
  if (!translated.length) return trimmed;
  return translated.join("");
}

function scoreSkillLabel(skill: DashboardData["catalog"][number]) {
  let score = 0;
  if (skill.localizedName) score += 100;
  if (skill.localizedNote) score += 30;
  if (skill.description) score += 10;
  if (skill.source === "user") score += 6;
  if (skill.source === "agent") score += 5;
  if (skill.source === "system") score += 4;
  if (skill.source === "plugin") score += 3;
  return score;
}

function normalizePath(path?: string) {
  return (path ?? "").replace(/\//g, "\\").replace(/\\+$/g, "").toLowerCase();
}

function translateToken(token: string) {
  const normalized = token.toLowerCase();
  const dictionary: Record<string, string> = {
    academic: "学术",
    adverse: "不良事件",
    agent: "Agent",
    agents: "Agent",
    ai: "AI",
    analysis: "分析",
    analyze: "分析",
    api: "API",
    article: "文章",
    audio: "音频",
    bayesian: "贝叶斯",
    bilibili: "B站",
    bio: "生物",
    biomedical: "生物医学",
    bioservices: "BioServices",
    browser: "浏览器",
    cancer: "癌症",
    cell: "细胞",
    cellxgene: "CELLxGENE",
    census: "普查库",
    chemical: "化学",
    chembl: "ChEMBL",
    clinical: "临床",
    code: "代码",
    completion: "完成",
    cobrapy: "COBRApy",
    creator: "创建",
    critical: "批判性",
    data: "数据",
    database: "数据库",
    debugging: "调试",
    decision: "决策",
    deep: "深度",
    deweight: "去模板化",
    discovery: "发现",
    document: "文档",
    documents: "文档",
    drug: "药物",
    evm: "EVM",
    evaluation: "评价",
    experiment: "实验",
    experimental: "实验",
    export: "导出",
    feedback: "反馈",
    figma: "Figma",
    fitness: "健身",
    gene: "基因",
    generate: "生成",
    generator: "生成",
    github: "GitHub",
    grants: "基金",
    hypothesis: "假设",
    image: "图像",
    interaction: "互作",
    interactions: "互作",
    lab: "实验室",
    latex: "LaTeX",
    literature: "文献",
    lookup: "查找",
    management: "管理",
    medical: "医学",
    modeling: "建模",
    network: "网络",
    nutrition: "营养",
    office: "Office",
    officecli: "Office文档工具",
    openai: "OpenAI",
    paper: "论文",
    pdf: "PDF",
    peer: "同行",
    plugin: "插件",
    poster: "海报",
    posters: "海报",
    presentation: "演示文稿",
    presentations: "演示文稿",
    protein: "蛋白",
    protocol: "方案",
    protocols: "方案",
    pubmed: "PubMed",
    python: "Python",
    read: "阅读",
    review: "综述",
    research: "研究",
    retrieval: "检索",
    scientific: "科学",
    search: "搜索",
    selection: "选择",
    skill: "Skill",
    skills: "Skill",
    slide: "幻灯片",
    slides: "幻灯片",
    statistical: "统计",
    statistics: "统计",
    subagent: "子Agent",
    superpowers: "Superpowers",
    systematic: "系统化",
    topic: "选题",
    trial: "试验",
    trials: "试验",
    using: "使用",
    verification: "验证",
    video: "视频",
    visualization: "可视化",
    whisper: "Whisper",
    write: "写作",
    writing: "写作",
    you: "你",
  };
  if (dictionary[normalized]) return dictionary[normalized];
  if (/^[A-Z0-9]{2,}$/.test(token)) return token;
  return "";
}
