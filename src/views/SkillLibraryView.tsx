import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { formatTime, shortPath, sourceLabel } from "../format";
import { createSkillLabeler } from "../skillLabels";
import type { DashboardData, SkillCatalogItem } from "../types";

interface SkillLibraryViewProps {
  data: DashboardData;
  onOpenPath: (path: string) => void;
}

type SourceFilter = "all" | "user" | "agent" | "system" | "plugin" | "unknown";
type StatusFilter =
  | "all"
  | "active"
  | "unused"
  | "manageable"
  | "protected"
  | "duplicate"
  | "missing"
  | "scripts"
  | "references"
  | "assets";
type SortMode = "calls" | "recent" | "name" | "source" | "modified" | "size";

export function SkillLibraryView({ data, onOpenPath }: SkillLibraryViewProps) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("calls");
  const labels = createSkillLabeler(data);
  const callsByName = useMemo(
    () => new Map(data.summary.topSkills.map((item) => [item.name, item])),
    [data.summary.topSkills],
  );
  const catalogStats = useMemo(() => buildCatalogStats(data.catalog, callsByName), [data.catalog, callsByName]);
  const filtered = useMemo(
    () =>
      data.catalog
        .filter((skill) => {
          const calls = callsByName.get(skill.name);
          if (sourceFilter !== "all" && skill.source !== sourceFilter) return false;
          if (!matchesStatusFilter(skill, calls, statusFilter)) return false;
          const q = query.trim().toLowerCase();
          if (!q) return true;
          return `${skill.name} ${skill.localizedName ?? ""} ${skill.description} ${skill.localizedNote ?? ""} ${skill.path}`
            .toLowerCase()
            .includes(q);
        })
        .sort((left, right) => compareSkills(left, right, callsByName, sortMode)),
    [callsByName, data.catalog, query, sortMode, sourceFilter, statusFilter],
  );

  return (
    <div className="library-view">
      <section className="surface toolbar-panel library-toolbar">
        <div className="section-heading">
          <div>
            <h2>Skill 库</h2>
            <p>
              已扫描 {data.catalog.length.toLocaleString("zh-CN")} 个，当前显示 {filtered.length.toLocaleString("zh-CN")} 个。
              来源：Codex / Agent / 插件缓存。
            </p>
          </div>
          <p>备注保存在 SkillPulse 本地，不改写原始 SKILL.md。</p>
        </div>
        <input
          className="search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索 Skill 名、中文说明、英文说明或路径"
          value={query}
        />
        <div className="library-filter-strip">
          <FilterButton active={sourceFilter === "all"} onClick={() => setSourceFilter("all")}>
            全部 {data.catalog.length}
          </FilterButton>
          {(["user", "agent", "system", "plugin"] as SourceFilter[]).map((source) => (
            <FilterButton active={sourceFilter === source} key={source} onClick={() => setSourceFilter(source)}>
              {sourceLabel(source)} {catalogStats.sourceCounts.get(source) ?? 0}
            </FilterButton>
          ))}
        </div>
        <div className="library-filter-strip">
          {[
            ["all", `全部 ${data.catalog.length}`],
            ["active", `已调用 ${catalogStats.active}`],
            ["unused", `未调用 ${catalogStats.unused}`],
            ["manageable", `可管理 ${catalogStats.manageable}`],
            ["protected", `受保护 ${catalogStats.protected}`],
            ["duplicate", `重复 ${catalogStats.duplicate}`],
            ["missing", `缺说明 ${catalogStats.missing}`],
            ["scripts", `脚本 ${catalogStats.scripts}`],
            ["references", `参考 ${catalogStats.references}`],
            ["assets", `素材 ${catalogStats.assets}`],
          ].map(([value, label]) => (
            <FilterButton active={statusFilter === value} key={value} onClick={() => setStatusFilter(value as StatusFilter)}>
              {label}
            </FilterButton>
          ))}
        </div>
        <label className="sort-control">
          <span>排序</span>
          <select onChange={(event) => setSortMode(event.target.value as SortMode)} value={sortMode}>
            <option value="calls">调用最多</option>
            <option value="recent">最近使用</option>
            <option value="name">名称 A-Z</option>
            <option value="source">来源</option>
            <option value="modified">最近修改</option>
            <option value="size">入口大小</option>
          </select>
        </label>
      </section>

      <section className="skill-grid">
        {filtered.map((skill) => (
          <SkillCard
            calls={callsByName.get(skill.name)}
            key={skill.id}
            label={labels.displayByPath(skill.path, skill.name)}
            onOpenPath={onOpenPath}
            skill={skill}
          />
        ))}
        {filtered.length === 0 && <div className="surface empty-state library-empty">没有匹配的 Skill。</div>}
      </section>
    </div>
  );
}

