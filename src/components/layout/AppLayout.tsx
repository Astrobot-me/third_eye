import { ReactNode, RefObject } from "react";
import "./app-layout.scss";

export interface AppLayoutProps {
  sidebar: ReactNode;
  statusBar: ReactNode;
  mainContent: ReactNode;
  narrationConsole: ReactNode;
  bottomStatus: ReactNode;
  controlTray: ReactNode;
  videoRef: RefObject<HTMLVideoElement>;
  videoStream: MediaStream | null;
}

export default function AppLayout({
  sidebar,
  statusBar,
  mainContent,
  narrationConsole,
  bottomStatus,
  controlTray,
}: AppLayoutProps) {
  return (
    <div className="command-center">
      {/* Left Sidebar */}
      <aside className="command-sidebar-container">
        {sidebar}
      </aside>

      {/* Main Content Area */}
      <div className="main-area">
        {/* Status Bar */}
        <div className="status-bar-container">
          {statusBar}
        </div>

        {/* Main Video & Content */}
        <main className="content-area">
          {mainContent}
        </main>

        {/* Control Tray */}
        <div className="control-tray-container">
          {controlTray}
        </div>

        {/* Bottom Status */}
        <footer className="bottom-status-container">
          {bottomStatus}
        </footer>
      </div>

      {/* Right Narration Console */}
      <aside className="narration-console-container">
        {narrationConsole}
      </aside>
    </div>
  );
}
