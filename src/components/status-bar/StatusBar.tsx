import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import "./status-bar.scss";

export function StatusBar() {
  const { mode, toggleMode } = useLiveAPIContext();

  const handleModeToggle = async (targetMode: "passive" | "active") => {
    if (mode !== targetMode) {
      await toggleMode();
    }
  };

  return (
    <div className="status-bar">
      <div className="status-bar__mode">
        <span className="status-bar__label">MODE</span>
        <div className="status-bar__toggle">
          <button
            className={`status-bar__toggle-btn ${
              mode === "active" ? "status-bar__toggle-btn--active" : ""
            }`}
            onClick={() => handleModeToggle("active")}
            aria-pressed={mode === "active"}
          >
            ACTIVE
          </button>
          <button
            className={`status-bar__toggle-btn ${
              mode === "passive" ? "status-bar__toggle-btn--active" : ""
            }`}
            onClick={() => handleModeToggle("passive")}
            aria-pressed={mode === "passive"}
          >
            PASSIVE
          </button>
        </div>
      </div>
    </div>
  );
}

export default StatusBar;
