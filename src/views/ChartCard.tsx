import { useEffect, useRef } from "react";
import { echarts } from "../charts";
import type { AppThemeMode } from "../charts";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  option: Record<string, unknown>;
  tall?: boolean;
  className?: string;
  theme?: AppThemeMode;
}

export function ChartCard({ title, subtitle, option, tall, className, theme }: ChartCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, theme === "light" ? undefined : "dark", { renderer: "canvas" });
    chart.setOption(option, { notMerge: true, lazyUpdate: false });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [option, theme]);

  return (
    <section className={["surface chart-card", tall ? "tall" : "", className ?? ""].filter(Boolean).join(" ")}>
      <div className="section-heading">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="chart-frame" ref={ref} />
    </section>
  );
}
