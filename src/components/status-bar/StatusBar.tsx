import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import "./status-bar.scss";

export function StatusBar() {
  const { mode, setMode } = useLiveAPIContext();

  return (
    <div className="status-bar">
      <div className="status-bar__mode">
        <span className="status-bar__label">MODE</span>
        <div className="status-bar__toggle">
          <button
            className={`status-bar__toggle-btn ${
              mode === "active" ? "status-bar__toggle-btn--active" : ""
            }`}
            onClick={() => setMode("active")}
            aria-pressed={mode === "active"}
          >
            ACTIVE
          </button>
          <button
            className={`status-bar__toggle-btn ${
              mode === "passive" ? "status-bar__toggle-btn--active" : ""
            }`}
            onClick={() => setMode("passive")}
            aria-pressed={mode === "passive"}
          >
            PASSIVE
          </button>
          <button
            className={`status-bar__toggle-btn ${
              mode === "offline" ? "status-bar__toggle-btn--active" : ""
            }`}
            onClick={() => setMode("offline")}
            aria-pressed={mode === "offline"}
          >
            OFFLINE
          </button>
        </div>
      </div>
    </div>
  );
}

export default StatusBar;
