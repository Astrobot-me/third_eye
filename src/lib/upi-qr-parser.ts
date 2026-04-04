/**
 * Parsed UPI QR code data
 */
export interface UpiQrData {
  /** Payee VPA (e.g., merchant@paytm) - required */
  pa: string;
  /** Amount in INR */
  am?: number;
  /** Payee Name */
  pn?: string;
  /** Transaction Note */
  tn?: string;
  /** Currency (default: INR) */
  cu?: string;
  /** Merchant Category Code */
  mc?: string;
  /** Transaction Reference ID */
  tr?: string;
  /** Original QR string */
  raw: string;
}

/**
 * Parse a UPI QR code string into structured data.
 *
 * Handles multiple formats:
 * - upi://pay?pa=xxx&am=50&pn=StoreName
 * - Plain VPA: merchant@upi
 *
 * @param qrData - Raw QR code content
 * @returns Parsed UPI data or null if invalid
 */
export function parseUpiQr(qrData: string): UpiQrData | null {
  if (!qrData || typeof qrData !== "string") {
    return null;
  }

  const trimmed = qrData.trim();

  // Handle UPI deep link format: upi://pay?pa=xxx&am=50
  if (trimmed.toLowerCase().startsWith("upi://pay")) {
    return parseUpiDeepLink(trimmed);
  }

  // Handle plain VPA format: merchant@upi
  if (isValidVpa(trimmed)) {
    return {
      pa: trimmed,
      raw: qrData,
    };
  }

  return null;
}

/**
 * Parse UPI deep link format
 */
function parseUpiDeepLink(url: string): UpiQrData | null {
  try {
    // Extract query string after upi://pay?
    const queryStart = url.indexOf("?");
    if (queryStart === -1) {
      return null;
    }

    const queryString = url.substring(queryStart + 1);
    const params = new URLSearchParams(queryString);

    const pa = params.get("pa");
    if (!pa || !isValidVpa(pa)) {
      return null;
    }

    const amStr = params.get("am");
    const am = amStr ? parseFloat(amStr) : undefined;

    return {
      pa,
      am: am && !isNaN(am) && am > 0 ? am : undefined,
      pn: params.get("pn") || undefined,
      tn: params.get("tn") || undefined,
      cu: params.get("cu") || "INR",
      mc: params.get("mc") || undefined,
      tr: params.get("tr") || undefined,
      raw: url,
    };
  } catch {
    return null;
  }
}

/**
 * Validate VPA format (must contain @)
 */
function isValidVpa(vpa: string): boolean {
  return vpa.includes("@") && vpa.length >= 3;
}

/**
 * Generate UPI deep link from parsed data
 */
export function generateUpiDeepLink(
  data: UpiQrData,
  overrideAmount?: number
): string {
  const params = new URLSearchParams({
    pa: data.pa,
    cu: data.cu || "INR",
  });

  const amount = overrideAmount ?? data.am;
  if (amount && amount > 0) {
    params.append("am", amount.toString());
  }

  if (data.pn) {
    params.append("pn", data.pn);
  }

  if (data.tn) {
    params.append("tn", data.tn);
  }

  return `upi://pay?${params.toString()}`;
}

/**
 * Check if a string looks like a UPI QR code
 */
export function isUpiQrCode(data: string): boolean {
  if (!data) return false;
  const trimmed = data.trim().toLowerCase();
  return trimmed.startsWith("upi://pay") || isValidVpa(data.trim());
}
