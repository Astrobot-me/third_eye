import React from 'react';
import { UpiPayload } from '../types';
import './PaymentConfirmOverlay.scss';
import { usePaymentStore } from '../store/paymentStore';
import { speakText } from '../utils/speakText';

interface Props {
  payload: UpiPayload;
}

export const PaymentConfirmOverlay: React.FC<Props> = ({ payload }) => {
  const { reset, setPaymentStatus } = usePaymentStore();

  const handleConfirm = async () => {
    console.log('UPI payload:', payload);
    
    // Validate UPI ID
    if (!payload.upiId || !payload.upiId.includes('@')) {
      alert('Invalid UPI ID. Must contain @ symbol.');
      return;
    }
    
    // Build UPI deep link - URLSearchParams handles encoding
    const params = new URLSearchParams({
      pa: payload.upiId,
      pn: payload.payeeName || '',
      ...(payload.amount && { am: payload.amount }),
      ...(payload.note && { tn: payload.note }),
      cu: 'INR'
    });
    const upiLink = `upi://pay?${params.toString()}`;
    console.log('Generated UPI link:', upiLink);
    
    // Mobile check fallback
    if (!/Android|iPhone|iPad|iPod/.test(navigator.userAgent)) {
      alert('UPI links work best on mobile devices with UPI apps installed.');
    }
    
    window.location.href = upiLink;
    setPaymentStatus('processing');
    reset();
  };

  const handleCancel = () => {
    reset();
  };

  return (
    <div className="payment-overlay" data-testid="upi-overlay">
      <div className="payment-overlay__card">
        <p className="payment-overlay__label">Pay To</p>
        <h1 className="payment-overlay__name">{payload.payeeName}</h1>
        <p className="payment-overlay__upi">{payload.upiId}</p>
        {payload.amount && (
          <p className="payment-overlay__amount">₹ {payload.amount}</p>
        )}
        {payload.note && (
          <p className="payment-overlay__note">{payload.note}</p>
        )}
        <div className="payment-overlay__actions">
          <button className="payment-overlay__btn payment-overlay__btn--confirm" onClick={handleConfirm}>
            Pay Now
          </button>
          <button className="payment-overlay__btn payment-overlay__btn--cancel" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
