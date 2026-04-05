/**
 * PaymentToolHandler - Handles QR scan and UPI payment tool calls.
 * Listens for tool calls and dispatches to appropriate handlers.
 */
import { useEffect, useRef, memo } from "react";
import { useLiveAPIContext } from "../../contexts/LiveAPIContext";
import { useEsp32Context } from "../../contexts/Esp32Context";
import { LiveServerToolCall } from "@google/genai";
import { createQrScannerWithFeedback } from "../../tools/qr-scanner-with-feedback";
import { createMakePaymentHandler } from "../../tools/make-payment";
import { createUpiPaymentHandler } from "../../tools/upi-payment";
import { qrScanDeclaration } from "../../tools/qr-scanner";
import { upiPaymentDeclaration } from "../../tools/upi-payment";
import { makePaymentDeclaration } from "../../tools/make-payment";
import { OverlayState } from "../qr-scanner-overlay/QrScannerOverlay";

interface PaymentToolHandlerProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  setOverlayState: (state: OverlayState) => void;
}

function PaymentToolHandlerComponent({
  videoRef,
  setOverlayState,
}: PaymentToolHandlerProps) {
  const { client } = useLiveAPIContext();
  const { isConnected, sendToESP32, authStatus, setAuthStatus, clearAuthStatus } = useEsp32Context();

  const esp32Deps = {
    isConnected,
    sendToESP32,
    authStatus,
    setAuthStatus,
    clearAuthStatus,
  };

  // Store handlers in refs to avoid recreating on every render
  const handlersRef = useRef<{
    qr: ReturnType<typeof createQrScannerWithFeedback> | null;
    upi: ReturnType<typeof createUpiPaymentHandler> | null;
    payment: ReturnType<typeof createMakePaymentHandler> | null;
  }>({
    qr: null,
    upi: null,
    payment: null,
  });

  // Initialize handlers
  useEffect(() => {
    if (!videoRef.current) return;

    handlersRef.current.qr = createQrScannerWithFeedback(
      videoRef.current,
      setOverlayState
    );
    handlersRef.current.upi = createUpiPaymentHandler();
    handlersRef.current.payment = createMakePaymentHandler(
      videoRef.current,
      setOverlayState,
      esp32Deps
    );

    // Capture refs for cleanup
    const handlers = handlersRef.current;
    return () => {
      handlers.qr?.cleanup();
      handlers.payment?.cleanup();
    };
  }, [videoRef, setOverlayState, esp32Deps]);

  // Listen for tool calls
  useEffect(() => {
    const onToolCall = (toolCall: LiveServerToolCall) => {
      if (!toolCall.functionCalls) return;

      const sendResponse = (responses: any[]) => {
        client.sendToolResponse({
          functionResponses: responses.map((r) => ({
            response: r.response,
            id: r.id,
            name: r.name,
          })),
        });
      };

      for (const fc of toolCall.functionCalls) {
        switch (fc.name) {
          case qrScanDeclaration.name:
            handlersRef.current.qr?.handleToolCall(toolCall, sendResponse);
            break;
          case upiPaymentDeclaration.name:
            handlersRef.current.upi?.handleToolCall(toolCall, sendResponse);
            break;
          case makePaymentDeclaration.name:
            handlersRef.current.payment?.handleToolCall(toolCall, sendResponse);
            break;
          // Other tools are handled by their own components (e.g., Altair)
        }
      }
    };

    client.on("toolcall", onToolCall);
    return () => {
      client.off("toolcall", onToolCall);
    };
  }, [client]);

  // This component doesn't render anything
  return null;
}

export const PaymentToolHandler = memo(PaymentToolHandlerComponent);
