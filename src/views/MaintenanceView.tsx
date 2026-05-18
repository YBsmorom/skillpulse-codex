import type { DashboardData, MaintenanceIssue } from "../types";
import { shortPath } from "../format";
import { createSkillLabeler, type SkillLabeler } from "../skillLabels";

interface MaintenanceViewProps {
  data: DashboardData;
  onOpenPath: (path: string) => void;
  onExportCsv: () => void;
  onExportJson: () => void;
}

export function MaintenanceView({ data, onOpenPath, onExportCsv, onExportJson }: MaintenanceViewProps) {
  const labels = createSkillLabeler(data);
  const groups = [
    ["可能重复", data.analytics.duplicateSkills],
    ["缺说明", data.analytics.missingDescriptionSkills],
    ["吃灰 Skill", data.analytics.coldSkills],
    ["新装未用", data.analytics.newUnusedSkills],
    ["入口偏长", data.analytics.oversizedSkills],
  ] as const;

  return (
    <div className="maintenance-view">
      <section className="surface toolbar-panel">
        <div className="section-heading">
          <h2>维护建议</h2>
          <p>只给整理建议，不直接编辑或删除 Skill。</p>
        </div>
        <div className="row-actions wide">
          <button onClick={onExportCsv}>导出 CSV</button>
          <button onClick={onExportJson}>导出 JSON</button>
        </div>
      </section>
      <div className="maintenance-grid">
        {groups.map(([title, issues]) => (
          <IssueGroup issues={issues} key={title} labels={labels} onOpenPath={onOpenPath} title={title} />
        ))}
      </div>
    </div>
  );
}

function IssueGroup({
  title,
  issues,
  labels,
  onOpenPath,
}: {
  title: string;
  issues: MaintenanceIssue[];
  labels: SkillLabeler;
  onOpenPath: (path: string) => void;
}) {
  return (
    <section className="surface issue-group">
      <div className="section-heading">
        <h2>{title}</h2>
        <p>{issues.length.toLocaleString("zh-CN")} 项</p>
      </div>
      <div className="dense-list">
        {issues.slice(0, 10).map((issue, index) => (
          <div className="issue-row" key={`${issue.kind}-${issue.path}-${index}`}>
            <div>
              <strong>{labels.displayByPath(issue.path, issue.skillName)}</strong>
              <span>{issue.detail}</span>
              <code>{shortPath(issue.path, 76)}</code>
            </div>
            <button onClick={() => onOpenPath(issue.path)}>打开</button>
          </div>
        ))}
        {issues.length === 0 && <div className="empty-state">没有发现这类问题。</div>}
      </div>
    </section>
  );
}
