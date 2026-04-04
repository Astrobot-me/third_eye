import { ReactNode, memo } from "react";
import cn from "classnames";
import "./video-hud.scss";

export interface Detection {
  id: string;
  label: string;
  confidence: number;
  bounds: { x: number; y: number; width: number; height: number };
  type: "hazard" | "object" | "person";
}

export interface VideoHUDProps {
  children: ReactNode;
  isRecording?: boolean;
  detections?: Detection[];
}

function VideoHUD({
  children,
  isRecording = false,
  detections = [],
}: VideoHUDProps) {
  return (
    <div className="video-hud">
      <div className="video-hud__content">{children}</div>

      {/* Top-left status cluster */}
      {isRecording && (
        <div className="video-hud__top-left">
          <div className="video-hud__rec-indicator">
            <span className="video-hud__rec-dot" />
            <span className="video-hud__rec-label">REC</span>
            <span className="video-hud__live-badge">[LIVE]</span>
          </div>
        </div>
      )}

      {/* Detection boxes overlay */}
      {detections.map((detection) => (
        <div
          key={detection.id}
          className={cn("video-hud__detection", {
            "video-hud__detection--hazard": detection.type === "hazard",
            "video-hud__detection--object": detection.type === "object",
            "video-hud__detection--person": detection.type === "person",
          })}
          style={{
            left: `${detection.bounds.x}%`,
            top: `${detection.bounds.y}%`,
            width: `${detection.bounds.width}%`,
            height: `${detection.bounds.height}%`,
          }}
        >
          <span
            className={cn("video-hud__detection-label", {
              "video-hud__detection-label--hazard": detection.type === "hazard",
            })}
          >
            {detection.label}
            <span className="video-hud__detection-confidence">
              {Math.round(detection.confidence * 100)}%
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default memo(VideoHUD);
