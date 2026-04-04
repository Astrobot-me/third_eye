/**
 * PaymentHistoryDrawer - Side drawer showing payment and QR scan history.
 */
import { memo } from "react";
import cn from "classnames";
import { usePaymentHistoryStore, HistoryEntry } from "../../lib/payment-history-store";
import "./payment-history-drawer.scss";

interface PaymentHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDate(date: Date): string {
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  
  if (isToday) {
    return "Today";
  }
  
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function getEntryIcon(entry: HistoryEntry): string {
  switch (entry.type) {
    case "QR_SCAN":
      return entry.success ? "qr_code_scanner" : "qr_code_2";
    case "PAYMENT":
      return "payments";
    case "ERROR":
      return "error";
    default:
      return "receipt";
  }
}

function getStatusBadge(entry: HistoryEntry): { text: string; className: string } | null {
  if (entry.type === "PAYMENT") {
    switch (entry.status) {
      case "initiated":
        return { text: "INITIATED", className: "status--initiated" };
      case "success":
        return { text: "SUCCESS", className: "status--success" };
      case "failed":
        return { text: "FAILED", className: "status--failed" };
      case "pending":
        return { text: "PENDING", className: "status--pending" };
    }
  }
  if (entry.type === "QR_SCAN") {
    return entry.success 
      ? { text: "SCANNED", className: "status--success" }
      : { text: "FAILED", className: "status--failed" };
  }
  return null;
}

function EntryCard({ entry }: { entry: HistoryEntry }) {
  const icon = getEntryIcon(entry);
  const status = getStatusBadge(entry);
  
  let title = "";
  let subtitle = "";
  let amount: number | undefined;
  
  switch (entry.type) {
    case "QR_SCAN":
      title = entry.merchantName || entry.upiId || "QR Code";
      subtitle = entry.upiId && entry.merchantName ? entry.upiId : (entry.rawData ? "Non-UPI QR" : "Scan attempt");
      amount = entry.amount;
      break;
    case "PAYMENT":
      title = entry.merchantName || entry.upiId;
      subtitle = entry.note || entry.upiId;
      amount = entry.amount;
      break;
    case "ERROR":
      title = "Error";
      subtitle = entry.message;
      break;
  }

  return (
    <div className={cn("history-entry", `history-entry--${entry.type.toLowerCase()}`)}>
      <div className="history-entry__icon">
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      
      <div className="history-entry__content">
        <div className="history-entry__header">
          <span className="history-entry__title">{title}</span>
          {status && (
            <span className={cn("history-entry__status", status.className)}>
              {status.text}
            </span>
          )}
        </div>
        <span className="history-entry__subtitle">{subtitle}</span>
        <span className="history-entry__time">
          {formatDate(entry.timestamp)} • {formatTime(entry.timestamp)}
        </span>
      </div>
      
      {amount !== undefined && amount > 0 && (
        <div className="history-entry__amount">
          ₹{amount.toLocaleString("en-IN")}
        </div>
      )}
    </div>
  );
}

function PaymentHistoryDrawerComponent({ isOpen, onClose }: PaymentHistoryDrawerProps) {
  const entries = usePaymentHistoryStore((state) => state.entries);
  const clearHistory = usePaymentHistoryStore((state) => state.clearHistory);
  
  // Sort by timestamp descending (newest first)
  const sortedEntries = [...entries].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
  
  // Count stats
  const qrScans = entries.filter((e) => e.type === "QR_SCAN").length;
  const payments = entries.filter((e) => e.type === "PAYMENT").length;

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn("drawer-backdrop", { "drawer-backdrop--visible": isOpen })}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className={cn("payment-history-drawer", { "payment-history-drawer--open": isOpen })}>
        <header className="drawer-header">
          <div className="drawer-header__title-group">
            <span className="material-symbols-outlined">receipt_long</span>
            <h2>Payment History</h2>
          </div>
          <button className="drawer-header__close" onClick={onClose} aria-label="Close drawer">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>
        
        {/* Stats Bar */}
        <div className="drawer-stats">
          <div className="drawer-stats__item">
            <span className="material-symbols-outlined">qr_code_scanner</span>
            <span>{qrScans} Scans</span>
          </div>
          <div className="drawer-stats__item">
            <span className="material-symbols-outlined">payments</span>
            <span>{payments} Payments</span>
          </div>
          {entries.length > 0 && (
            <button className="drawer-stats__clear" onClick={clearHistory}>
              Clear All
            </button>
          )}
        </div>
        
        {/* Entry List */}
        <div className="drawer-content">
          {sortedEntries.length === 0 ? (
            <div className="drawer-empty">
              <span className="material-symbols-outlined">receipt</span>
              <p>No payment history yet</p>
              <span className="drawer-empty__hint">
                QR scans and payments will appear here
              </span>
            </div>
          ) : (
            <div className="history-list">
              {sortedEntries.map((entry) => (
                <EntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const PaymentHistoryDrawer = memo(PaymentHistoryDrawerComponent);
