import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Theme } from "@tauri-apps/api/window";
import { useEffect, useMemo, useState } from "react";
import { IconDock } from "./components/IconDock";
import { Shell } from "./components/Shell";
import { formatTime } from "./format";
import type { AnnotationResultCandidate, DashboardData, SkillPulseSettings } from "./types";
import { ChainsView } from "./views/ChainsView";
import { MaintenanceView } from "./views/MaintenanceView";
import { OverviewView } from "./views/OverviewView";
import { SettingsView } from "./views/SettingsView";
import { SkillLibraryView } from "./views/SkillLibraryView";
import { TrendsView } from "./views/TrendsView";

const EMPTY_DATA: DashboardData = {
  summary: {
    scannedFiles: 0,
    uniqueSessions: 0,
    highConfidenceCalls: 0,
    rawReads: 0,
    uniqueSkills: 0,
    installedSkills: 0,
    lastRefresh: "",
    topSkills: [],
    recentCalls: [],
    daily: [],
  },
  analytics: {
    sevenDayCalls: 0,
    thirtyDayCalls: 0,
    ninetyDayCalls: 0,
    activeSkills30d: 0,
    coldSkills: [],
    duplicateSkills: [],
    missingDescriptionSkills: [],
    newUnusedSkills: [],
    oversizedSkills: [],
    chains: [],
    hourly: [],
  },
  catalog: [],
};

const TABS = ["总览", "Skill 库", "趋势", "链路", "维护", "设置"];

export default function App() {
  const currentWindow = getCurrentWindow();
  if (currentWindow.label === "dock") {
    return <IconDock />;
  }
  return <PanelApp />;
}

