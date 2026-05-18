import * as echarts from "echarts";

export { echarts };

export const chartText = "rgba(255,255,255,.62)";
export const chartGrid = "rgba(255,255,255,.08)";
export const mint = "#9ee6c6";
export const blue = "#8ec5ff";
export const violet = "#c7b7ff";

export type AppThemeMode = "light" | "dark" | null;

export function chartPalette(theme: AppThemeMode) {
  const isLight =
    theme === "light" ||
    (theme === null && typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches);
  return isLight
    ? {
        text: "rgba(25, 25, 28, .74)",
        title: "rgba(12, 12, 14, .92)",
        grid: "rgba(20, 20, 22, .11)",
        axis: "rgba(20, 20, 22, .22)",
        tooltipBg: "rgba(252, 250, 247, .92)",
        tooltipBorder: "rgba(20, 20, 22, .13)",
        tooltipText: "rgba(15, 15, 18, .88)",
        heatLow: "rgba(20, 20, 22, .07)",
      }
    : {
        text: "rgba(255, 255, 255, .68)",
        title: "rgba(255, 255, 255, .9)",
        grid: "rgba(255, 255, 255, .09)",
        axis: "rgba(255, 255, 255, .14)",
        tooltipBg: "rgba(35, 35, 38, .92)",
        tooltipBorder: "rgba(255, 255, 255, .12)",
        tooltipText: "rgba(255, 255, 255, .9)",
        heatLow: "rgba(255, 255, 255, .05)",
      };
}
