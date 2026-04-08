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

import { useRef, useState, useCallback } from "react";
import "./App.scss";
import { LiveAPIProvider } from "./contexts/LiveAPIContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import AppLayout from "./components/layout/AppLayout";
import CommandSidebar from "./components/command-sidebar/CommandSidebar";
import StatusBar from "./components/status-bar/StatusBar";
import VideoHUD from "./components/video-hud/VideoHUD";
import NarrationConsole from "./components/narration-console/NarrationConsole";

import BottomStatus from "./components/bottom-status/BottomStatus";
import { Altair } from "./components/altair/Altair";
import ControlTray from "./components/control-tray/ControlTray";
import cn from "classnames";
import { LiveClientOptions } from "./types";
import { QrScannerOverlay, OverlayState } from "./components/qr-scanner-overlay/QrScannerOverlay";
import { PaymentToolHandler } from "./components/payment-tool-handler/PaymentToolHandler";
import { PaymentHistoryDrawer } from "./components/payment-history-drawer/PaymentHistoryDrawer";
import { Esp32Provider } from "./contexts/Esp32Context";

const API_KEY = process.env.REACT_APP_GEMINI_API_KEY as string;
if (typeof API_KEY !== "string") {
  throw new Error("set REACT_APP_GEMINI_API_KEY in .env");
}

const apiOptions: LiveClientOptions = {
  apiKey: API_KEY,
  // Use v1alpha API version to enable proactive audio feature
  httpOptions: { apiVersion: "v1alpha" },
};

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [overlayState, setOverlayState] = useState<OverlayState>({ state: "idle" });
  const [isPaymentDrawerOpen, setIsPaymentDrawerOpen] = useState(false);

  // Memoize setOverlayState to prevent unnecessary re-renders
  const handleOverlayStateChange = useCallback((state: OverlayState) => {
    setOverlayState(state);
  }, []);

  const togglePaymentDrawer = useCallback(() => {
    setIsPaymentDrawerOpen((prev) => !prev);
  }, []);

  const mainContent = (
    <>
      <VideoHUD
        isRecording={!!videoStream}
      >
        <video
          className={cn("stream", {
            hidden: !videoRef.current || !videoStream,
          })}
          ref={videoRef}
          autoPlay
          playsInline
        />
      </VideoHUD>
      <Altair />
    </>
  );

  const controlTray = (
    <ControlTray
      videoRef={videoRef}
      supportsVideo={true}
      onVideoStreamChange={setVideoStream}
      enableEditingSettings={true}
      onPaymentHistoryClick={togglePaymentDrawer}
    />
  );

  return (
    <div className="App">
      <ThemeProvider>
        <Esp32Provider>
          <LiveAPIProvider options={apiOptions}>
            {/* QR Scanner Overlay - renders on top when active */}
            <QrScannerOverlay {...overlayState} />
            
            {/* Payment History Drawer */}
            <PaymentHistoryDrawer 
              isOpen={isPaymentDrawerOpen} 
              onClose={() => setIsPaymentDrawerOpen(false)} 
            />
            
            {/* Payment tool handler - listens for QR/UPI tool calls */}
            <PaymentToolHandler 
              videoRef={videoRef} 
              setOverlayState={handleOverlayStateChange} 
            />
            
            <AppLayout
              sidebar={<CommandSidebar />}
              statusBar={<StatusBar />}
              mainContent={mainContent}
              narrationConsole={<NarrationConsole />}
              bottomStatus={<BottomStatus />}
              controlTray={controlTray}
              videoRef={videoRef}
              videoStream={videoStream}
            />
          </LiveAPIProvider>
        </Esp32Provider>
      </ThemeProvider>
    </div>
  );
}

export default App;
