import type { ReactNode } from "react";

interface ShellProps {
  activeTab: string;
  expanded: boolean;
  status: string;
  tabs: string[];
  onTab: (tab: string) => void;
  onRefresh: () => void;
  onExpand: () => void;
  onClose: () => void;
  children: ReactNode;
}

export function Shell({
  activeTab,
  expanded,
  status,
  tabs,
  onTab,
  onRefresh,
  onExpand,
  onClose,
  children,
}: ShellProps) {
  return (
    <main className={expanded ? "panel-shell is-expanded" : "panel-shell"}>
      <header className="panel-topbar">
        <div>
          <div className="title-row">
            <span className="brand-mark" />
            <div>
              <h1>SkillPulse</h1>
              <p>Codex Skill 使用小记</p>
            </div>
          </div>
        </div>
        <div className="status-line">{status}</div>
        <div className="window-actions">
          <WindowAction label="刷新" onClick={onRefresh}>
            <path d="M18.5 9a6.5 6.5 0 0 0-11.1-4.6L5.8 6" />
            <path d="M5.5 2.5V6h3.5" />
            <path d="M5.5 15a6.5 6.5 0 0 0 11.1 4.6l1.6-1.6" />
            <path d="M18.5 21.5V18h-3.5" />
          </WindowAction>
          <WindowAction label={expanded ? "缩小" : "放大"} onClick={onExpand}>
            {expanded ? (
              <>
                <path d="M8 3v5H3" />
                <path d="M16 21v-5h5" />
                <path d="M3 8l5-5" />
                <path d="M21 16l-5 5" />
              </>
            ) : (
              <>
                <path d="M8 3H3v5" />
                <path d="M16 3h5v5" />
                <path d="M8 21H3v-5" />
                <path d="M16 21h5v-5" />
              </>
            )}
          </WindowAction>
          <WindowAction label="关闭" onClick={onClose}>
            <path d="M6 6l12 12" />
            <path d="M18 6L6 18" />
          </WindowAction>
        </div>
      </header>
      <nav className="rail-tabs">
        {tabs.map((tab) => (
          <button className={activeTab === tab ? "active" : ""} key={tab} onClick={() => onTab(tab)}>
            {tab}
          </button>
        ))}
      </nav>
      <section className="panel-content">{children}</section>
    </main>
  );
}

function WindowAction({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button aria-label={label} className="window-action-button" onClick={onClick} title={label}>
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        {children}
      </svg>
    </button>
  );
}
