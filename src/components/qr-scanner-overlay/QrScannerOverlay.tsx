import { memo, useState, useEffect } from "react";
import { UpiQrData } from "../../lib/upi-qr-parser";
import "./qr-scanner-overlay.scss";

export type OverlayState =
  | { state: "idle" }
  | { state: "scanning" }
  | { state: "detected" }
  | { state: "success"; upiData: UpiQrData }
  | { state: "authenticating"; upiData: UpiQrData; onCancel: () => void }
  | { state: "auth_success"; upiData: UpiQrData }
  | { state: "auth_failed"; message: string }
  | { state: "error"; message: string };

function getMessage(props: OverlayState): string {
  if (props.state === "auth_failed") return (props as { state: "auth_failed"; message: string }).message;
  if (props.state === "error") return (props as { state: "error"; message: string }).message;
  return "";
}

function getUpiData(props: OverlayState): UpiQrData | null {
  if (props.state === "success") return (props as { state: "success"; upiData: UpiQrData }).upiData;
  if (props.state === "authenticating") return (props as { state: "authenticating"; upiData: UpiQrData }).upiData;
  if (props.state === "auth_success") return (props as { state: "auth_success"; upiData: UpiQrData }).upiData;
  return null;
}

function getOnCancel(props: OverlayState): (() => void) | null {
  if (props.state === "authenticating") return (props as { state: "authenticating"; onCancel: () => void }).onCancel;
  return null;
}

function QrScannerOverlayComponent(props: OverlayState) {
  const s = props.state;

  if (s === "idle") {
    return null;
  }

  const isSuccessState = s === "detected" || s === "success" || s === "auth_success";
  const isErrorState = s === "error" || s === "auth_failed";
  const upiData = getUpiData(props);
  const message = getMessage(props);
  const onCancel = getOnCancel(props);

  return (
    <div className={`qr-scanner-overlay state-${s}`}>
      <div className="overlay-backdrop" />

      <div className="scanner-container">
        <div className="scanner-frame">
          <div className="corner top-left" />
          <div className="corner top-right" />
          <div className="corner bottom-left" />
          <div className="corner bottom-right" />

          {s === "scanning" && <div className="scan-line" />}

          {isSuccessState && (
            <div className={`success-indicator ${s === "auth_success" ? "auth-success" : ""}`}>
              <span className="checkmark">{s === "auth_success" ? "🔐" : "✓"}</span>
            </div>
          )}

          {s === "authenticating" && upiData && onCancel && (
            <AuthCountdown upiData={upiData} onCancel={onCancel} />
          )}

          {isErrorState && (
            <div className="error-indicator">
              <span className="error-x">✕</span>
            </div>
          )}
        </div>

        <div className="status-text">
          {s === "scanning" && "Scanning for QR code..."}
          {s === "detected" && "QR Code Detected!"}
          {s === "success" && "Payment Ready"}
          {s === "authenticating" && "Verifying Authentication..."}
          {s === "auth_success" && "Authentication Confirmed"}
          {s === "auth_failed" && message}
          {s === "error" && message}
        </div>

        {upiData && (
          <UpiInfoCard upiData={upiData} />
        )}
      </div>
    </div>
  );
}

function AuthCountdown({ upiData, onCancel }: { upiData: UpiQrData; onCancel: () => void }) {
  const [remainingSecs, setRemainingSecs] = useState(30);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingSecs(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="auth-countdown">
      <div className="auth-timer">
        <span className="timer-icon">⏱️</span>
        <span className="timer-value">{remainingSecs}s</span>
      </div>
      <button className="auth-cancel-btn" onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

function UpiInfoCard({ upiData }: { upiData: UpiQrData }) {
  return (
    <div className="upi-info-card">
      <div className="upi-header">
        <span className="upi-icon">₹</span>
        <span className="upi-title">UPI Payment</span>
      </div>
      <div className="upi-details">
        {upiData.pn && (
          <div className="detail-row">
            <span className="label">To:</span>
            <span className="value">{upiData.pn}</span>
          </div>
        )}
        <div className="detail-row">
          <span className="label">UPI ID:</span>
          <span className="value upi-id">{upiData.pa}</span>
        </div>
        {upiData.am && (
          <div className="detail-row amount">
            <span className="label">Amount:</span>
            <span className="value">₹{upiData.am.toFixed(2)}</span>
          </div>
        )}
        {upiData.tn && (
          <div className="detail-row">
            <span className="label">Note:</span>
            <span className="value">{upiData.tn}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export const QrScannerOverlay = memo(QrScannerOverlayComponent);