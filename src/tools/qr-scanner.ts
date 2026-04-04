import { FunctionDeclaration, LiveServerToolCall, Type } from "@google/genai";
import QrScanner from "qr-scanner";

export const qrScanDeclaration: FunctionDeclaration = {
  name: "scan_qr_code",
  description: "Scans a QR code from the webcam video stream and returns the decoded content.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      preferredCamera: {
        type: Type.STRING,
        description: "Camera preference: 'environment' for back camera, 'user' for front camera",
        enum: ["environment", "user"],
      },
    },
  },
};

interface QrScannerHandlerDeps {
  preferredCamera?: "environment" | "user";
  scanTimeoutMs?: number;
  scanIntervalMs?: number;
}

export function createQrScannerHandler(
  videoElement: HTMLVideoElement | null,
  deps?: QrScannerHandlerDeps
) {
  let scanInterval: ReturnType<typeof setInterval> | null = null;
  let scanTimeout: ReturnType<typeof setTimeout> | null = null;
  
  const options = {
    preferredCamera: deps?.preferredCamera || "environment",
    scanTimeoutMs: deps?.scanTimeoutMs || 30000,
    scanIntervalMs: deps?.scanIntervalMs || 200, // Scan every 200ms
  };

  const cleanup = () => {
    if (scanInterval) {
      clearInterval(scanInterval);
      scanInterval = null;
    }
    if (scanTimeout) {
      clearTimeout(scanTimeout);
      scanTimeout = null;
    }
  };

  const handleToolCall = (
    toolCall: LiveServerToolCall,
    sendResponse: (responses: { response: { output: { success: boolean; data?: string; error?: string } }; id: string; name: string }[]) => void
  ) => {
    if (!toolCall.functionCalls) return;

    const fc = toolCall.functionCalls.find(
      (f) => f.name === qrScanDeclaration.name
    );

    if (!fc) return;

    const toolId = fc.id;
    const toolName = fc.name;

    if (!videoElement) {
      sendResponse([
        {
          response: { output: { success: false, error: "Video element not available" } },
          id: toolId || "unknown",
          name: toolName || "scan_qr_code",
        },
      ]);
      return;
    }

    // Check if video is actually playing
    if (videoElement.readyState < 2 || videoElement.paused) {
      sendResponse([
        {
          response: { output: { success: false, error: "Video stream not ready. Please ensure webcam is active." } },
          id: toolId || "unknown",
          name: toolName || "scan_qr_code",
        },
      ]);
      return;
    }

    // Clean up any previous scan
    cleanup();

    let resolved = false;

    // Use scanImage() in a polling loop - doesn't hijack the video stream
    scanInterval = setInterval(async () => {
      if (resolved) return;

      try {
        // scanImage() is a static method that scans from existing video/image
        // It doesn't request camera permissions or modify srcObject
        const result = await QrScanner.scanImage(videoElement, {
          returnDetailedScanResult: true,
        });

        if (result && result.data && !resolved) {
          resolved = true;
          cleanup();
          sendResponse([
            {
              response: { output: { success: true, data: result.data } },
              id: toolId || "unknown",
              name: toolName || "scan_qr_code",
            },
          ]);
        }
      } catch {
        // No QR code found in this frame, keep scanning
        // scanImage throws when no QR is found
      }
    }, options.scanIntervalMs);

    // Timeout after configured duration
    scanTimeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        sendResponse([
          {
            response: { 
              output: { 
                success: false, 
                error: `Scan timeout: No QR code detected within ${options.scanTimeoutMs / 1000} seconds` 
              } 
            },
            id: toolId || "unknown",
            name: toolName || "scan_qr_code",
          },
        ]);
      }
    }, options.scanTimeoutMs);
  };

  return { handleToolCall, cleanup };
}
