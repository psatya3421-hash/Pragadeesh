import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileText,
  Upload,
  X,
  ShieldAlert,
} from 'lucide-react';
import {
  ADMIN_PAYMENT_UPI_NUMBER,
  DELIVERY_SERVICE_AREA_NOTE,
  MANUFACTURING_ORIGIN,
  WRONG_PAYMENT_NOTICE,
  formatINR,
  validatePaymentFile,
} from '../lib/domainLogic';
import { apiRequest, ApiError, fileToBase64 } from '../utils/api';
import type { Order } from '../types';

interface PaymentModalProps {
  order: Order;
  onClose: () => void;
  onOrderUpdated: (updated: Order) => void;
  onOpenInvoice: (order: Order) => void;
  onAiWarning: (warningText: string) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  order,
  onClose,
  onOrderUpdated,
  onOpenInvoice,
  onAiWarning,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    order.screenshotUrl || null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyUpi = () => {
    navigator.clipboard?.writeText(ADMIN_PAYMENT_UPI_NUMBER);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const check = validatePaymentFile({ type: file.type, size: file.size });
    if (!check.valid) {
      const msg = check.error || 'Invalid screenshot file.';
      setError(msg);
      onAiWarning(msg);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const handleSubmitScreenshot = async () => {
    if (!selectedFile) {
      const msg =
        'Please upload your payment screenshot before submitting for verification.';
      setError(msg);
      onAiWarning(msg);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const base64Image = await fileToBase64(selectedFile);
      const res = await apiRequest<{ order: Order }>(
        `/api/orders/${order.id}/payment`,
        {
          method: 'POST',
          body: JSON.stringify({
            base64Image,
            mimeType: selectedFile.type,
            fileSize: selectedFile.size,
          }),
        },
      );
      onOrderUpdated(res.order);

      const v = res.order.aiVerification;
      const detectedWrongPayment = Boolean(
        v &&
          (v.isWrongPayment ||
            v.verdict === 'Amount mismatch' ||
            v.verdict === 'Unclear screenshot' ||
            !v.receiverMatches ||
            v.status === 'failed' ||
            v.suspiciousDuplicate),
      );

      if (v?.suspiciousDuplicate) {
        onAiWarning(
          `Wrong payment is not responsible on PRIME X INNOVATION. ${v.duplicateReason || 'Duplicate payment screenshot or UTR detected.'}`,
        );
      } else if (v?.verdict === 'Amount mismatch') {
        onAiWarning(
          `Wrong payment is not responsible on PRIME X INNOVATION. Payment amount mismatch on Order ${res.order.id}: expected ${formatINR(order.totalAmount)}, screenshot showed ${v.extractedAmount ?? 'unclear'}.`,
        );
      } else if (detectedWrongPayment && v) {
        onAiWarning(
          `Wrong payment is not responsible on PRIME X INNOVATION. ${v.summary}`,
        );
      }
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Screenshot upload failed.';
      setError(msg);
      onAiWarning(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const ai = order.aiVerification;
  const hasWrongPaymentIssue = Boolean(
    ai &&
      (ai.isWrongPayment ||
        ai.verdict === 'Amount mismatch' ||
        ai.verdict === 'Unclear screenshot' ||
        !ai.receiverMatches ||
        ai.status === 'failed' ||
        ai.suspiciousDuplicate),
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upi-payment-title"
      className="fixed inset-0 z-50 bg-[#050F1E]/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="w-full max-w-xl bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto">
        <div className="bg-[#0B1F3A] text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h3
              id="upi-payment-title"
              className="font-display text-lg font-bold text-[#F5C542]"
            >
              UPI Payment & AI Verification
            </h3>
            <p className="text-xs text-slate-300 font-mono">
              Order #{order.id} · Status: {order.status}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close payment modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Amount & UPI Number Box */}
          <div className="rounded-xl bg-[#0B1F3A]/5 border border-[#D4AF37]/40 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Exact Amount to Pay
                </div>
                <div className="font-mono text-2xl font-bold text-[#0B1F3A]">
                  {formatINR(order.totalAmount)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  UPI / GPay / PhonePe Number
                </div>
                <div className="flex items-center justify-end gap-2 mt-0.5">
                  <span className="font-mono text-lg font-bold text-[#0B1F3A]">
                    {ADMIN_PAYMENT_UPI_NUMBER}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyUpi}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0B1F3A] text-[#F5C542] text-xs font-semibold hover:bg-[#16325C]"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              Pay the exact amount to this number using GPay, PhonePe, or any bank UPI app, then upload the payment screenshot below.
            </p>
          </div>

          {/* Mandatory Wrong Payment Liability Notice */}
          <div
            data-testid="wrong-payment-disclaimer"
            className="rounded-xl bg-amber-50 border border-amber-300 p-3.5 text-xs text-amber-950 flex items-start gap-2.5"
          >
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-bold text-amber-900">
                Payment Responsibility Policy
              </div>
              <p className="leading-relaxed">{WRONG_PAYMENT_NOTICE}</p>
            </div>
          </div>

          {order.deliveryAddress && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs space-y-1">
              <div className="font-bold text-[#0B1F3A]">
                Delivery Address ({order.deliveryAddress.label}) · {order.deliveryAddress.recipientName}
              </div>
              <div className="text-slate-700">{order.deliveryAddress.formattedAddress}</div>
              <div className="font-mono text-slate-500">
                Tel: {order.deliveryAddress.contactPhone}
                {order.deliveryAddress.landmark ? ` · Near ${order.deliveryAddress.landmark}` : ''}
              </div>
              {typeof order.deliveryAddress.lat === 'number' &&
                typeof order.deliveryAddress.lng === 'number' && (
                  <div className="font-mono text-[11px] text-emerald-700">
                    Pinned Map Coordinates: {order.deliveryAddress.lat.toFixed(5)}, {order.deliveryAddress.lng.toFixed(5)}
                  </div>
                )}
              <div className="text-[11px] font-semibold text-slate-600 pt-0.5">
                Manufactured at {MANUFACTURING_ORIGIN} · {DELIVERY_SERVICE_AREA_NOTE}
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2.5"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Wrong Payment Alert Banner when AI flags mismatch / wrong receiver / failed / unclear */}
          {hasWrongPaymentIssue && (
            <div
              role="alert"
              data-testid="wrong-payment-alert"
              className="p-4 rounded-xl bg-red-50 border-2 border-red-400 text-red-900 text-xs space-y-1.5"
            >
              <div className="font-display font-bold text-sm text-red-800 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-700 shrink-0" />
                <span>Wrong Payment Detected — Wrong payment is not responsible on PRIME X INNOVATION</span>
              </div>
              <p className="leading-relaxed text-red-800">
                Your uploaded payment screenshot did not cleanly match the exact order amount ({formatINR(order.totalAmount)}), official UPI receiver ({ADMIN_PAYMENT_UPI_NUMBER}), or unique transaction status. Wrong payment is not responsible on PRIME X INNOVATION.
              </p>
            </div>
          )}

          {/* AI Verification Result Panel */}
          {ai && (
            <div
              className={`p-4 rounded-xl border space-y-2 ${
                order.status === 'Verified' || order.status === 'Completed'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : ai.suspiciousDuplicate || hasWrongPaymentIssue
                    ? 'bg-red-50 border-red-200 text-red-950'
                    : 'bg-amber-50 border-amber-200 text-amber-950'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-display font-bold text-sm">
                  {order.status === 'Verified' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-amber-600" />
                  )}
                  <span>AI Verification: {ai.verdict}</span>
                </div>
                <span className="font-mono text-xs font-semibold">
                  {order.status}
                </span>
              </div>
              <p className="text-xs leading-relaxed">{ai.summary}</p>
              {ai.suspiciousDuplicate && ai.duplicateReason && (
                <p className="text-xs font-semibold text-red-700">
                  Flagged: {ai.duplicateReason}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs font-mono">
                <div>
                  Detected Amount:{' '}
                  {ai.extractedAmount !== null ? formatINR(ai.extractedAmount) : 'N/A'}
                </div>
                <div>UTR ID: {ai.utrId || 'Not detected'}</div>
                <div>
                  Receiver Match: {ai.receiverMatches ? 'Yes (9080397469)' : 'Unconfirmed'}
                </div>
                <div>Payment Status: {ai.status}</div>
              </div>
            </div>
          )}

          {/* Upload Input */}
          {order.status !== 'Verified' && order.status !== 'Completed' && (
            <div className="space-y-3">
              <label
                htmlFor="payment-screenshot-input"
                className="block text-xs font-semibold text-slate-700"
              >
                Upload Payment Screenshot (PNG, JPG, WEBP · Max 5 MB)
              </label>
              <label
                htmlFor="payment-screenshot-input"
                className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 hover:border-[#D4AF37] rounded-xl p-5 cursor-pointer bg-slate-50 transition-colors"
              >
                <Upload className="w-6 h-6 text-[#D4AF37]" />
                <span className="text-sm font-medium text-slate-700">
                  {selectedFile
                    ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(0)} KB)`
                    : 'Click to select payment screenshot'}
                </span>
                <input
                  id="payment-screenshot-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>

              {previewUrl && (
                <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 max-h-52 flex justify-center">
                  <img
                    src={previewUrl}
                    alt="Uploaded payment screenshot preview"
                    referrerPolicy="no-referrer"
                    className="max-h-52 object-contain"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => onOpenInvoice(order)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold"
            >
              <FileText className="w-4 h-4" />
              <span>View & Download Bill</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Done
              </button>
              {order.status !== 'Verified' && order.status !== 'Completed' && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmitScreenshot}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-sm font-bold shadow hover:brightness-105 disabled:opacity-60"
                >
                  {submitting ? 'Verifying with AI...' : 'Submit & Verify Payment'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
