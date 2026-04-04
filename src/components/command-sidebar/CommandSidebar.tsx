import { RiEyeLine } from "react-icons/ri";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import "./command-sidebar.scss";

export default function CommandSidebar() {
  const { connected, connect, disconnect } = useLiveAPIContext();

  const handleConnectionToggle = async () => {
    if (connected) {
      await disconnect();
    } else {
      await connect();
    }
  };

  return (
    <aside className="command-sidebar">
      {/* Branding Section */}
      <div className="command-sidebar__brand">
        <div className="command-sidebar__logo">
          <img className="command-sidebar__logo-icon" src="" alt=""> </img>
          <span className="command-sidebar__logo-text">Third Eye</span>
        </div>
        <div className="command-sidebar__subtitle">COMMAND_HUD</div>
        <div className="command-sidebar__status">
          <span
            className={`command-sidebar__status-dot ${connected ? "command-sidebar__status-dot--online" : ""}`}
          />
          <span className="command-sidebar__status-text">
            V-01 {connected ? "ONLINE" : "OFFLINE"}
          </span>
        </div>
      </div>

      {/* Navigation Section */}
      <nav className="command-sidebar__nav">
        <button className="command-sidebar__nav-item command-sidebar__nav-item--active">
          <span className="command-sidebar__nav-icon">
            <RiEyeLine />
          </span>
          <span className="command-sidebar__nav-label">LIVE VIEW</span>
        </button>
      </nav>

      {/* Primary CTA */}
      <div className="command-sidebar__cta">
        <button
          className={`command-sidebar__connect-btn ${connected ? "command-sidebar__connect-btn--connected" : ""}`}
          onClick={handleConnectionToggle}
        >
          <span className="command-sidebar__connect-icon">
            {connected ? "◉" : "◎"}
          </span>
          <span className="command-sidebar__connect-text">
            {connected ? "NEURAL LINK ACTIVE" : "INITIALIZE NEURAL LINK"}
          </span>
        </button>
      </div>
    </aside>
  );
}
