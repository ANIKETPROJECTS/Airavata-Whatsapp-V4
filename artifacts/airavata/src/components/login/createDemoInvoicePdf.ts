export type DemoInvoiceReceipt = {
  name: string;
  phone: string;
  address: string;
  city: string;
  pinCode: string;
  orderId: string;
};

const invoiceTotalPaise = 649_000;

export function getDemoInvoiceAmounts() {
  const taxablePaise = Math.round(invoiceTotalPaise * 100 / 105);
  const gstPaise = invoiceTotalPaise - taxablePaise;
  const cgstPaise = Math.floor(gstPaise / 2);

  return {
    totalPaise: invoiceTotalPaise,
    taxablePaise,
    cgstPaise,
    sgstPaise: gstPaise - cgstPaise,
    gstPaise,
  };
}

export function formatDemoInvoiceMoney(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function getDemoInvoiceDate(): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());
}

export function getPaymentReference(orderId: string): string {
  return `pay_${orderId.replace(/\D/g, '')}R8K4`;
}

function escapePdfText(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/[\\()]/g, '\\$&');
}

function pdfText(
  value: string,
  x: number,
  y: number,
  size: number,
  font = '/F1',
  color = '0.24 0.31 0.26',
): string {
  return `${color} rg\nBT ${font} ${size} Tf 1 0 0 1 ${x} ${y} Tm (${escapePdfText(value)}) Tj ET`;
}

function pdfRect(x: number, y: number, width: number, height: number, color: string): string {
  return `${color} rg\n${x} ${y} ${width} ${height} re f`;
}

function pdfRule(y: number, color = '0.87 0.90 0.93'): string {
  return `${color} RG 0.8 w 50 ${y} m 545 ${y} l S`;
}

