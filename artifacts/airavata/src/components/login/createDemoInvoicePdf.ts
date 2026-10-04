export type DemoInvoiceReceipt = {
  name: string;
  phone: string;
  address: string;
  city: string;
  pinCode: string;
  orderId: string;
};

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

function pdfRule(y: number): string {
  return `0.85 0.89 0.85 RG 0.8 w 56 ${y} m 539 ${y} l S`;
}

export function createDemoInvoicePdf(receipt: DemoInvoiceReceipt): Blob {
  const numericId = receipt.orderId.replace(/\D/g, '');
  const paymentId = `pay_DEMO${numericId}`;
  const content = [
    '0.95 0.98 0.95 rg 50 730 495 75 re f',
    pdfText('Rangrez Studio', 70, 775, 23, '/F2', '0.13 0.31 0.23'),
    pdfText('DEMO INVOICE', 70, 752, 10, '/F1', '0.33 0.45 0.37'),
    pdfRule(718),
    pdfText(`Invoice no: INV-${receipt.orderId}`, 56, 694, 11, '/F2'),
    pdfText(`Order no: ${receipt.orderId}`, 56, 675, 10),
    pdfText(`Payment ID: ${paymentId}`, 56, 657, 10),
    pdfText('BILL TO', 56, 626, 9, '/F2', '0.36 0.52 0.40'),
    pdfText(receipt.name, 56, 608, 11, '/F2'),
    pdfText(`Phone: ${receipt.phone}`, 56, 590, 9),
    pdfText(`Deliver to: ${receipt.address}`, 56, 572, 9),
    pdfText(`${receipt.city}, ${receipt.pinCode}`, 56, 554, 9),
    pdfRule(530),
    pdfText('ITEM', 56, 507, 9, '/F2', '0.45 0.53 0.46'),
    pdfText('QTY', 420, 507, 9, '/F2', '0.45 0.53 0.46'),
    pdfText('AMOUNT', 470, 507, 9, '/F2', '0.45 0.53 0.46'),
    pdfText('Banarasi Silk Saree - Pure Katan silk, 6.3 m', 56, 484, 9),
    pdfText('1', 427, 484, 9),
    pdfText('INR 6,490', 470, 484, 9, '/F2'),
    pdfRule(463),
    pdfText('TOTAL PAID', 350, 437, 11, '/F2'),
    pdfText('INR 6,490', 470, 437, 11, '/F2', '0.13 0.42 0.27'),
    pdfText('Payment status: PAID - SIMULATED RAZORPAY', 56, 401, 10, '/F2', '0.13 0.42 0.27'),
    pdfText('Order status: Processing', 56, 382, 10),
    pdfRule(358),
    pdfText('This sample invoice was generated for the product demo.', 56, 332, 9, '/F1', '0.48 0.54 0.49'),
    pdfText('No real payment or order was created.', 56, 315, 9, '/F1', '0.48 0.54 0.49'),
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