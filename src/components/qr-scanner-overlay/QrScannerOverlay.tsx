import { memo } from "react";
import { UpiQrData } from "../../lib/upi-qr-parser";
import "./qr-scanner-overlay.scss";

export type OverlayState =
  | { state: "idle" }
  | { state: "scanning" }
  | { state: "detected" }
  | { state: "success"; upiData: UpiQrData }
  | { state: "error"; message: string };

function QrScannerOverlayComponent(props: OverlayState) {
  const { state } = props;

  if (state === "idle") {
    return null;
  }

  return (
    <div className={`qr-scanner-overlay state-${state}`}>
      <div className="overlay-backdrop" />

      <div className="scanner-container">
        {/* Scanner Frame with animated corners */}
        <div className="scanner-frame">
          <div className="corner top-left" />
          <div className="corner top-right" />
          <div className="corner bottom-left" />
          <div className="corner bottom-right" />

          {/* Scanning line animation */}
          {state === "scanning" && <div className="scan-line" />}

          {/* Success checkmark */}
          {(state === "detected" || state === "success") && (
            <div className="success-indicator">
              <span className="checkmark">✓</span>
            </div>
          )}

          {/* Error indicator */}
          {state === "error" && (
            <div className="error-indicator">
              <span className="error-x">✕</span>
            </div>
          )}
        </div>

        {/* Status text */}
        <div className="status-text">
          {state === "scanning" && "Scanning for QR code..."}
          {state === "detected" && "QR Code Detected!"}
          {state === "success" && "Payment Ready"}
          {state === "error" && (props as { state: "error"; message: string }).message}
        </div>

        {/* UPI Info Card */}
        {state === "success" && (
          <UpiInfoCard upiData={(props as { state: "success"; upiData: UpiQrData }).upiData} />
        )}
      </div>
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
