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
}

export function createQrScannerHandler(
  videoElement: HTMLVideoElement | null,
  deps?: QrScannerHandlerDeps
) {
  let qrScanner: QrScanner | null = null;
  let scanTimeout: ReturnType<typeof setTimeout> | null = null;
  const options = {
    preferredCamera: deps?.preferredCamera || "environment",
    scanTimeoutMs: deps?.scanTimeoutMs || 30000,
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

    const preferredCamera = ((fc.args as unknown as { preferredCamera?: string })?.preferredCamera) as "environment" | "user" || options.preferredCamera;
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

    if (qrScanner) {
      qrScanner.destroy();
    }

    const cleanupTimeout = () => {
      if (scanTimeout) {
        clearTimeout(scanTimeout);
        scanTimeout = null;
      }
    };

    qrScanner = new QrScanner(
      videoElement,
      (result: QrScanner.ScanResult) => {
        cleanupTimeout();
        const data = result.data;
        qrScanner?.stop();
        sendResponse([
          {
            response: { output: { success: true, data } },
            id: toolId || "unknown",
            name: toolName || "scan_qr_code",
          },
        ]);
      },
      {
        preferredCamera,
        returnDetailedScanResult: true,
        onDecodeError: (error: Error | string) => {
          const errorMsg = typeof error === "string" ? error : error.message;
          if (errorMsg !== QrScanner.NO_QR_CODE_FOUND) {
            cleanupTimeout();
            qrScanner?.stop();
            sendResponse([
              {
                response: { output: { success: false, error: errorMsg } },
                id: toolId || "unknown",
                name: toolName || "scan_qr_code",
              },
            ]);
          }
        },
      }
    );

    qrScanner.start().then(() => {
      scanTimeout = setTimeout(() => {
        if (qrScanner) {
          qrScanner.stop();
          qrScanner.destroy();
          qrScanner = null;
          sendResponse([
            {
              response: { output: { success: false, error: "Scan timeout: No QR code detected within " + (options.scanTimeoutMs / 1000) + " seconds" } },
              id: toolId || "unknown",
              name: toolName || "scan_qr_code",
            },
          ]);
        }
      }, options.scanTimeoutMs);
    }).catch((err: Error) => {
      sendResponse([
        {
          response: { output: { success: false, error: err.message } },
          id: toolId || "unknown",
          name: toolName || "scan_qr_code",
        },
      ]);
    });
  };

  const cleanup = () => {
    if (scanTimeout) {
      clearTimeout(scanTimeout);
      scanTimeout = null;
    }
    if (qrScanner) {
      qrScanner.stop();
      qrScanner.destroy();
      qrScanner = null;
    }
  };

  return { handleToolCall, cleanup };
}
