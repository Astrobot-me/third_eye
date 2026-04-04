import { FunctionDeclaration, LiveServerToolCall, Type } from "@google/genai";
import { createQrScannerWithFeedback } from "./qr-scanner-with-feedback";
import { parseUpiQr, generateUpiDeepLink, UpiQrData } from "../lib/upi-qr-parser";
import { tts } from "../lib/tts-feedback";
import { OverlayState } from "../components/qr-scanner-overlay/QrScannerOverlay";
import { paymentHistory } from "../lib/payment-history-store";

/**
 * Combined make_payment tool declaration.
 * Orchestrates QR scanning and UPI payment in one step.
 */
export const makePaymentDeclaration: FunctionDeclaration = {
  name: "make_payment",
  description:
    "Scans a QR code and initiates UPI payment. Use when user wants to pay via QR code. " +
    "The tool will scan for a QR code, extract UPI details, and open the payment app.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      amount: {
        type: Type.NUMBER,
        description:
          "Payment amount in INR. Optional - will use amount from QR if present. " +
          "If QR has no amount and this is not provided, user will be prompted.",
      },
      note: {
        type: Type.STRING,
        description: "Optional note for the payment transaction.",
      },
    },
  },
};

interface MakePaymentArgs {
  amount?: number;
  note?: string;
}

type SendResponseFn = (
  responses: {
    response: {
      output: {
        success: boolean;
        payment_url?: string;
        upi_data?: UpiQrData;
        error?: string;
      };
    };
    id: string;
    name: string;
  }[]
) => void;

/**
 * Creates a combined payment handler that orchestrates QR scan → UPI payment.
 */
export function createMakePaymentHandler(
  videoElement: HTMLVideoElement | null,
  setOverlayState: (state: OverlayState) => void
) {
  // We use the QR scanner with feedback for the scanning step
  const qrHandler = createQrScannerWithFeedback(videoElement, setOverlayState);

  const handleToolCall = async (
    toolCall: LiveServerToolCall,
    sendResponse: SendResponseFn
  ) => {
    const fc = toolCall.functionCalls?.find(
      (f) => f.name === makePaymentDeclaration.name
    );
    if (!fc) return;

    const args = (fc.args as unknown as MakePaymentArgs) || {};
    const toolId = fc.id || "unknown";
    const toolName = fc.name || "make_payment";

    // Step 1: Show scanning overlay and TTS
    setOverlayState({ state: "scanning" });
    tts.scanningStart();

    // Step 2: Scan QR code
    // We'll manually trigger the scan since we need to process the result
    try {
      const qrResult = await scanQrCode(videoElement);

      if (!qrResult.success || !qrResult.data) {
        setOverlayState({ state: "error", message: qrResult.error || "No QR code found" });
        tts.noQrFound();
        paymentHistory.logQrScan({ success: false });
        paymentHistory.logError(qrResult.error || "No QR code found", "make_payment");
        setTimeout(() => setOverlayState({ state: "idle" }), 3000);

        sendResponse([
          {
            response: {
              output: {
                success: false,
                error: qrResult.error || "No QR code found",
              },
            },
            id: toolId,
            name: toolName,
          },
        ]);
        return;
      }

      // Step 3: Parse UPI data
      setOverlayState({ state: "detected" });
      tts.qrDetected();

      const upi = parseUpiQr(qrResult.data);

      if (!upi) {
        paymentHistory.logQrScan({ success: false, rawData: qrResult.data });
        paymentHistory.logError("Not a valid UPI QR code", "make_payment");
        setTimeout(() => {
          setOverlayState({ state: "error", message: "Not a valid UPI QR code" });
          tts.invalidQr();
        }, 500);
        setTimeout(() => setOverlayState({ state: "idle" }), 3500);

        sendResponse([
          {
            response: {
              output: {
                success: false,
                error: "Not a valid UPI QR code",
              },
            },
            id: toolId,
            name: toolName,
          },
        ]);
        return;
      }

      // Step 4: Log successful QR scan
      paymentHistory.logQrScan({
        success: true,
        upiId: upi.pa,
        merchantName: upi.pn,
        amount: upi.am,
        rawData: qrResult.data,
      });

      // Show success with UPI info
      setTimeout(() => {
        setOverlayState({ state: "success", upiData: upi });
        tts.paymentInfo(upi.pn || upi.pa, args.amount || upi.am);
      }, 500);

      // Step 5: Determine final amount
      const finalAmount = args.amount || upi.am;

      // Step 6: Generate payment URL and open app
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Let user hear the info

      tts.openingApp();

      // Update note if provided
      const paymentData: UpiQrData = {
        ...upi,
        tn: args.note || upi.tn,
      };

      const paymentUrl = generateUpiDeepLink(paymentData, finalAmount);

      // Log payment initiation
      paymentHistory.logPayment({
        upiId: upi.pa,
        merchantName: upi.pn,
        amount: finalAmount || 0,
        status: "initiated",
        deepLink: paymentUrl,
        note: args.note,
      });

      // Open payment app
      window.location.href = paymentUrl;

      // Auto-dismiss overlay
      setTimeout(() => setOverlayState({ state: "idle" }), 1000);

      sendResponse([
        {
          response: {
            output: {
              success: true,
              payment_url: paymentUrl,
              upi_data: upi,
            },
          },
          id: toolId,
          name: toolName,
        },
      ]);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Payment failed";
      setOverlayState({ state: "error", message: errorMsg });
      tts.paymentError(errorMsg);
      paymentHistory.logError(errorMsg, "make_payment");
      setTimeout(() => setOverlayState({ state: "idle" }), 3000);

      sendResponse([
        {
          response: {
            output: {
              success: false,
              error: errorMsg,
            },
          },
          id: toolId,
          name: toolName,
        },
      ]);
    }
  };

  const cleanup = () => {
    qrHandler.cleanup();
  };

  return {
    handleToolCall,
    cleanup,
    declaration: makePaymentDeclaration,
  };
}

