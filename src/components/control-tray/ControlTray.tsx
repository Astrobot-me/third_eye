/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import cn from "classnames";

import { memo, ReactNode, RefObject, useEffect, useRef, useState } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { UseMediaStreamResult } from "../../hooks/use-media-stream-mux";
import { useScreenCapture } from "../../hooks/use-screen-capture";
import { useWebcam } from "../../hooks/use-webcam";
import { AudioRecorder } from "../../lib/audio-recorder";
import { ACTIVE_MODE_TRIGGER_PROMPT } from "../../lib/active-mode-prompt";
import AudioPulse from "../audio-pulse/AudioPulse";
import "./control-tray.scss";
import SettingsDialog from "../settings-dialog/SettingsDialog";

export type ControlTrayProps = {
  videoRef: RefObject<HTMLVideoElement>;
  children?: ReactNode;
  supportsVideo: boolean;
  onVideoStreamChange?: (stream: MediaStream | null) => void;
  enableEditingSettings?: boolean;
};

type MediaStreamButtonProps = {
  isStreaming: boolean;
  onIcon: string;
  offIcon: string;
  start: () => Promise<any>;
  stop: () => any;
};

/**
 * button used for triggering webcam or screen-capture
 */
const MediaStreamButton = memo(
  ({ isStreaming, onIcon, offIcon, start, stop }: MediaStreamButtonProps) =>
    isStreaming ? (
      <button className="action-button" onClick={stop}>
        <span className="material-symbols-outlined">{onIcon}</span>
      </button>
    ) : (
      <button className="action-button" onClick={start}>
        <span className="material-symbols-outlined">{offIcon}</span>
      </button>
    )
);

