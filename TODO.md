# UPI Payment Mode Integration - TODO

## [x] 1. Install dependencies
- Run `cd third_eye && npm install qr-scanner`
- Note: qr-scanner ships own types, no @types needed.

## [x] 2. Create new utility files
- `src/utils/parseUpiQr.ts`
- `src/lib/speakText.ts` (SpeechSynthesis wrapper)

## [x] 3. Create new hook
- `src/hooks/useUpiQrScanner.ts`

## [x] 4. Create Zustand store
- `src/store/paymentStore.ts`

## [x] 5. Create UI components
- `src/components/PaymentConfirmOverlay.tsx`
- `src/components/PaymentConfirmOverlay.scss`

## [x] 6. Update types
- Edit `src/types.ts` - add UpiPayload interface

## [x] 7. Wire into App.tsx
- Add imports, hook usage, overlay render

## [x] 8. Add toggle to ControlTray
- Edit `src/components/control-tray/ControlTray.tsx`
- Edit `src/components/control-tray/control-tray.scss`

## [x] 9. Test
- `cd third_eye && npm start`
- Toggle UPI mode with QR scanner button (after webcam), point camera at UPI QR code, hear announcement, see overlay, tap Pay Now for upi:// link.

**All steps complete!** 🎉
