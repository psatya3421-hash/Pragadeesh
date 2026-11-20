import { jsPDF } from 'jspdf';
import type { Order } from '../types';
import { filterOrdersByDateRange } from '../lib/domainLogic';

function formatInrPlain(amount: number): string {
  return `INR ${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function downloadOrderInvoicePdf(order: Order): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header Banner
  doc.setFillColor(11, 31, 58);
  doc.rect(0, 0, pageWidth, 105, 'F');

  doc.setTextColor(245, 197, 66);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('PRIME X INNOVATION', 44, 48);

  doc.setTextColor(226, 232, 240);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('OFFICIAL TAX INVOICE & PAYMENT RECEIPT', 44, 68);

  doc.setTextColor(245, 197, 66);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`#${order.id}`, pageWidth - 44, 48, { align: 'right' });

  doc.setTextColor(226, 232, 240);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `Date: ${new Date(order.createdAt).toLocaleString('en-IN')}`,
    pageWidth - 44,
    68,
    { align: 'right' },
  );

  // Customer Details
  let y = 140;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('BILLED TO', 44, y);
  doc.text('PAYMENT STATUS', pageWidth - 44, y, { align: 'right' });

  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(order.customerName, 44, y);
  doc.setFont('helvetica', 'bold');
  doc.text(order.status.toUpperCase(), pageWidth - 44, y, { align: 'right' });

  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(order.customerEmail, 44, y);
  if (order.utrId) {
    doc.text(`UTR / Ref: ${order.utrId}`, pageWidth - 44, y, { align: 'right' });
  }

  if (order.deliveryAddress) {
    y += 18;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `Deliver To (${order.deliveryAddress.label}): ${order.deliveryAddress.recipientName} (${order.deliveryAddress.contactPhone})`,
      44,
      y,
    );
    y += 13;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(order.deliveryAddress.formattedAddress.slice(0, 88), 44, y);
    if (
      typeof order.deliveryAddress.lat === 'number' &&
      typeof order.deliveryAddress.lng === 'number'
    ) {
      y += 12;
      doc.setFontSize(8);
      doc.text(
        `Pinned Map Coordinates: ${order.deliveryAddress.lat.toFixed(5)}, ${order.deliveryAddress.lng.toFixed(5)}`,
        44,
        y,
      );
    }
    y += 12;
    doc.setFontSize(8);
    doc.text(
      'Manufactured & Dispatched from Coimbatore, Tamil Nadu (Deliverable ONLY to Tamil Nadu)',
      44,
      y,
    );
  }

  // Table Header
  y += 28;
  doc.setFillColor(241, 245, 249);
  doc.rect(44, y, pageWidth - 88, 28, 'F');
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('ITEM / DESCRIPTION', 56, y + 18);
  doc.text('QTY', 350, y + 18, { align: 'right' });
  doc.text('UNIT PRICE', 445, y + 18, { align: 'right' });
  doc.text('LINE TOTAL', pageWidth - 56, y + 18, { align: 'right' });

  y += 42;
  doc.setFont('helvetica', 'normal');
  for (const item of order.items) {
    doc.setTextColor(15, 23, 42);
    doc.text(item.name.slice(0, 46), 56, y);
    doc.text(String(item.quantity), 350, y, { align: 'right' });
    doc.text(formatInrPlain(item.price), 445, y, { align: 'right' });
    doc.text(formatInrPlain(item.price * item.quantity), pageWidth - 56, y, {
      align: 'right',
    });
    y += 22;
    doc.setDrawColor(226, 232, 240);
    doc.line(44, y - 8, pageWidth - 44, y - 8);
  }

  // Total Box
  y += 20;
  doc.setFillColor(11, 31, 58);
  doc.rect(pageWidth - 260, y, 216, 44, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('GRAND TOTAL', pageWidth - 246, y + 18);
  doc.setTextColor(245, 197, 66);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(formatInrPlain(order.totalAmount), pageWidth - 56, y + 32, {
    align: 'right',
  });

  // Footer
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    'UPI Merchant Number: 9080397469  |  Wrong payment is not responsible on PRIME X INNOVATION.',
    pageWidth / 2,
    785,
    { align: 'center' },
  );

  doc.save(`PrimeX_Invoice_${order.id}.pdf`);
}

export function downloadSalesReportPdf(
  orders: Order[],
  startDateIso: string,
  endDateIso: string,
  titleLabel: string,
): void {
  const { orders: filtered, totalSales, verifiedCount, pendingCount } =
    filterOrdersByDateRange(orders, startDateIso, endDateIso);

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(11, 31, 58);
  doc.rect(0, 0, pageWidth, 95, 'F');
  doc.setTextColor(245, 197, 66);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('PRIME X INNOVATION', 44, 44);
  doc.setTextColor(226, 232, 240);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`${titleLabel} (${startDateIso} to ${endDateIso})`, 44, 66);

  // Summary strip
  let y = 128;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Total Verified Sales: ${formatInrPlain(totalSales)}`, 44, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    `Total Orders: ${filtered.length}   |   Verified/Completed: ${verifiedCount}   |   Pending/Review: ${pendingCount}`,
    44,
    y + 18,
  );

  y += 42;
  doc.setFillColor(241, 245, 249);
  doc.rect(44, y, pageWidth - 88, 26, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('ORDER ID', 52, y + 17);
  doc.text('DATE', 150, y + 17);
  doc.text('CUSTOMER', 235, y + 17);
  doc.text('STATUS', 385, y + 17);
  doc.text('AMOUNT', pageWidth - 52, y + 17, { align: 'right' });

  y += 40;
  doc.setFont('helvetica', 'normal');
  if (filtered.length === 0) {
    doc.setTextColor(100, 116, 139);
    doc.text('No orders recorded in this date range.', 52, y);
  } else {
    for (const o of filtered) {
      if (y > 760) {
        doc.addPage();
        y = 56;
      }
      doc.setTextColor(15, 23, 42);
      doc.text(o.id, 52, y);
      doc.text(o.createdAt.slice(0, 10), 150, y);
      doc.text(o.customerName.slice(0, 24), 235, y);
      doc.text(o.status, 385, y);
      doc.text(formatInrPlain(o.totalAmount), pageWidth - 52, y, {
        align: 'right',
      });
      y += 20;
      doc.setDrawColor(226, 232, 240);
      doc.line(44, y - 7, pageWidth - 44, y - 7);
    }
  }

  doc.save(`PrimeX_Sales_Report_${startDateIso}_${endDateIso}.pdf`);
}
