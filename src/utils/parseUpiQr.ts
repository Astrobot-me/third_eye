export interface UpiPayload {
  upiId: string;        // `pa` param — the UPI VPA e.g. merchant@upi
  payeeName: string;    // `pn` param — human readable name
  amount?: string;      // `am` param — optional pre-set amount
  note?: string;        // `tn` param — transaction note
  raw: string;          // full raw QR string
}

/**
 * UPI QR codes follow the format:
 * upi://pay?pa=<UPI_ID>&pn=<NAME>&am=<AMOUNT>&cu=INR&tn=<NOTE>
 */
export function parseUpiQr(raw: string): UpiPayload | null {
  try {
    if (!raw.startsWith('upi://pay')) return null;
    // upi:// is not a valid URL protocol for the URL API, so replace it
    const url = new URL(raw.replace('upi://', 'https://'));
    const pa = url.searchParams.get('pa');
    const pn = url.searchParams.get('pn');
    if (!pa) return null;
    return {
      upiId: pa,
      payeeName: pn ? decodeURIComponent(pn) : 'Unknown',
      amount: url.searchParams.get('am') ?? undefined,
      note: url.searchParams.get('tn') ?? undefined,
      raw,
    };
  } catch {
    return null;
  }
}
