import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Globe,
  Lightbulb,
  Loader2,
  Phone,
  Send,
  X,
} from 'lucide-react';
import { apiRequest, ApiError } from '../../utils/api';
import type { CustomProjectRequest, CustomRequestType, Product } from '../../types';

interface CustomProjectRequestModalProps {
  product: Product;
  requestType: CustomRequestType;
  onClose: () => void;
  onSubmitted: (request: CustomProjectRequest, message: string) => void;
}

const THEME_SUGGESTIONS = [
  'Midnight Navy & Gold',
  'Minimalist White & Charcoal',
  'Dark Slate Tech',
  'Warm Editorial Ivory',
];

export const CustomProjectRequestModal: React.FC<CustomProjectRequestModalProps> = ({
  product,
  requestType,
  onClose,
  onSubmitted,
}) => {
  const isWebpage = requestType === 'webpage';

  const [contactNumber, setContactNumber] = useState('');
  const [description, setDescription] = useState('');
  const [backgroundTheme, setBackgroundTheme] = useState('');
  const [sampleWebpageUrl, setSampleWebpageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedRecord, setSubmittedRecord] = useState<{
    request: CustomProjectRequest;
    message: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{ request: CustomProjectRequest; message: string }>(
        '/api/custom-requests',
        {
          method: 'POST',
          body: JSON.stringify({
            productId: product.id,
            productName: product.name,
            requestType,
            contactNumber,
            description,
            backgroundTheme: isWebpage ? backgroundTheme : '',
            sampleWebpageUrl: isWebpage ? sampleWebpageUrl : '',
          }),
        },
      );
      setSubmittedRecord(res);
      onSubmitted(res.request, res.message);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not submit your details right now. Please check compulsory fields.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="custom-req-modal-title"
      data-testid="custom-request-modal"
      className="fixed inset-0 z-50 bg-[#050F1E]/85 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div className="w-full max-w-lg bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-[#0B1F3A] text-white px-6 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {isWebpage ? (
              <Globe className="w-5 h-5 text-[#F5C542]" />
            ) : (
              <Lightbulb className="w-5 h-5 text-[#F5C542]" />
            )}
            <div>
              <h2 id="custom-req-modal-title" className="font-display font-bold text-[#F5C542] text-base">
                {product.name}
              </h2>
              <p className="text-[11px] text-slate-300">
                {isWebpage
                  ? '₹3,999 per page · Submit specs before billing'
                  : 'Custom Project Idea · Admin will quote your exact amount'}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close details form"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submittedRecord ? (
          <div className="p-6 space-y-5 text-center" data-testid="custom-request-success">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h3 className="font-display text-lg font-bold text-[#0B1F3A]">
                Details Delivered to Admin Portal
              </h3>
              <p className="text-sm text-slate-700 leading-relaxed">
                Please wait for <strong className="text-[#0B1F3A]">1 day (24 hours)</strong> to
                receive your exact confirmed amount. Once our admin enters your quote, it will
                appear exclusively under <strong className="text-[#0B1F3A]">My Custom Quotes</strong> for you to complete billing.
              </p>
            </div>

            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-900 flex items-center justify-center gap-2 font-medium">
              <Clock className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Wait for 1 day · Request #{submittedRecord.request.id}</span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-[#0B1F3A] text-[#F5C542] text-sm font-bold hover:bg-[#16325C]"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
            {error && (
              <div
                role="alert"
                className="rounded-xl bg-red-50 border border-red-200 px-3.5 py-2.5 text-xs text-red-700 font-medium"
              >
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="req-contact-number"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>
                    User Contact Number {isWebpage ? '(Compulsory *)' : '(Optional)'}
                  </span>
                </span>
              </label>
              <input
                id="req-contact-number"
                type="tel"
                required={isWebpage}
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                placeholder="e.g., 9876543210"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
              />
            </div>

            <div>
              <label
                htmlFor="req-description"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                {isWebpage
                  ? 'Description of the Webpage (Compulsory *)'
                  : 'Details of the Project Idea (Compulsory *)'}
              </label>
              <textarea
                id="req-description"
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  isWebpage
                    ? 'Describe number of pages, business sections, features, and brand goals...'
                    : 'Explain your hardware, robotics, IoT, or software project idea and goals...'
                }
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
              />
            </div>

            {isWebpage && (
              <>
                <div>
                  <label
                    htmlFor="req-bg-theme"
                    className="block text-xs font-semibold text-slate-800 mb-1"
                  >
                    Background Theme (Compulsory *)
                  </label>
                  <input
                    id="req-bg-theme"
                    type="text"
                    required
                    value={backgroundTheme}
                    onChange={(e) => setBackgroundTheme(e.target.value)}
                    placeholder="e.g., Midnight Navy & Gold"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {THEME_SUGGESTIONS.map((theme) => (
                      <button
                        key={theme}
                        type="button"
                        onClick={() => setBackgroundTheme(theme)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-[#D4AF37]/20 text-[11px] font-medium text-slate-700"
                      >
                        {theme}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="req-sample-url"
                    className="block text-xs font-semibold text-slate-800 mb-1"
                  >
                    Sample Web Page Reference <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="req-sample-url"
                    type="text"
                    value={sampleWebpageUrl}
                    onChange={(e) => setSampleWebpageUrl(e.target.value)}
                    placeholder="Optional URL or layout reference (leave blank if none)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#D4AF37]"
                  />
                </div>
              </>
            )}

            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-xs text-slate-600 flex items-start gap-2">
              <Clock className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
              <span>
                Your details will be delivered straight to the Admin Portal before billing. You
                will be asked to wait for 1 day while our admin confirms your exact amount.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-xs font-bold shadow hover:brightness-105 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending to Admin...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Submit Details &amp; Request Exact Amount</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
