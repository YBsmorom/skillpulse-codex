export type SkillSource = "user" | "agent" | "system" | "plugin" | "unknown";

export interface SkillCatalogItem {
  id: string;
  name: string;
  displayName: string;
  description: string;
  localizedName?: string;
  localizedNote?: string;
  source: SkillSource | string;
  root: string;
  path: string;
  skillMdPath: string;
  hasScripts: boolean;
  hasReferences: boolean;
  hasAssets: boolean;
  modifiedAt?: string;
  sizeBytes: number;
  frontmatterValid: boolean;
  duplicateGroupId?: string;
}

export interface TopSkill {
  name: string;
  calls: number;
  rawReads: number;
  lastUsed?: string;
  description: string;
  path: string;
}

export interface RecentCall {
  skillName: string;
  skillPath?: string;
  sessionId: string;
  turnId: string;
  timestamp?: string;
}

export interface DailyPoint {
  date: string;
  calls: number;
  uniqueSkills: number;
}

export interface HourlyPoint {
  weekday: number;
  hour: number;
  calls: number;
}

export interface SkillChainEdge {
  fromSkill: string;
  toSkill: string;
  weight: number;
  confidence: "high" | "medium" | "low" | string;
  sessionCount: number;
  lastSeen?: string;
}

export interface MaintenanceIssue {
  kind: string;
  title: string;
  detail: string;
  skillName: string;
  path: string;
  severity: string;
}

export interface SkillAnalytics {
  sevenDayCalls: number;
  thirtyDayCalls: number;
  ninetyDayCalls: number;
  activeSkills30d: number;
  coldSkills: MaintenanceIssue[];
  duplicateSkills: MaintenanceIssue[];
  missingDescriptionSkills: MaintenanceIssue[];
  newUnusedSkills: MaintenanceIssue[];
  oversizedSkills: MaintenanceIssue[];
  chains: SkillChainEdge[];
  hourly: HourlyPoint[];
}

export interface UsageSummary {
  scannedFiles: number;
  uniqueSessions: number;
  highConfidenceCalls: number;
  rawReads: number;
  uniqueSkills: number;
  installedSkills: number;
  lastRefresh: string;
  topSkills: TopSkill[];
  recentCalls: RecentCall[];
  daily: DailyPoint[];
}

export interface DashboardData {
  summary: UsageSummary;
  analytics: SkillAnalytics;
  catalog: SkillCatalogItem[];
}

export interface SkillPulseSettings {
  codexHome: string;
  dataDir: string;
  refreshIntervalMinutes: number;
  startupRefresh: boolean;
  dailySnapshotEnabled: boolean;
  customIconPath?: string;
  extraSkillRoots: string[];
}

export interface AnnotationResultCandidate {
  path: string;
  fileName: string;
  modifiedAt?: string;
  sizeBytes: number;
  annotationCount: number;
}
