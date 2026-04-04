import { LiveServerToolCall } from "@google/genai";
import { createQrScannerHandler, qrScanDeclaration } from "./qr-scanner";
import { tts } from "../lib/tts-feedback";
import { parseUpiQr, isUpiQrCode } from "../lib/upi-qr-parser";
import { OverlayState } from "../components/qr-scanner-overlay/QrScannerOverlay";
import { paymentHistory } from "../lib/payment-history-store";

type SendResponseFn = (
  responses: {
    response: { output: { success: boolean; data?: string; error?: string } };
    id: string;
    name: string;
  }[]
) => void;

interface QrScannerWithFeedbackDeps {
  preferredCamera?: "environment" | "user";
  scanTimeoutMs?: number;
}

/**
 * Creates a QR scanner handler with visual and audio feedback.
 * Wraps the existing QR scanner handler to add TTS and overlay updates.
 */
export function createQrScannerWithFeedback(
  videoElement: HTMLVideoElement | null,
  setOverlayState: (state: OverlayState) => void,
  deps?: QrScannerWithFeedbackDeps
) {
  const baseHandler = createQrScannerHandler(videoElement, deps);

  const handleToolCall = (
    toolCall: LiveServerToolCall,
    sendResponse: SendResponseFn
  ) => {
    // Check if this is a QR scan call
    const fc = toolCall.functionCalls?.find(
      (f) => f.name === qrScanDeclaration.name
    );
    if (!fc) return;

    // Show scanning UI + TTS
    setOverlayState({ state: "scanning" });
    tts.scanningStart();

    // Wrap the response to add feedback
    const wrappedSendResponse: SendResponseFn = (responses) => {
      const result = responses[0]?.response?.output;

      if (result?.success && result?.data) {
        // QR detected successfully
        setOverlayState({ state: "detected" });
        tts.qrDetected();

        // Check if it's a UPI QR code
        if (isUpiQrCode(result.data)) {
          const upi = parseUpiQr(result.data);

          if (upi) {
            // Log to payment history
            paymentHistory.logQrScan({
              success: true,
              upiId: upi.pa,
              merchantName: upi.pn,
              amount: upi.am,
              rawData: result.data,
            });

            // Show success with UPI info after brief delay
            setTimeout(() => {
              setOverlayState({ state: "success", upiData: upi });
              tts.paymentInfo(upi.pn || upi.pa, upi.am);
            }, 500);

            // Auto-dismiss after showing info
            setTimeout(() => setOverlayState({ state: "idle" }), 4000);
          } else {
            // Invalid UPI format
            paymentHistory.logQrScan({
              success: false,
              rawData: result.data,
            });
            paymentHistory.logError("Invalid UPI QR format", "qr-scanner");

            setTimeout(() => {
              setOverlayState({ state: "error", message: "Invalid UPI QR format" });
              tts.invalidQr();
            }, 500);
            setTimeout(() => setOverlayState({ state: "idle" }), 3500);
          }
        } else {
          // Non-UPI QR code - log and show detected state
          paymentHistory.logQrScan({
            success: true,
            rawData: result.data,
          });
          setTimeout(() => setOverlayState({ state: "idle" }), 2000);
        }
      } else {
        // Scan failed
        const errorMsg = result?.error || "Scan failed";
        setOverlayState({ state: "error", message: errorMsg });

        // Log failed scan
        paymentHistory.logQrScan({
          success: false,
        });
        if (errorMsg.includes("timeout") || errorMsg.includes("No QR")) {
          paymentHistory.logError("No QR code found in view", "qr-scanner");
          tts.noQrFound();
        } else {
          paymentHistory.logError(errorMsg, "qr-scanner");
          tts.error(errorMsg);
        }

        // Auto-dismiss error
        setTimeout(() => setOverlayState({ state: "idle" }), 3000);
      }

      // Pass through to original response handler
      sendResponse(responses);
    };

    // Call the base handler with wrapped response
    baseHandler.handleToolCall(toolCall, wrappedSendResponse);
  };

  return {
    handleToolCall,
    cleanup: baseHandler.cleanup,
    declaration: qrScanDeclaration,
  };
}