function ControlTray({
  videoRef,
  children,
  onVideoStreamChange = () => {},
  supportsVideo,
  enableEditingSettings,
}: ControlTrayProps) {
  const videoStreams = [useWebcam(), useScreenCapture()];
  const [activeVideoStream, setActiveVideoStream] =
    useState<MediaStream | null>(null);
  const [webcam, screenCapture] = videoStreams;
  const [inVolume, setInVolume] = useState(0);
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const [pushToTalkActive, setPushToTalkActive] = useState(false);
  const isMicActive = !muted || pushToTalkActive;
  
  // Use separate refs for muted and pushToTalkActive to avoid async useEffect timing issues
  const mutedRef = useRef(muted);
  const pushToTalkActiveRef = useRef(pushToTalkActive);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const connectButtonRef = useRef<HTMLButtonElement>(null);

  // Update refs synchronously (not in useEffect) to ensure audio gating uses current values
  mutedRef.current = muted;
  pushToTalkActiveRef.current = pushToTalkActive;

  const { client, connected, connect, disconnect, volume, mode, toggleMode } =
    useLiveAPIContext();

  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--volume",
      `${Math.max(5, Math.min(inVolume * 200, 8))}px`
    );
  }, [inVolume]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore key repeat events to prevent spurious state updates
      if (e.repeat) return;
      
      const target = e.target as HTMLElement;
      if (e.code === "Space" && target.tagName !== "INPUT" && target.tagName !== "TEXTAREA") {
        e.preventDefault();
        setPushToTalkActive(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setPushToTalkActive(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const onData = (base64: string) => {
      // Check refs directly for most up-to-date values (avoids async useEffect timing issues)
      const isActive = !mutedRef.current || pushToTalkActiveRef.current;
      if (isActive) {
        client.sendRealtimeInput([
          {
            mimeType: "audio/pcm;rate=16000",
            data: base64,
          },
        ]);
      }
    };
    const onVolume = (vol: number) => {
      const isActive = !mutedRef.current || pushToTalkActiveRef.current;
      if (isActive) {
        setInVolume(vol);
      } else {
        setInVolume(0);
      }
    };

    if (connected && audioRecorder) {
      audioRecorder.on("data", onData).on("volume", onVolume).start();
    } else {
      audioRecorder.stop();
      setInVolume(0);
    }
    return () => {
      audioRecorder.off("data", onData).off("volume", onVolume);
    };
  }, [connected, client, audioRecorder]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = activeVideoStream;
    }

    let timeoutId = -1;

    function sendVideoFrame() {
      const video = videoRef.current;
      const canvas = renderCanvasRef.current;

      if (!video || !canvas) {
        return;
      }

      const ctx = canvas.getContext("2d")!;
      canvas.width = video.videoWidth * 0.25;
      canvas.height = video.videoHeight * 0.25;
      if (canvas.width + canvas.height > 0) {
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg", 1.0);
        const data = base64.slice(base64.indexOf(",") + 1, Infinity);
        client.sendRealtimeInput([{ mimeType: "image/jpeg", data }]);
      }
      // Only continue loop if connected AND in active mode (or has video stream in passive)
      if (connected && activeVideoStream !== null) {
        timeoutId = window.setTimeout(sendVideoFrame, 1000 / 0.5);
      }
    }
    
    // Only send video frames if:
    // - In active mode: always send when connected with video stream
    // - In passive mode: only send when video stream is explicitly active AND user has enabled it
    // Note: The existing logic already handles when video streams are active via the hooks
    // In passive mode, we rely on the user manually activating streams via the UI
    if (connected && activeVideoStream !== null) {
      // In active mode: always stream when we have a stream
      // In passive mode: we still send frames when there's a stream (user-activated)
      // The difference is that in passive mode, streams aren't auto-activated
      requestAnimationFrame(sendVideoFrame);
    }
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, [connected, activeVideoStream, client, videoRef, mode]); // Added mode to dependencies

  // Active mode narration trigger - sends periodic prompts to make model describe scene
  useEffect(() => {
    if (!connected || mode !== 'active' || !activeVideoStream) {
      return;
    }

    // Send initial trigger after connecting in active mode
    const initialDelay = setTimeout(() => {
      client.send({ text: ACTIVE_MODE_TRIGGER_PROMPT });
    }, 1000);

    // Send trigger prompt every 4 seconds in active mode
    const intervalId = setInterval(() => {
      client.send({ text: ACTIVE_MODE_TRIGGER_PROMPT });
    }, 4000);

    return () => {
      clearTimeout(initialDelay);
      clearInterval(intervalId);
    };
  }, [connected, mode, activeVideoStream, client]);

  //handler for swapping from one video-stream to the next
  const changeStreams = (next?: UseMediaStreamResult) => async () => {
    if (next) {
      const mediaStream = await next.start();
      setActiveVideoStream(mediaStream);
      onVideoStreamChange(mediaStream);
    } else {
      setActiveVideoStream(null);
      onVideoStreamChange(null);
    }

    videoStreams.filter((msr) => msr !== next).forEach((msr) => msr.stop());
  };

  return (
    <section className="control-tray">
      <canvas style={{ display: "none" }} ref={renderCanvasRef} />
      <nav className={cn("actions-nav", { disabled: !connected })}>
        <button
          className={cn("action-button mic-button")}
          onClick={() => setMuted(!muted)}
        >
          {isMicActive ? (
            <span className="material-symbols-outlined filled">mic</span>
          ) : (
            <span className="material-symbols-outlined filled">mic_off</span>
          )}
        </button>

        <div className="action-button no-action outlined">
          <AudioPulse volume={volume} active={connected} hover={false} />
        </div>

        {supportsVideo && (
          <>
            <MediaStreamButton
              isStreaming={screenCapture.isStreaming}
              start={changeStreams(screenCapture)}
              stop={changeStreams()}
              onIcon="cancel_presentation"
              offIcon="present_to_all"
            />
            <MediaStreamButton
              isStreaming={webcam.isStreaming}
              start={changeStreams(webcam)}
              stop={changeStreams()}
              onIcon="videocam_off"
              offIcon="videocam"
            />
          </>
        )}
        {/* Mode toggle button */}
        <button
          className={cn("action-button mode-toggle", { active: mode === 'active' })}
          onClick={toggleMode}
          aria-label={`Switch to ${mode === 'passive' ? 'active' : 'passive'} mode`}
          title={mode === 'passive' ? 'Enable Active Mode' : 'Disable Active Mode'}
        >
          <span className="material-symbols-outlined">
            {mode === 'active' ? 'visibility' : 'visibility_off'}
          </span>
        </button>
        {children}
      </nav>

      <div className={cn("connection-container", { connected })}>
        <div className="connection-button-container">
          <button
            ref={connectButtonRef}
            className={cn("action-button connect-toggle", { connected })}
            onClick={connected ? disconnect : connect}
          >
            <span className="material-symbols-outlined filled">
              {connected ? "pause" : "play_arrow"}
            </span>
          </button>
        </div>
        <span className="text-indicator">Streaming</span>
      </div>
      {enableEditingSettings ? <SettingsDialog /> : ""}
    </section>
  );
}

export default memo(ControlTray);