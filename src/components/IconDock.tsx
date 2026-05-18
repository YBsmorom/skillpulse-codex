import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { SkillPulseSettings } from "../types";

export function IconDock() {
  const [settings, setSettings] = useState<SkillPulseSettings | null>(null);

  useEffect(() => {
    void invoke<SkillPulseSettings>("get_settings")
      .then(setSettings)
      .catch(() => setSettings(null));
  }, []);

  return (
    <button
      aria-label="打开 SkillPulse"
      className="dock-mark"
      onPointerDown={(event) => {
        if (event.button === 0) {
          event.preventDefault();
          void invoke("open_panel");
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        void invoke("show_dock_menu");
      }}
      title="SkillPulse"
    >
      <span className="dock-icon-frame" aria-hidden="true">
        {settings?.customIconPath ? (
          <img
            alt=""
            className="dock-custom-icon"
            draggable={false}
            src={convertFileSrc(settings.customIconPath)}
          />
        ) : (
          <svg className="dock-symbol" viewBox="0 0 24 24" role="img" aria-hidden="true">
            <path d="M4.8 17.2h14.4" />
            <path d="M6 15.6l4.1-4.4 3.2 2.9 5.1-6" />
            <path d="M18.4 8.1v4.2" />
          </svg>
        )}
      </span>
    </button>
  );
}
