import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { calculate, displayDate, type Invoice } from "./invoice";
import { fontBase64 } from "./pdf-font";

/** A fixed-layout PDF built exclusively from the frozen, issued invoice snapshot. */
export async function generatePdf(invoice: Invoice): Promise<Uint8Array> {
  if (!invoice.business || !invoice.number)
    throw Error("Issue this invoice before downloading its PDF.");
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(
    Uint8Array.from(atob(fontBase64), (c) => c.charCodeAt(0)),
    { subset: true },
  );
  const allText = [
    invoice.business.name,
    invoice.business.email,
    invoice.business.address,
    invoice.data.customerName,
    invoice.data.customerEmail,
    invoice.data.customerAddress,
    invoice.data.title,
    invoice.data.notes,
    invoice.data.paymentInstructions,
    ...invoice.data.items.map((i) => i.description),
  ].join("");
  const chars = new Set(font.getCharacterSet());
  for (const char of allText) {
    if (char.trim() && !chars.has(char.codePointAt(0)!))
      throw Error(
        "This PDF font does not support one or more characters in the invoice. Use Latin, Greek, or Cyrillic text for this version.",
      );
  }
  document.setTitle(`${invoice.number} — ${invoice.data.customerName}`);
  document.setAuthor(invoice.business.name);
  document.setCreator("InvoiceFlow");
  document.setCreationDate(new Date(invoice.createdAt));
  const ink = rgb(0.12, 0.21, 0.15),
    muted = rgb(0.42, 0.48, 0.43),
    pale = rgb(0.9, 0.93, 0.87);
  const margin = 44,
    width = 507;
  let page: PDFPage = document.addPage([595.28, 841.89]);
  let y = 792;
  const addPage = () => {
    page = document.addPage([595.28, 841.89]);
    y = 792;
  };
  const write = (s: string, x: number, at: number, size = 10, color = ink) =>
    page.drawText(s, { x, y: at, font, size, color });
  const ensure = (height: number) => {
    if (y - height < 65) addPage();
  };
  const wrap = (text: string, maxWidth: number, size: number) => {
    const lines: string[] = [];
    for (const paragraph of text.replace(/\r/g, "").split("\n")) {
      let line = "";
      for (const char of paragraph) {
        if (font.widthOfTextAtSize(line + char, size) > maxWidth) {
          const split = line.lastIndexOf(" ");
          if (split > line.length * 0.5) {
            lines.push(line.slice(0, split));
            line = line.slice(split + 1) + char;
          } else {
            lines.push(line);
            line = char;
          }
        } else line += char;
      }
      lines.push(line);
    }
    return lines;
  };
  const para = (
    text: string,
    size = 10,
    maxWidth = width,
    x = margin,
    color = ink,
  ) => {
    for (const line of wrap(text, maxWidth, size)) {
      ensure(size + 6);
      write(line, x, y, size, color);
      y -= size + 6;
    }
  };
  const line = () => {
    ensure(12);
    page.drawLine({
      start: { x: margin, y },
      end: { x: margin + width, y },
      thickness: 0.7,
      color: pale,
    });
    y -= 18;
  };
  write("INVOICE", 402, y, 22);
  write(invoice.number, 402, y - 22, 11, muted);
  para(invoice.business.name, 20, 320);
  y -= 6;
  para(invoice.business.email, 10, 320, margin, muted);
  if (invoice.business.address)
    para(invoice.business.address, 10, 320, margin, muted);
  y -= 16;
  line();
  const metaTop = y;
  write("ISSUED", 402, metaTop, 8, muted);
  write(displayDate(invoice.data.issueDate), 402, metaTop - 18, 10);
  write("DUE DATE", 402, metaTop - 46, 8, muted);
  write(displayDate(invoice.data.dueDate), 402, metaTop - 64, 10);
  para("BILL TO", 8, 310, margin, muted);
  para(invoice.data.customerName, 13, 310);
  if (invoice.data.customerEmail)
    para(invoice.data.customerEmail, 10, 310, margin, muted);
  if (invoice.data.customerAddress)
    para(invoice.data.customerAddress, 10, 310, margin, muted);
  y = Math.min(y, metaTop - 88);
  y -= 18;
  para(invoice.data.title, 13);
  y -= 9;
  const totals = calculate(invoice.data);
  const fmt = (cents: number) =>
    `${invoice.data.currency} ${(cents / 100).toFixed(2)}`;
  const tableHead = () => {
    ensure(45);
    page.drawRectangle({
      x: margin,
      y: y - 8,
      width,
      height: 25,
      color: rgb(0.96, 0.97, 0.95),
    });
    write("DESCRIPTION", margin + 7, y, 8, muted);
    write("QTY", 335, y, 8, muted);
    write("RATE", 395, y, 8, muted);
    write("AMOUNT", 485, y, 8, muted);
    y -= 30;
  };
  tableHead();
  invoice.data.items.forEach((item, index) => {
    const lines = wrap(item.description, 270, 10);
    const h = lines.length * 16 + 20;
    if (y - h < 65) {
      addPage();
      tableHead();
    }
    const top = y;
    for (const text of lines) {
      write(text, margin + 7, y, 10);
      y -= 16;
    }
    write(item.quantity, 335, top, 10);
    write(Number(item.rate).toFixed(2), 395, top, 10);
    const amount = (totals.lines[index] / 100).toFixed(2);
    write(
      amount,
      margin + width - font.widthOfTextAtSize(amount, 10) - 7,
      top,
      10,
    );
    y = top - h + 8;
    page.drawLine({
      start: { x: margin, y },
      end: { x: margin + width, y },
      thickness: 0.5,
      color: pale,
    });
    y -= 12;
  });
  ensure(145);
  y -= 10;
  const sum = (label: string, value: string, size = 10) => {
    write(label, 325, y, size, muted);
    write(value, margin + width - font.widthOfTextAtSize(value, size), y, size);
    y -= 25;
  };
  sum("Subtotal", fmt(totals.subtotal));
  if (totals.discount)
    sum(`Discount (${invoice.data.discount}%)`, "-" + fmt(totals.discount));
  sum(`Tax (${invoice.data.tax}%)`, fmt(totals.tax));
  sum("TOTAL", fmt(totals.total), 14);
  y -= 30;
  if (invoice.data.paymentInstructions) {
    para("PAYMENT DETAILS", 8, width, margin, muted);
    para(invoice.data.paymentInstructions, 10);
    y -= 18;
  }
  if (invoice.data.notes) para(invoice.data.notes, 10, width, margin, muted);
  document.getPages().forEach((p, index) => {
    p.drawLine({
      start: { x: margin, y: 47 },
      end: { x: margin + width, y: 47 },
      color: pale,
      thickness: 0.7,
    });
    p.drawText(`${invoice.number} · Created with InvoiceFlow`, {
      x: margin,
      y: 31,
      size: 8,
      font,
      color: muted,
    });
    p.drawText(`${index + 1} / ${document.getPageCount()}`, {
      x: 510,
      y: 31,
      size: 8,
      font,
      color: muted,
    });
  });
  return document.save();
}