function pdfMoney(paise: number): string {
  const amount = (paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `INR ${amount}`;
}

export function createDemoInvoicePdf(receipt: DemoInvoiceReceipt, paymentMethod = 'Google Pay'): Blob {
  const tax = getDemoInvoiceAmounts();
  const paymentId = getPaymentReference(receipt.orderId);
  const invoiceDate = getDemoInvoiceDate();
  const content = [
    pdfRect(50, 748, 495, 56, '0.95 0.97 0.99'),
    pdfText('RANGREZ STUDIO', 66, 779, 18, '/F2', '0.11 0.29 0.23'),
    pdfText('HANDWOVEN BANARASI TEXTILES', 66, 761, 7, '/F1', '0.39 0.48 0.44'),
    pdfText('SAMPLE GST INVOICE', 404, 779, 8, '/F2', '0.12 0.39 0.65'),
    pdfText('NOT VALID FOR TAX CLAIM', 404, 762, 6, '/F2', '0.60 0.34 0.27'),

    pdfText('Tax invoice', 50, 718, 20, '/F2', '0.12 0.20 0.29'),
    pdfText(`Invoice no.  ${receipt.orderId}`, 50, 699, 8, '/F2', '0.35 0.43 0.50'),
    pdfText('INVOICE DATE', 374, 719, 6, '/F2', '0.48 0.55 0.61'),
    pdfText(invoiceDate, 374, 702, 9, '/F2', '0.16 0.25 0.33'),
    pdfText('ORDER NUMBER', 470, 719, 6, '/F2', '0.48 0.55 0.61'),
    pdfText(receipt.orderId, 470, 702, 8, '/F2', '0.16 0.25 0.33'),
    pdfRule(687),

    pdfRect(50, 589, 241, 82, '0.97 0.98 0.99'),
    pdfRect(304, 589, 241, 82, '0.97 0.98 0.99'),
    pdfText('SOLD BY', 63, 653, 7, '/F2', '0.12 0.39 0.65'),
    pdfText('Rangrez Studio - sample merchant', 63, 636, 9, '/F2', '0.16 0.25 0.33'),
    pdfText('Varanasi, Uttar Pradesh 221001', 63, 619, 7, '/F1', '0.35 0.43 0.50'),
    pdfText('GSTIN: Not configured (sample)', 63, 603, 7, '/F1', '0.35 0.43 0.50'),
    pdfText('BILL TO / SHIP TO', 317, 653, 7, '/F2', '0.12 0.39 0.65'),
    pdfText(receipt.name, 317, 636, 9, '/F2', '0.16 0.25 0.33'),
    pdfText(receipt.phone, 317, 619, 7, '/F1', '0.35 0.43 0.50'),
    pdfText(receipt.address, 317, 603, 7, '/F1', '0.35 0.43 0.50'),
    pdfText(`${receipt.city}, Uttar Pradesh ${receipt.pinCode}`, 317, 591, 7, '/F1', '0.35 0.43 0.50'),
    pdfText('PLACE OF SUPPLY  Uttar Pradesh (illustrative)', 50, 570, 7, '/F1', '0.35 0.43 0.50'),
    pdfText('Tax calculation assumes an intra-state sample sale.', 50, 557, 7, '/F1', '0.48 0.55 0.61'),

    pdfRect(50, 516, 495, 28, '0.91 0.95 0.97'),
    pdfText('ITEM DESCRIPTION', 62, 527, 6, '/F2', '0.34 0.43 0.50'),
    pdfText('HSN', 300, 527, 6, '/F2', '0.34 0.43 0.50'),
    pdfText('QTY', 352, 527, 6, '/F2', '0.34 0.43 0.50'),
    pdfText('TAXABLE VALUE', 390, 527, 6, '/F2', '0.34 0.43 0.50'),
    pdfText('TOTAL', 494, 527, 6, '/F2', '0.34 0.43 0.50'),
    pdfText('Banarasi Silk Saree', 62, 498, 8, '/F2', '0.16 0.25 0.33'),
    pdfText('Pure Katan silk - 6.3 m', 62, 483, 7, '/F1', '0.48 0.55 0.61'),
    pdfText('5007', 300, 498, 7, '/F1', '0.27 0.36 0.43'),
    pdfText('1', 352, 498, 7, '/F1', '0.27 0.36 0.43'),
    pdfText(pdfMoney(tax.taxablePaise), 390, 498, 7, '/F1', '0.27 0.36 0.43'),
    pdfText(pdfMoney(tax.totalPaise), 494, 498, 7, '/F2', '0.16 0.25 0.33'),
    pdfRule(472),

    pdfRect(50, 355, 239, 101, '0.97 0.98 0.99'),
    pdfRect(302, 355, 243, 101, '0.97 0.98 0.99'),
    pdfText('PAYMENT DETAILS', 63, 437, 7, '/F2', '0.12 0.39 0.65'),
    pdfText('Status', 63, 418, 7, '/F1', '0.48 0.55 0.61'),
    pdfText('Successful in preview only', 146, 418, 7, '/F2', '0.18 0.42 0.29'),
    pdfText('Method', 63, 400, 7, '/F1', '0.48 0.55 0.61'),
    pdfText(`UPI - ${paymentMethod}`, 146, 400, 7, '/F2', '0.27 0.36 0.43'),
    pdfText('Payment ref.', 63, 382, 7, '/F1', '0.48 0.55 0.61'),
    pdfText(paymentId, 146, 382, 7, '/F1', '0.27 0.36 0.43'),

    pdfText('TAX SUMMARY', 316, 437, 7, '/F2', '0.12 0.39 0.65'),
    pdfText('Taxable value', 316, 418, 7, '/F1', '0.35 0.43 0.50'),
    pdfText(pdfMoney(tax.taxablePaise), 475, 418, 7, '/F1', '0.27 0.36 0.43'),
    pdfText('CGST @ 2.5%', 316, 402, 7, '/F1', '0.35 0.43 0.50'),
    pdfText(pdfMoney(tax.cgstPaise), 475, 402, 7, '/F1', '0.27 0.36 0.43'),
    pdfText('SGST @ 2.5%', 316, 386, 7, '/F1', '0.35 0.43 0.50'),
    pdfText(pdfMoney(tax.sgstPaise), 475, 386, 7, '/F1', '0.27 0.36 0.43'),
    pdfRule(374),
    pdfText('Total payable (incl. GST)', 316, 361, 7, '/F2', '0.16 0.25 0.33'),
    pdfText(pdfMoney(tax.totalPaise), 475, 361, 8, '/F2', '0.12 0.39 0.31'),

    pdfText('GST rate: 5%  |  HSN 5007  |  Total GST included:  ' + pdfMoney(tax.gstPaise), 50, 333, 8, '/F2', '0.16 0.25 0.33'),
    pdfText('Amount in words: Indian Rupees Six Thousand Four Hundred Ninety Only', 50, 315, 8, '/F1', '0.35 0.43 0.50'),
    pdfText('Order status: Processing', 50, 297, 8, '/F1', '0.35 0.43 0.50'),

    pdfRect(50, 214, 495, 61, '0.96 0.97 0.95'),
    pdfText('SAMPLE DOCUMENT NOTICE', 64, 255, 7, '/F2', '0.12 0.39 0.65'),
    pdfText('This is an illustrative preview using sample merchant and customer details.', 64, 237, 8, '/F1', '0.27 0.36 0.43'),
    pdfText('GSTIN is not configured. Do not use this preview to claim input tax credit.', 64, 222, 8, '/F1', '0.27 0.36 0.43'),
    pdfRule(194),
    pdfText('No payment, tax invoice, or order was actually created.', 50, 174, 8, '/F2', '0.60 0.34 0.27'),
    pdfText('Thank you for choosing Rangrez Studio.', 50, 146, 8, '/F1', '0.48 0.55 0.61'),
    pdfText(`Invoice preview  |  ${invoiceDate}  |  ${receipt.orderId}`, 352, 146, 7, '/F1', '0.48 0.55 0.61'),
  ].join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>\nendobj',
    `4 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += `${object}\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: 'application/pdf' });
}