/**
 * Export refined / chat text to common file formats.
 */
const fs = require("node:fs");
const { Document, Packer, Paragraph, TextRun } = require("docx");

const FORMATS = {
  txt: {
    ext: "txt",
    label: "Plain text",
    filters: [{ name: "Plain text", extensions: ["txt"] }],
  },
  md: {
    ext: "md",
    label: "Markdown",
    filters: [{ name: "Markdown", extensions: ["md"] }],
  },
  docx: {
    ext: "docx",
    label: "Word document",
    filters: [{ name: "Word document", extensions: ["docx"] }],
  },
};

function defaultExportName(prefix = "peek-refine") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${prefix}-${stamp}`;
}

function paragraphsFromText(text) {
  const lines = String(text || "").split(/\r?\n/);
  if (!lines.length) {
    return [new Paragraph({ children: [new TextRun("")] })];
  }
  return lines.map((line) => new Paragraph({
    children: [new TextRun({ text: line.length ? line : " " })],
  }));
}

async function buildDocxBuffer(text) {
  const doc = new Document({
    sections: [{ children: paragraphsFromText(text) }],
  });
  return Packer.toBuffer(doc);
}

async function writeExport(format, filePath, text) {
  const fmt = FORMATS[format] || FORMATS.txt;
  if (format === "docx") {
    const buf = await buildDocxBuffer(text);
    fs.writeFileSync(filePath, buf);
    return;
  }
  const body = format === "md" ? String(text || "") : String(text || "");
  fs.writeFileSync(filePath, body, "utf8");
}

module.exports = { FORMATS, defaultExportName, writeExport };
