#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--manifest') out.manifest = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.manifest) throw new Error('--manifest required');
  const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8'));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent('<html><body>decode bench</body></html>');

  const results = [];
  for (const sample of manifest.samples) {
    const abs = path.resolve(sample.path);
    const base64 = fs.readFileSync(abs).toString('base64');
    try {
      let stats;
      if (sample.codec === 'H.264-key') {
        stats = await page.evaluate(async ({ encoded, repeats }) => {
          const raw = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
          const blob = new Blob([raw], { type: 'video/mp4' });
          const blobUrl = URL.createObjectURL(blob);
          const times = [];
          for (let i = 0; i < repeats; i += 1) {
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.preload = 'auto';
            const done = new Promise((resolve, reject) => {
              const start = performance.now();
              video.addEventListener('loadeddata', () => resolve(performance.now() - start), { once: true });
              video.addEventListener('error', () => reject(new Error('video decode failed')), { once: true });
            });
            video.src = blobUrl;
            times.push(await done);
            video.removeAttribute('src');
            video.load();
          }
          URL.revokeObjectURL(blobUrl);
          times.sort((a, b) => a - b);
          const pct = (p) => times[Math.min(times.length - 1, Math.max(0, Math.floor((times.length - 1) * p)))];
          return { p50: pct(0.50), p99: pct(0.99) };
        }, { encoded: base64, repeats: manifest.repeats });
      } else {
        stats = await page.evaluate(async ({ encoded, codec, repeats }) => {
          const mime = codec === 'JPEG' ? 'image/jpeg' : (codec === 'WebP' ? 'image/webp' : 'image/avif');
          const raw = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
          const blob = new Blob([raw], { type: mime });
          const blobUrl = URL.createObjectURL(blob);
          const times = [];
          for (let i = 0; i < repeats; i += 1) {
            const img = new Image();
            const start = performance.now();
            img.src = blobUrl;
            await img.decode();
            times.push(performance.now() - start);
          }
          URL.revokeObjectURL(blobUrl);
          times.sort((a, b) => a - b);
          const pct = (p) => times[Math.min(times.length - 1, Math.max(0, Math.floor((times.length - 1) * p)))];
          return { p50: pct(0.50), p99: pct(0.99) };
        }, { encoded: base64, codec: sample.codec, repeats: manifest.repeats });
      }
      results.push({ label: sample.label, browser_decode_ms_p50: stats.p50, browser_decode_ms_p99: stats.p99 });
    } catch (err) {
      results.push({ label: sample.label, error: String(err) });
    }
  }

  await browser.close();
  process.stdout.write(JSON.stringify({ results }));
}

main().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
