import { inflateRawSync } from "node:zlib";

export interface ParsedPricingRow {
  service: string;
  category: string;
  price: number;
  currency: string;
}

type ZipEntry = { name: string; method: number; compressedSize: number; dataOffset: number };

function readUInt32(buffer: Buffer, offset: number): number {
  return buffer.readUInt32LE(offset);
}

function readUInt16(buffer: Buffer, offset: number): number {
  return buffer.readUInt16LE(offset);
}

function zipEntries(buffer: Buffer): ZipEntry[] {
  const eocd = 0x06054b50;
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === eocd) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("Invalid XLSX file: ZIP directory not found");

  const count = readUInt16(buffer, end + 10);
  const directoryOffset = readUInt32(buffer, end + 16);
  const entries: ZipEntry[] = [];
  let cursor = directoryOffset;

  for (let i = 0; i < count; i++) {
    if (readUInt32(buffer, cursor) !== 0x02014b50) throw new Error("Invalid XLSX file: ZIP entry missing");
    const method = readUInt16(buffer, cursor + 10);
    const compressedSize = readUInt32(buffer, cursor + 20);
    const nameLength = readUInt16(buffer, cursor + 28);
    const extraLength = readUInt16(buffer, cursor + 30);
    const commentLength = readUInt16(buffer, cursor + 32);
    const localOffset = readUInt32(buffer, cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (readUInt32(buffer, localOffset) !== 0x04034b50) throw new Error("Invalid XLSX file: local entry missing");
    const localNameLength = readUInt16(buffer, localOffset + 26);
    const localExtraLength = readUInt16(buffer, localOffset + 28);
    entries.push({
      name,
      method,
      compressedSize,
      dataOffset: localOffset + 30 + localNameLength + localExtraLength,
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipFile(buffer: Buffer, entries: ZipEntry[], name: string): string {
  const entry = entries.find((item) => item.name === name);
  if (!entry) throw new Error(`Invalid XLSX file: ${name} not found`);
  const compressed = buffer.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  const data = entry.method === 0 ? compressed : inflateRawSync(compressed);
  return data.toString("utf8");
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .trim();
}

function xmlAttribute(attrs: string, name: string): string {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return match?.[1] ?? "";
}

function columnIndex(cellRef: string): number {
  const letters = cellRef.match(/[A-Z]+/i)?.[0]?.toUpperCase() ?? "";
  return [...letters].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function cellValue(cellXml: string, attrs: string, sharedStrings: string[]): string {
  const type = xmlAttribute(attrs, "t");
  if (type === "inlineStr") {
    return decodeXml([...cellXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
  }
  const value = cellXml.match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1] ?? "";
  if (type === "s") return decodeXml(sharedStrings[Number(value)] ?? "");
  return decodeXml(value);
}

function sharedStringValues(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    decodeXml([...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((item) => item[1]).join("")),
  );
}

export function parsePricingWorkbook(buffer: Buffer): ParsedPricingRow[] {
  const entries = zipEntries(buffer);
  const sharedStrings = entries.some((entry) => entry.name === "xl/sharedStrings.xml")
    ? sharedStringValues(readZipFile(buffer, entries, "xl/sharedStrings.xml"))
    : [];
  const worksheet = entries.find((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name));
  if (!worksheet) throw new Error("Invalid XLSX file: no worksheet found");
  const xml = readZipFile(buffer, entries, worksheet.name);
  const rows = [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)];
  if (rows.length < 2) throw new Error("The workbook does not contain a header and pricing rows");

  const values = rows.map((row) => {
    const cells: string[] = [];
    for (const match of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = match[1];
      const ref = xmlAttribute(attrs, "r");
      cells[columnIndex(ref)] = cellValue(match[2] ?? "", attrs, sharedStrings);
    }
    return cells;
  });

  const headers = values[0].map((value) => value.toLowerCase().replace(/\s+/g, " ").trim());
  const serviceIndex = headers.findIndex((header) => ["service", "service name", "product"].includes(header));
  const categoryIndex = headers.findIndex((header) => ["category", "car category", "vehicle category"].includes(header));
  const priceIndex = headers.findIndex((header) => /^price|amount|cost/.test(header));
  if (serviceIndex < 0 || categoryIndex < 0 || priceIndex < 0) {
    throw new Error("Workbook must contain Service, Category, and Price columns");
  }

  const parsed: ParsedPricingRow[] = [];
  for (const row of values.slice(1)) {
    const service = String(row[serviceIndex] ?? "").trim();
    const category = String(row[categoryIndex] ?? "").trim();
    const priceText = String(row[priceIndex] ?? "").replace(/[₹,$\s]/g, "");
    const price = Number(priceText);
    if (!service && !category && !priceText) continue;
    if (!service || !category || !Number.isFinite(price) || price < 0) {
      throw new Error(`Invalid pricing row: ${JSON.stringify(row)}`);
    }
    parsed.push({ service, category, price, currency: "INR" });
  }
  if (!parsed.length) throw new Error("No pricing rows were found in the workbook");
  return parsed;
}