function SkillCard({
  skill,
  calls,
  label,
  onOpenPath,
}: {
  skill: SkillCatalogItem;
  calls?: { calls: number; rawReads: number; lastUsed?: string };
  label: string;
  onOpenPath: (path: string) => void;
}) {
  const note = skill.localizedNote || skill.description || "暂无说明，建议补充中文备注。";
  const status = calls?.calls ? "活跃" : "未见调用";
  const protectedSkill = !isManageableSkill(skill);

  return (
    <article className="skill-card compact-skill-card">
      <div className="skill-title-row">
        <h3>{label}</h3>
        <span className={`source-pill ${skill.source}`}>{sourceLabel(skill.source)}</span>
        {skill.duplicateGroupId && <span className="warn-pill">重复</span>}
      </div>
      {label !== skill.name && <div className="english-name-line">{skill.name}</div>}
      <p>{note}</p>
      <div className="skill-card-meta">
        <span>{status}</span>
        <span>调用 {calls?.calls ?? 0}</span>
        <span>最近 {formatTime(calls?.lastUsed)}</span>
        <span>{protectedSkill ? "受保护" : "可管理"}</span>
      </div>
      <div className="path-line">{shortPath(skill.path)}</div>
      <div className="row-actions">
        <button onClick={() => onOpenPath(skill.path)}>目录</button>
        <button onClick={() => onOpenPath(skill.skillMdPath)}>SKILL.md</button>
        <button onClick={() => void navigator.clipboard.writeText(skill.path)}>复制</button>
      </div>
    </article>
  );
}

function FilterButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className={active ? "active" : ""} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function buildCatalogStats(
  catalog: SkillCatalogItem[],
  callsByName: Map<string, { calls: number; rawReads: number; lastUsed?: string }>,
) {
  const sourceCounts = new Map<string, number>();
  for (const skill of catalog) {
    sourceCounts.set(skill.source, (sourceCounts.get(skill.source) ?? 0) + 1);
  }
  return {
    sourceCounts,
    active: catalog.filter((skill) => (callsByName.get(skill.name)?.calls ?? 0) > 0).length,
    unused: catalog.filter((skill) => (callsByName.get(skill.name)?.calls ?? 0) === 0).length,
    manageable: catalog.filter((skill) => isManageableSkill(skill)).length,
    protected: catalog.filter((skill) => !isManageableSkill(skill)).length,
    duplicate: catalog.filter((skill) => skill.duplicateGroupId).length,
    missing: catalog.filter((skill) => (skill.localizedNote || skill.description).trim().length < 12).length,
    scripts: catalog.filter((skill) => skill.hasScripts).length,
    references: catalog.filter((skill) => skill.hasReferences).length,
    assets: catalog.filter((skill) => skill.hasAssets).length,
  };
}

function matchesStatusFilter(
  skill: SkillCatalogItem,
  calls: { calls: number; rawReads: number; lastUsed?: string } | undefined,
  filter: StatusFilter,
) {
  switch (filter) {
    case "active":
      return (calls?.calls ?? 0) > 0;
    case "unused":
      return (calls?.calls ?? 0) === 0;
    case "manageable":
      return isManageableSkill(skill);
    case "protected":
      return !isManageableSkill(skill);
    case "duplicate":
      return Boolean(skill.duplicateGroupId);
    case "missing":
      return (skill.localizedNote || skill.description).trim().length < 12;
    case "scripts":
      return skill.hasScripts;
    case "references":
      return skill.hasReferences;
    case "assets":
      return skill.hasAssets;
    default:
      return true;
  }
}

function isManageableSkill(skill: SkillCatalogItem) {
  return skill.source === "user" || skill.source === "agent";
}

function compareSkills(
  left: SkillCatalogItem,
  right: SkillCatalogItem,
  callsByName: Map<string, { calls: number; rawReads: number; lastUsed?: string }>,
  sortMode: SortMode,
) {
  const leftCalls = callsByName.get(left.name);
  const rightCalls = callsByName.get(right.name);
  switch (sortMode) {
    case "recent":
      return timestampValue(rightCalls?.lastUsed) - timestampValue(leftCalls?.lastUsed) || left.name.localeCompare(right.name);
    case "name":
      return left.name.localeCompare(right.name);
    case "source":
      return left.source.localeCompare(right.source) || left.name.localeCompare(right.name);
    case "modified":
      return timestampValue(right.modifiedAt) - timestampValue(left.modifiedAt) || left.name.localeCompare(right.name);
    case "size":
      return right.sizeBytes - left.sizeBytes || left.name.localeCompare(right.name);
    default:
      return (rightCalls?.calls ?? 0) - (leftCalls?.calls ?? 0) || left.name.localeCompare(right.name);
  }
}

function timestampValue(value?: string) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
