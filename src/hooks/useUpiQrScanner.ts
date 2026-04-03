import { useEffect, useRef, useCallback } from 'react';
import QrScanner from 'qr-scanner';
import { parseUpiQr } from '../utils/parseUpiQr';
import type { UpiPayload } from '../types';

interface UseUpiQrScannerOptions {
  videoRef: React.RefObject<HTMLVideoElement>;  // pass the existing video element
  enabled: boolean;                             // only scan when UPI mode is active
  onDetected: (payload: UpiPayload) => void;
  onError?: (err: string) => void;
}

export function useUpiQrScanner({
  videoRef,
  enabled,
  onDetected,
  onError,
}: UseUpiQrScannerOptions) {
  const scannerRef = useRef<QrScanner | null>(null);
  // Track last scanned value to debounce repeat detections
  const lastScannedRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);

  const handleResult = useCallback(
    (result: QrScanner.ScanResult) => {
      const raw = result.data;
      console.log('QR raw data:', raw); // DEBUG: Log raw QR for testing
      const now = Date.now();
      // Debounce: ignore same QR within 4 seconds
      if (raw === lastScannedRef.current && now - lastScannedTimeRef.current < 4000) return;
      const payload = parseUpiQr(raw);
      console.log('Parsed UPI payload:', payload); // DEBUG: Log parsed result
      if (!payload) {
        console.log('Not UPI QR'); // DEBUG
        return; 
      }
      lastScannedRef.current = raw;
      lastScannedTimeRef.current = now;
      onDetected(payload);
    },
    [onDetected]
  );

  useEffect(() => {
    if (!enabled || !videoRef.current) return;

    const scanner = new QrScanner(
      videoRef.current,
      handleResult,
      {
        returnDetailedScanResult: true,
        highlightScanRegion: true,     // shows a visual scan box overlay
        highlightCodeOutline: true,    // outlines detected QR in green
        preferredCamera: 'environment',
        maxScansPerSecond: 5,          // conservative — glasses don't need 25fps scanning
      }
    );

    scannerRef.current = scanner;
    scanner.start().catch((err) => {
      onError?.(String(err));
    });

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop();
        scannerRef.current.destroy();
        scannerRef.current = null;
      }
    };
  }, [enabled, videoRef, handleResult, onError]);
}
