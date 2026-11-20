import React from 'react';
import { Download, Printer, X } from 'lucide-react';
import {
  ADMIN_PAYMENT_UPI_NUMBER,
  DELIVERY_SERVICE_AREA_NOTE,
  MANUFACTURING_ORIGIN,
  formatINR,
} from '../lib/domainLogic';
import { downloadOrderInvoicePdf } from '../utils/pdfGenerator';
import type { Order } from '../types';

interface InvoiceModalProps {
  order: Order;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ order, onClose }) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invoice-modal-title"
      className="fixed inset-0 z-50 bg-[#050F1E]/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
    >
      <div className="w-full max-w-2xl bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto">
        <div className="bg-[#0B1F3A] text-white px-6 py-5 flex items-center justify-between">
          <div>
            <div className="font-display text-lg font-bold text-[#F5C542]">
              PRIME X INNOVATION
            </div>
            <h3 id="invoice-modal-title" className="text-xs text-slate-300 mt-0.5">
              Official Order Bill & Receipt · #{order.id}
            </h3>
          </div>
          <button
            type="button"
            aria-label="Close invoice modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-5 border-b border-slate-200">
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Billed To
              </div>
              <div className="font-semibold text-slate-900">{order.customerName}</div>
              <div className="text-sm text-slate-600">{order.customerEmail}</div>
              {order.deliveryAddress && (
                <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-700 space-y-0.5">
                  <div className="font-semibold text-[#0B1F3A]">
                    Deliver To ({order.deliveryAddress.label}): {order.deliveryAddress.recipientName}
                  </div>
                  <div>{order.deliveryAddress.formattedAddress}</div>
                  {order.deliveryAddress.landmark && (
                    <div className="text-slate-500">Landmark: {order.deliveryAddress.landmark}</div>
                  )}
                  <div className="font-mono text-slate-500">
                    Contact: {order.deliveryAddress.contactPhone}
                  </div>
                  {typeof order.deliveryAddress.lat === 'number' &&
                    typeof order.deliveryAddress.lng === 'number' && (
                      <div className="font-mono text-[11px] text-emerald-700">
                        Pinned Map GPS: {order.deliveryAddress.lat.toFixed(5)}, {order.deliveryAddress.lng.toFixed(5)}
                      </div>
                    )}
                  <div className="text-[11px] font-semibold text-slate-600 pt-0.5">
                    Dispatched From: {MANUFACTURING_ORIGIN} · {DELIVERY_SERVICE_AREA_NOTE}
                  </div>
                </div>
              )}
            </div>
            <div className="sm:text-right space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Order Details
              </div>
              <div className="text-sm font-mono text-slate-800">
                Date: {new Date(order.createdAt).toLocaleString('en-IN')}
              </div>
              <div className="text-sm font-semibold text-[#0B1F3A]">
                Status: {order.status}
              </div>
              {order.utrId && (
                <div className="text-xs font-mono text-slate-500">
                  UTR: {order.utrId}
                </div>
              )}
              <div className="text-[11px] text-slate-500 pt-1">
                Manufactured at {MANUFACTURING_ORIGIN}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2.5 pr-4">Item</th>
                  <th className="py-2.5 px-3 text-right">Qty</th>
                  <th className="py-2.5 px-3 text-right">Price</th>
                  <th className="py-2.5 pl-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.items.map((item, idx) => (
                  <tr key={`${item.productId}-${idx}`}>
                    <td className="py-3 pr-4 font-medium text-slate-900">{item.name}</td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      {item.quantity}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                      {formatINR(item.price)}
                    </td>
                    <td className="py-3 pl-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {formatINR(item.price * item.quantity)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-200">
            <div className="text-xs text-slate-500 space-y-0.5">
              <div>
                Merchant UPI: <span className="font-mono">{ADMIN_PAYMENT_UPI_NUMBER}</span>
              </div>
              <div className="text-[11px] text-amber-700 font-medium">
                Wrong payment is not responsible on PRIME X INNOVATION.
              </div>
            </div>
            <div className="flex items-baseline gap-4">
              <span className="text-sm font-semibold text-slate-600">Grand Total</span>
              <span className="font-mono text-2xl font-bold text-[#0B1F3A] tabular-nums">
                {formatINR(order.totalAmount)}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>
            <button
              type="button"
              onClick={() => downloadOrderInvoicePdf(order)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5C542] text-[#0B1F3A] text-sm font-bold shadow hover:brightness-105"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF Bill</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
