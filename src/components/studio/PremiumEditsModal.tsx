import React from 'react';
import {
  CheckCircle2,
  CreditCard,
  Crown,
  FileText,
  Sparkles,
  X,
} from 'lucide-react';
import {
  PREMIUM_EDITS_BENEFITS,
  STUDIO_PREMIUM_MONTHLY_FEE_INR,
} from '../../lib/studioLogic';
import { formatINR } from '../../lib/domainLogic';
import type { Order } from '../../types';

interface PremiumEditsModalProps {
  isOpen: boolean;
  isUnlocked: boolean;
  requestedFeature?: string | null;
  expiresAt: string | null;
  latestOrder: Order | null;
  creatingOrder: boolean;
  onClose: () => void;
  onPayMonthly: () => void;
  onOpenPayment: (order: Order) => void;
  onOpenInvoice: (order: Order) => void;
}

export const PremiumEditsModal: React.FC<PremiumEditsModalProps> = ({
  isOpen,
  isUnlocked,
  requestedFeature,
  expiresAt,
  latestOrder,
  creatingOrder,
  onClose,
  onPayMonthly,
  onOpenPayment,
  onOpenInvoice,
}) => {
  if (!isOpen) return null;

  const isPendingReview =
    latestOrder &&
    latestOrder.status !== 'Verified' &&
    latestOrder.status !== 'Completed' &&
    latestOrder.status !== 'Rejected';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="premium-edits-modal-title"
      data-testid="premium-edits-dialog"
      className="fixed inset-0 z-50 bg-[#050F1E]/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="w-full max-w-lg rounded-2xl bg-[#091930] border border-[#D4AF37]/50 text-white shadow-2xl p-6 space-y-5 my-auto">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[#F5C542]">
              <Crown className="w-5 h-5" />
              <h3 id="premium-edits-modal-title" className="font-display text-lg font-bold">
                PRIME X Studio Premium Edits
              </h3>
            </div>
            <p className="text-xs text-slate-300">
              {requestedFeature
                ? `Unlock "${requestedFeature}" and every CapCut Pro tool in PrimeX Studio.`
                : 'Unlock all modern CapCut-grade video effects, transitions, chroma key, auto-captions, and 4K exports.'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close Premium Edits modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Plan Price Highlight */}
        <div className="rounded-xl bg-[#061121] border border-[#D4AF37]/35 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-slate-400">Monthly Creator Pass</div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="font-mono text-2xl font-bold text-[#F5C542] tabular-nums">
                {formatINR(STUDIO_PREMIUM_MONTHLY_FEE_INR)}
              </span>
              <span className="text-xs text-slate-300">/ month (30 days)</span>
            </div>
          </div>

          {isUnlocked ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>
                Active{expiresAt ? ` until ${new Date(expiresAt).toLocaleDateString('en-IN')}` : ''}
              </span>
            </div>
          ) : isPendingReview ? (
            <div className="text-xs font-mono text-[#F5C542]">
              Status: {latestOrder?.status}
            </div>
          ) : (
            <div className="text-xs font-semibold text-slate-300">
              UPI / GPay / PhonePe
            </div>
          )}
        </div>

        {/* Included Features List */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#F5C542]" />
            <span>Everything Included in Premium Edits:</span>
          </div>
          <ul className="space-y-2 text-xs text-slate-200">
            {PREMIUM_EDITS_BENEFITS.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#F5C542] shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
          <div className="flex items-center gap-2">
            {latestOrder && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenInvoice(latestOrder);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/20 text-white hover:bg-white/10 text-xs font-semibold"
              >
                <FileText className="w-3.5 h-3.5 text-[#F5C542]" />
                <span>View ₹{STUDIO_PREMIUM_MONTHLY_FEE_INR} Bill</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/10"
            >
              Close
            </button>

            {!isUnlocked && (
              isPendingReview && latestOrder ? (
                <button
                  type="button"
                  data-testid="premium-upload-payment-btn"
                  onClick={() => {
                    onClose();
                    onOpenPayment(latestOrder);
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold shadow hover:brightness-105"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Complete ₹{STUDIO_PREMIUM_MONTHLY_FEE_INR} Payment</span>
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="confirm-premium-pay-btn"
                  disabled={creatingOrder}
                  onClick={onPayMonthly}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold shadow hover:brightness-105 disabled:opacity-60"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>
                    {creatingOrder
                      ? 'Creating Order...'
                      : `Pay ₹${STUDIO_PREMIUM_MONTHLY_FEE_INR} / Month`}
                  </span>
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