function PanelApp() {
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [settings, setSettings] = useState<SkillPulseSettings | null>(null);
  const [activeTab, setActiveTab] = useState("总览");
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("准备刷新");
  const [theme, setTheme] = useState<Theme | null>(null);
  const [annotationRequestPaths, setAnnotationRequestPaths] = useState<string[]>([]);
  const [annotationResultCandidates, setAnnotationResultCandidates] = useState<AnnotationResultCandidate[]>([]);

  const statusText = useMemo(() => {
    if (busy) return "正在刷新本地索引";
    if (status && status !== "准备刷新" && !status.startsWith("已刷新 ")) return status;
    if (!data.summary.lastRefresh) return status;
    return `已刷新 ${formatTime(data.summary.lastRefresh)}`;
  }, [busy, data.summary.lastRefresh, status]);

  async function loadSettings() {
    try {
      setSettings(await invoke<SkillPulseSettings>("get_settings"));
      await loadAnnotationResults();
    } catch (error) {
      setStatus(`设置读取失败：${String(error)}`);
    }
  }

  async function loadAnnotationResults() {
    try {
      setAnnotationResultCandidates(await invoke<AnnotationResultCandidate[]>("list_skill_annotation_results"));
    } catch (error) {
      setStatus(`翻译结果检测失败：${String(error)}`);
    }
  }

  async function refresh() {
    setBusy(true);
    setStatus("正在扫描本机 Skill 与会话索引");
    try {
      const next = await invoke<DashboardData>("refresh_usage");
      setData(next);
      setStatus(`已刷新 ${formatTime(next.summary.lastRefresh)}`);
    } catch (error) {
      setStatus(`刷新失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function openPath(path: string) {
    try {
      await invoke("open_path", { path });
    } catch (error) {
      setStatus(`打开失败：${String(error)}`);
    }
  }

  async function exportCsv() {
    try {
      const path = await invoke<string>("export_usage_csv");
      setStatus(`已导出 CSV：${path}`);
    } catch (error) {
      setStatus(`导出失败：${String(error)}`);
    }
  }

  async function exportJson() {
    try {
      const path = await invoke<string>("export_usage_json");
      setStatus(`已导出 JSON：${path}`);
    } catch (error) {
      setStatus(`导出失败：${String(error)}`);
    }
  }

  async function setIcon(path: string) {
    try {
      setSettings(await invoke<SkillPulseSettings>("set_custom_icon_path", { path }));
      setStatus("已设置自定义图标，关闭面板后 dock 会重新读取。");
    } catch (error) {
      setStatus(`图标设置失败：${String(error)}`);
    }
  }

  async function restoreIcon() {
    try {
      setSettings(await invoke<SkillPulseSettings>("restore_default_icon"));
      setStatus("已恢复默认图标。");
    } catch (error) {
      setStatus(`恢复失败：${String(error)}`);
    }
  }

  async function exportAnnotationRequest() {
    setBusy(true);
    setStatus("正在生成翻译包");
    try {
      const paths = await invoke<string[]>("export_skill_annotation_request");
      setAnnotationRequestPaths(paths);
      await loadAnnotationResults();
      setStatus(`已生成 ${paths.length} 个翻译包`);
    } catch (error) {
      setStatus(`翻译包生成失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function exportAnnotationBatches(batchSize: number) {
    setBusy(true);
    setStatus("正在分批生成翻译包");
    try {
      const paths = await invoke<string[]>("export_skill_annotation_batches", { batchSize });
      setAnnotationRequestPaths(paths);
      await loadAnnotationResults();
      setStatus(`已分批生成 ${paths.length} 个翻译包`);
    } catch (error) {
      setStatus(`分批导出失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function exportAnnotationSelected(skillIds: string[]) {
    if (skillIds.length === 0) {
      setStatus("请先选择至少 1 个 Skill");
      return;
    }
    setBusy(true);
    setStatus("正在导出选中的 Skill 翻译包");
    try {
      const paths = await invoke<string[]>("export_skill_annotation_selected", { skillIds });
      setAnnotationRequestPaths(paths);
      await loadAnnotationResults();
      setStatus(`已导出选中 Skill 翻译包：${skillIds.length} 个 Skill`);
    } catch (error) {
      setStatus(`选择导出失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function importAnnotationResult(path: string) {
    const confirmed = window.confirm(
      path.trim()
        ? "导入会把翻译结果写入 SkillPulse 本地元数据，并按 id 匹配 Skill。不会修改任何原始 SKILL.md。"
        : "将自动导入检测到的最新翻译结果 JSON，写入 SkillPulse 本地元数据。不会修改任何原始 SKILL.md。",
    );
    if (!confirmed) return;
    setBusy(true);
    setStatus("正在导入翻译结果");
    try {
      const next = path.trim()
        ? await invoke<DashboardData>("import_skill_annotation_result", { path: path.trim() })
        : await invoke<DashboardData>("import_latest_skill_annotation_result");
      setData(next);
      await loadAnnotationResults();
      setStatus(`已导入中文备注 ${next.catalog.filter((skill) => skill.localizedNote).length} 条`);
    } catch (error) {
      setStatus(`翻译结果导入失败：${String(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    await invoke("set_panel_expanded", { expanded: next });
  }

  async function closePanel() {
    await invoke("hide_panel");
  }

  useEffect(() => {
    void loadSettings();
    void refresh();

    const interval = window.setInterval(() => void refresh(), 30 * 60 * 1000);
    let unlisten: (() => void) | undefined;
    void listen("skillpulse-refresh-request", () => void refresh()).then((dispose) => {
      unlisten = dispose;
    });
    return () => {
      window.clearInterval(interval);
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const panelWindow = getCurrentWindow();
    let unlistenTheme: (() => void) | undefined;

    function applyTheme(theme: Theme | null) {
      setTheme(theme);
      if (theme) {
        document.documentElement.dataset.theme = theme;
      } else {
        delete document.documentElement.dataset.theme;
      }
    }

    void panelWindow.theme().then(applyTheme).catch(() => applyTheme(null));
    void panelWindow.onThemeChanged(({ payload }) => applyTheme(payload)).then((dispose) => {
      unlistenTheme = dispose;
    });

    return () => {
      unlistenTheme?.();
    };
  }, []);

  return (
    <Shell
      activeTab={activeTab}
      expanded={expanded}
      onClose={() => void closePanel()}
      onExpand={() => void toggleExpanded()}
      onRefresh={() => void refresh()}
      onTab={setActiveTab}
      status={statusText}
      tabs={TABS}
    >
      {activeTab === "总览" && <OverviewView data={data} theme={theme} />}
      {activeTab === "Skill 库" && (
        <SkillLibraryView data={data} onOpenPath={openPath} />
      )}
      {activeTab === "趋势" && <TrendsView data={data} theme={theme} />}
      {activeTab === "链路" && <ChainsView data={data} />}
      {activeTab === "维护" && (
        <MaintenanceView data={data} onExportCsv={exportCsv} onExportJson={exportJson} onOpenPath={openPath} />
      )}
      {activeTab === "设置" && (
        <SettingsView
          data={data}
          annotationRequestPaths={
            annotationRequestPaths.length
              ? annotationRequestPaths
              : settings?.dataDir
                ? [`${settings.dataDir}\\skill-annotation-request.json`]
                : []
          }
          onExportAnnotationBatches={exportAnnotationBatches}
          onOpenPath={openPath}
          onExportAnnotationRequest={exportAnnotationRequest}
          onExportAnnotationSelected={exportAnnotationSelected}
          onImportAnnotationResult={importAnnotationResult}
          onRefreshAnnotationResults={loadAnnotationResults}
          annotationResultCandidates={annotationResultCandidates}
          onRestoreIcon={restoreIcon}
          onSetIcon={setIcon}
          settings={settings}
        />
      )}
    </Shell>
  );
}
