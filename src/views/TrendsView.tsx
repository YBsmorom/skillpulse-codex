import { blue, chartPalette, mint } from "../charts";
import type { AppThemeMode } from "../charts";
import type { DashboardData } from "../types";
import { ChartCard } from "./ChartCard";

export function TrendsView({ data, theme }: { data: DashboardData; theme: AppThemeMode }) {
  const palette = chartPalette(theme);
  const daily = data.summary.daily.slice(-60);
  const hourly = data.analytics.hourly;
  const maxHourly = Math.max(1, ...hourly.map((item) => item.calls));

  const trendOption = {
    backgroundColor: "transparent",
    grid: { left: 44, right: 18, top: 22, bottom: 34 },
    legend: { textStyle: { color: palette.text }, top: 0 },
    xAxis: {
      type: "category",
      data: daily.map((item) => item.date.slice(5)),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: palette.axis } },
      axisLabel: { color: palette.text },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: palette.grid } },
      axisLabel: { color: palette.text },
    },
    series: [
      {
        name: "调用",
        type: "line",
        smooth: true,
        symbolSize: 6,
        data: daily.map((item) => item.calls),
        lineStyle: { width: 3, color: mint },
        itemStyle: { color: mint },
      },
      {
        name: "活跃 Skill",
        type: "bar",
        data: daily.map((item) => item.uniqueSkills),
        barWidth: 10,
        itemStyle: { borderRadius: 6, color: blue },
      },
    ],
    tooltip: {
      trigger: "axis",
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      textStyle: { color: palette.tooltipText },
    },
  };

  const heatmapOption = {
    backgroundColor: "transparent",
    grid: { left: 64, right: 20, top: 18, bottom: 32 },
    xAxis: {
      type: "category",
      data: Array.from({ length: 24 }, (_, hour) => `${hour}`),
      splitArea: { show: true },
      axisLabel: { color: palette.text },
    },
    yAxis: {
      type: "category",
      data: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
      splitArea: { show: true },
      axisLabel: { color: palette.text },
    },
    visualMap: {
      min: 0,
      max: maxHourly,
      show: false,
      inRange: { color: [palette.heatLow, "rgba(158,230,198,.85)"] },
    },
    series: [
      {
        type: "heatmap",
        data: hourly.map((item) => [item.hour, item.weekday, item.calls]),
        label: { show: false },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: "rgba(0,0,0,.35)" },
        },
      },
    ],
    tooltip: {
      position: "top",
      backgroundColor: palette.tooltipBg,
      borderColor: palette.tooltipBorder,
      textStyle: { color: palette.tooltipText },
    },
  };

  return (
    <div className="two-chart-view">
      <ChartCard tall title="调用趋势" subtitle="调用次数与每日活跃 Skill 数" option={trendOption} theme={theme} />
      <ChartCard tall title="时间热力图" subtitle="按日志时间聚合，空白代表没有记录" option={heatmapOption} theme={theme} />
    </div>
  );
}
