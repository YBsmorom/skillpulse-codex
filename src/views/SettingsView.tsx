import { useMemo, useState } from "react";
import { sourceLabel } from "../format";
import type { AnnotationResultCandidate, DashboardData, SkillPulseSettings } from "../types";

interface SettingsViewProps {
  data: DashboardData;
  settings: SkillPulseSettings | null;
  annotationRequestPaths: string[];
  annotationResultCandidates: AnnotationResultCandidate[];
  onOpenPath: (path: string) => void;
  onSetIcon: (path: string) => void;
  onRestoreIcon: () => void;
  onExportAnnotationRequest: () => void;
  onExportAnnotationBatches: (batchSize: number) => void;
  onExportAnnotationSelected: (skillIds: string[]) => void;
  onImportAnnotationResult: (path: string) => void;
  onRefreshAnnotationResults: () => void;
}

export function SettingsView({
  data,
  settings,
  annotationRequestPaths,
  annotationResultCandidates,
  onOpenPath,
  onSetIcon,
  onRestoreIcon,
  onExportAnnotationRequest,
  onExportAnnotationBatches,
  onExportAnnotationSelected,
  onImportAnnotationResult,
  onRefreshAnnotationResults,
}: SettingsViewProps) {
  const [batchSize, setBatchSize] = useState(80);
  const [skillQuery, setSkillQuery] = useState("");
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(() => new Set());
  const filteredSkills = useMemo(() => {
    const query = skillQuery.trim().toLowerCase();
    if (!query) return data.catalog;
    return data.catalog.filter((skill) =>
      `${skill.name} ${skill.localizedName ?? ""} ${skill.description} ${skill.localizedNote ?? ""} ${skill.source}`
        .toLowerCase()
        .includes(query),
    );
  }, [data.catalog, skillQuery]);

  const toggleSkill = (id: string) => {
    setSelectedSkillIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectFilteredSkills = () => {
    setSelectedSkillIds((current) => {
      const next = new Set(current);
      for (const skill of filteredSkills) next.add(skill.id);
      return next;
    });
  };

  return (
    <div className="settings-view">
      <section className="surface settings-card">
        <div className="section-heading">
          <h2>本地与隐私</h2>
          <p>SkillPulse 只读取本机 Skill 与会话索引，不展示完整会话正文。</p>
        </div>
        <div className="settings-grid">
          <Setting label="Codex Home" value={settings?.codexHome ?? ""} />
          <Setting label="数据目录" value={settings?.dataDir ?? ""} />
          <Setting label="扫描文件" value={data.summary.scannedFiles.toLocaleString("zh-CN")} />
          <Setting label="唯一会话" value={data.summary.uniqueSessions.toLocaleString("zh-CN")} />
          <Setting label="原始读取" value={data.summary.rawReads.toLocaleString("zh-CN")} />
          <Setting label="刷新策略" value="启动刷新、手动刷新、每半小时刷新" />
        </div>
        <div className="row-actions wide">
          {settings?.codexHome && <button onClick={() => onOpenPath(settings.codexHome)}>打开 Codex Home</button>}
          {settings?.dataDir && <button onClick={() => onOpenPath(settings.dataDir)}>打开数据目录</button>}
        </div>
      </section>

      <section className="surface settings-card">
        <div className="section-heading">
          <h2>中文备注</h2>
          <p>导出给 LLM 翻译，再导入结果；全程不修改原始 SKILL.md。</p>
        </div>
        <div className="annotation-panel">
          <div>
            <strong>翻译包搬运流程</strong>
            <p>
              先生成 JSON 翻译包，把它交给 Codex、ChatGPT 或其他 LLM。LLM 返回 JSON 后，在下面填入结果文件路径并导入。
              匹配使用 Skill id，英文名只用于核对。
            </p>
          </div>
          <button onClick={onExportAnnotationRequest}>全部导出</button>
        </div>
        <div className="annotation-export-grid">
          <div className="batch-export-row">
            <span>分批导出</span>
            <input
              className="compact-number-input"
              max={200}
              min={1}
              onChange={(event) => setBatchSize(Number(event.target.value) || 80)}
              type="number"
              value={batchSize}
            />
            <span>每个 JSON</span>
            <button onClick={() => onExportAnnotationBatches(batchSize)}>生成分批包</button>
          </div>
        </div>
        <div className="annotation-file-row">
          <span>最近导出</span>
          <code>{annotationRequestPaths.length ? `${annotationRequestPaths.length} 个文件` : "尚未生成"}</code>
          <button disabled={!annotationRequestPaths.length} onClick={() => onOpenPath(annotationRequestPaths[0])}>
            打开首个
          </button>
          <button
            disabled={!annotationRequestPaths.length}
            onClick={() => annotationRequestPaths.length && void navigator.clipboard.writeText(annotationRequestPaths.join("\n"))}
          >
            复制全部路径
          </button>
        </div>
        {annotationRequestPaths.length > 0 && (
          <div className="annotation-path-list">
            {annotationRequestPaths.slice(0, 8).map((path) => (
              <div className="annotation-path-row" key={path}>
                <code>{path}</code>
                <button onClick={() => onOpenPath(path)}>打开</button>
                <button onClick={() => void navigator.clipboard.writeText(path)}>复制</button>
              </div>
            ))}
            {annotationRequestPaths.length > 8 && <p>还有 {annotationRequestPaths.length - 8} 个文件，已包含在“复制全部路径”中。</p>}
          </div>
        )}
        <div className="skill-select-panel">
          <div className="skill-select-toolbar">
            <input
              className="search-input"
              onChange={(event) => setSkillQuery(event.target.value)}
              placeholder="搜索并选择要导出的 Skill"
              value={skillQuery}
            />
            <button onClick={selectFilteredSkills}>全选当前</button>
            <button onClick={() => setSelectedSkillIds(new Set())}>清空</button>
            <button onClick={() => onExportAnnotationSelected([...selectedSkillIds])}>
              导出选中 {selectedSkillIds.size}
            </button>
          </div>
          <div className="skill-select-list">
            {filteredSkills.map((skill) => (
              <label className="skill-select-row" key={skill.id}>
                <input checked={selectedSkillIds.has(skill.id)} onChange={() => toggleSkill(skill.id)} type="checkbox" />
                <span>{skill.localizedName || skill.displayName || skill.name}</span>
                <code>{skill.name}</code>
                <em>{sourceLabel(skill.source)}</em>
              </label>
            ))}
          </div>
        </div>
        <div className="annotation-import-row">
          <input
            className="search-input"
            id="annotation-result-input"
            placeholder="留空则导入自动检测到的最新结果；也可粘贴 JSON 路径"
          />
          <button onClick={onRefreshAnnotationResults}>扫描结果</button>
          <button
            onClick={() => {
              const input = document.getElementById("annotation-result-input") as HTMLInputElement | null;
              if (input) onImportAnnotationResult(input.value);
            }}
          >
            导入最新/指定结果
          </button>
        </div>
        <div className="annotation-result-list">
          <div className="annotation-result-heading">
            <span>检测到的结果文件</span>
            <b>{annotationResultCandidates.length}</b>
          </div>
          {annotationResultCandidates.slice(0, 5).map((item, index) => (
            <div className="annotation-result-row" key={item.path}>
              <div>
                <strong>{index === 0 ? "最新结果" : item.fileName}</strong>
                <code>{item.path}</code>
              </div>
              <span>{item.annotationCount} 条</span>
              <button onClick={() => onOpenPath(item.path)}>打开</button>
              <button onClick={() => onImportAnnotationResult(item.path)}>导入</button>
            </div>
          ))}
          {annotationResultCandidates.length === 0 && <p>尚未检测到翻译结果 JSON。</p>}
        </div>
      </section>

      <section className="surface settings-card">
        <div className="section-heading">
          <h2>Dock 图标</h2>
          <p>支持本地 PNG、SVG、ICO。输入路径后会复制到 SkillPulse 数据目录。</p>
        </div>
        <div className="icon-setting-row">
          <input
            className="search-input"
            defaultValue={settings?.customIconPath ?? ""}
            id="custom-icon-input"
            placeholder={String.raw`C:\path\to\icon.png`}
          />
          <button
            onClick={() => {
              const input = document.getElementById("custom-icon-input") as HTMLInputElement | null;
              if (input?.value.trim()) onSetIcon(input.value.trim());
            }}
          >
            使用图标
          </button>
          <button onClick={onRestoreIcon}>恢复默认</button>
        </div>
      </section>
    </div>
  );
}

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <code>{value || "未设置"}</code>
    </div>
  );
}
