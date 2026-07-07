"use strict";

const { createWorker } = require("tesseract.js");

let workerPromise = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker("eng", 1, { logger: () => {} });
      return worker;
    })();
  }
  return workerPromise;
}

function charBoxesForWord(word, wordKey) {
  const symbols = word.symbols?.filter((s) => s.text != null && s.text !== "");
  if (symbols?.length) {
    return symbols.map((s) => ({
      text: s.text,
      bbox: s.bbox,
      wordKey,
    }));
  }
  const chars = [...(word.text || "")];
  if (!chars.length) return [];
  const x0 = word.bbox.x0;
  const y0 = word.bbox.y0;
  const y1 = word.bbox.y1;
  const totalW = Math.max(1, word.bbox.x1 - word.bbox.x0);
  const cw = totalW / chars.length;
  return chars.map((ch, i) => ({
    text: ch,
    bbox: { x0: x0 + i * cw, y0, x1: x0 + (i + 1) * cw, y1 },
    wordKey,
  }));
}

function collectGlyphs(blocks) {
  const lines = [];
  const glyphs = [];
  let glyphId = 0;
  let lineId = 0;

  for (const block of blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        const lineText = (line.text || "").trim();
        if (!lineText || !line.bbox) continue;
        const lid = lineId++;
        lines.push({ id: lid, bbox: line.bbox });

        for (const word of line.words || []) {
          const wordKey = `${lid}-${word.bbox.x0}`;
          for (const box of charBoxesForWord(word, wordKey)) {
            glyphs.push({
              id: glyphId++,
              lineId: lid,
              wordKey,
              text: box.text,
              bbox: box.bbox,
            });
          }
        }
      }
    }
  }
  return { lines, glyphs };
}

function glyphsToText(glyphs) {
  if (!glyphs.length) return "";
  const sorted = [...glyphs].sort((a, b) => {
    const dy = a.bbox.y0 - b.bbox.y0;
    if (Math.abs(dy) > 6) return dy;
    return a.bbox.x0 - b.bbox.x0;
  });
  let out = "";
  let prevWord = null;
  let prevLine = null;
  for (const g of sorted) {
    if (prevLine != null && g.lineId !== prevLine) out += "\n";
    else if (prevWord != null && g.wordKey !== prevWord && out && !out.endsWith("\n")) out += " ";
    out += g.text;
    prevWord = g.wordKey;
    prevLine = g.lineId;
  }
  return out;
}

async function recognizeLayout(imagePath) {
  const worker = await getWorker();
  const { data } = await worker.recognize(imagePath, {}, { blocks: true });
  const { lines, glyphs } = collectGlyphs(data.blocks);
  return { lines, glyphs };
}

module.exports = { recognizeLayout, glyphsToText };
