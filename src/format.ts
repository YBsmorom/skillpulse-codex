export function formatTime(value?: string): string {
  if (!value) return "暂无记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortPath(value: string, max = 68): string {
  if (value.length <= max) return value;
  return `${value.slice(0, 28)}...${value.slice(-max + 31)}`;
}

export function confidenceLabel(value: string): string {
  if (value === "high") return "同轮次";
  if (value === "medium") return "相邻轮次";
  return "同会话";
}

export function sourceLabel(value: string): string {
  const map: Record<string, string> = {
    user: "用户",
    agent: "Agent",
    system: "系统",
    plugin: "插件",
    unknown: "未知",
  };
  return map[value] ?? value;
}

