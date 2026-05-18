import { chartPalette, mint, violet } from "../charts";
import { formatTime } from "../format";
import { createSkillLabeler } from "../skillLabels";
import type { DashboardData } from "../types";
import { ChartCard } from "./ChartCard";
import type { AppThemeMode } from "../charts";

export function OverviewView({ data, theme }: { data: DashboardData; theme: AppThemeMode }) {
  const { summary, analytics } = data;
  const labels = createSkillLabeler(data);
  const palette = chartPalette(theme);
  const topData = summary.topSkills.slice(0, 8).reverse();
  const dailyData = summary.daily.slice(-30);

  const topOption = {
    backgroundColor: "transparent",
    grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: palette.grid } },
      axisLabel: { color: palette.text },
    },
    yAxis: {
      type: "category",
      data: topData.map((item) => labels.displayByPath(item.path, item.name)),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: palette.text, width: 150, overflow: "truncate", fontWeight: 600 },
    },
    series: [
      {
        type: "bar",
        data: topData.map((item) => item.calls),
        barWidth: 12,
        itemStyle: {
          borderRadius: 8,
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: mint },
              { offset: 1, color: violet },
            ],
          },
        },
      },
    ],
    tooltip: {
      trigger: "axis",
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      textStyle: { color: palette.tooltipText },
      formatter: (items: Array<{ dataIndex: number; value: number }>) => {
        const item = items[0];
        const skill = topData[item.dataIndex];
        return `${labels.displayByPath(skill.path, skill.name)}<br/>${skill.name}<br/>调用 ${item.value}`;
      },
    },
  };

  const dailyOption = {
    backgroundColor: "transparent",
    grid: { left: 42, right: 18, top: 18, bottom: 32 },
    xAxis: {
      type: "category",
      data: dailyData.map((item) => item.date.slice(5)),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: palette.axis } },
      axisLabel: { color: palette.text },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: palette.grid } },
      axisLabel: { color: palette.text },
    },
    series: [
      {
        type: "line",
        smooth: true,
        symbolSize: 6,
        data: dailyData.map((item) => item.calls),
        lineStyle: { width: 3, color: mint },
        itemStyle: { color: mint },
        areaStyle: { color: "rgba(158,230,198,.12)" },
      },
    ],
    tooltip: {
      trigger: "axis",
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      textStyle: { color: palette.tooltipText },
    },
  };

  const metrics = [
    ["今日调用", summary.daily.at(-1)?.calls ?? 0],
    ["7 日调用", analytics.sevenDayCalls],
    ["30 日调用", analytics.thirtyDayCalls],
    ["已安装 Skill", summary.installedSkills],
    ["30 日活跃", analytics.activeSkills30d],
    ["吃灰 Skill", analytics.coldSkills.length],
  ];

  return (
    <div className="overview-grid">
      <section className="intro-band">
        <div>
          <h2>本机 Skill 使用概览</h2>
          <p>
            只读取本机 Codex Skill 与会话索引，不上传正文。这里用来观察哪些 Skill 被使用、哪些需要整理、
            哪些组合经常一起出现。
          </p>
        </div>
        <div className="refresh-stamp">最近刷新 {formatTime(summary.lastRefresh)}</div>
      </section>

      <div className="metric-grid v2">
        {metrics.map(([label, value]) => (
          <div className="metric compact" key={label}>
            <span>{label}</span>
            <strong>{Number(value).toLocaleString("zh-CN")}</strong>
          </div>
        ))}
      </div>

      <ChartCard title="最常使用的 Skill" option={topOption} theme={theme} />
      <ChartCard title="30 日趋势" option={dailyOption} theme={theme} />

      <section className="surface list-panel">
        <div className="section-heading">
          <h2>最近调用</h2>
          <p>按高置信 Skill 读取记录去重</p>
        </div>
        <div className="dense-list">
          {summary.recentCalls.slice(0, 8).map((call, index) => (
            <div className="dense-row" key={`${call.sessionId}-${call.turnId}-${call.skillName}-${index}`}>
              <div>
                <strong>{labels.displayByPath(call.skillPath, call.skillName)}</strong>
                <span>{call.skillName} · {call.sessionId.slice(0, 8)} · {call.turnId}</span>
              </div>
              <time>{formatTime(call.timestamp)}</time>
            </div>
          ))}
          {summary.recentCalls.length === 0 && <div className="empty-state">还没有读取到调用记录。</div>}
        </div>
      </section>

      <section className="surface list-panel">
        <div className="section-heading">
          <h2>维护提醒</h2>
          <p>优先看重复、缺说明、吃灰</p>
        </div>
        <div className="dense-list">
          {[...analytics.duplicateSkills, ...analytics.missingDescriptionSkills, ...analytics.coldSkills]
            .slice(0, 8)
            .map((issue, index) => (
              <div className="dense-row" key={`${issue.kind}-${issue.path}-${index}`}>
                <div>
                  <strong>{labels.displayByPath(issue.path, issue.skillName)}</strong>
                  <span>{issue.title} · {issue.detail}</span>
                </div>
              </div>
            ))}
        </div>
      </section>
    </div>
  );
}