/**
 * Helper function to scan QR code from video element.
 * Uses scanImage() static method to avoid hijacking the video stream.
 * Returns a promise that resolves with the scan result.
 */
async function scanQrCode(
  videoElement: HTMLVideoElement | null
): Promise<{ success: boolean; data?: string; error?: string }> {
  return new Promise((resolve) => {
    if (!videoElement) {
      resolve({ success: false, error: "Video element not available" });
      return;
    }

    // Check if video is actually playing
    if (videoElement.readyState < 2 || videoElement.paused) {
      resolve({ success: false, error: "Video stream not ready. Please ensure webcam is active." });
      return;
    }

    let resolved = false;
    let scanInterval: ReturnType<typeof setInterval> | null = null;
    let scanTimeout: ReturnType<typeof setTimeout> | null = null;

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

    // Dynamic import qr-scanner
    import("qr-scanner").then(({ default: QrScanner }) => {
      // Use scanImage() in a polling loop - doesn't hijack the video stream
      scanInterval = setInterval(async () => {
        if (resolved) return;

        try {
          // scanImage() is a static method that scans from existing video
          // It doesn't request camera permissions or modify srcObject
          const result = await QrScanner.scanImage(videoElement, {
            returnDetailedScanResult: true,
          });

          if (result && result.data && !resolved) {
            resolved = true;
            cleanup();
            resolve({ success: true, data: result.data });
          }
        } catch {
          // No QR code found in this frame, keep scanning
        }
      }, 200); // Scan every 200ms

      // Timeout after 15 seconds
      scanTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve({
            success: false,
            error: "Scan timeout: No QR code detected within 15 seconds",
          });
        }
      }, 15000);
    }).catch((err) => {
      resolve({ success: false, error: `Failed to load scanner: ${err.message}` });
    });
  });
}
