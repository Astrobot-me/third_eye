import { memo } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import "./bottom-status.scss";

function BottomStatus() {
  const { connected } = useLiveAPIContext();

  return (
    <div className="bottom-status">
      <span className={`bottom-status__dot ${connected ? "connected" : "connecting"}`} />
      <span className="bottom-status__label">
        UPLINK: {connected ? "STABLE" : "CONNECTING"}
      </span>
    </div>
  );
}

export default memo(BottomStatus);
