#!/usr/bin/env node
/**
 * download-aircraft-icons.js
 * Downloads aircraft SVG silhouette data from open-source sources:
 * - dump1090-fa markers.js (BSD-3-Clause, FlightAware)
 * - tar1090 markers.js (GPL-3, wiedehopf) - for SVG paths only
 * 
 * Run: node download-aircraft-icons.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, 'src', 'utils');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(dest); });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  const sources = [
    {
      url: 'https://raw.githubusercontent.com/flightaware/dump1090/master/public_html/markers.js',
      out: path.join(OUT_DIR, 'dump1090_markers_raw.js'),
      label: 'dump1090-fa markers.js (BSD-3)',
    },
    {
      url: 'https://raw.githubusercontent.com/wiedehopf/tar1090/master/html/markers.js',
      out: path.join(OUT_DIR, 'tar1090_markers_raw.js'),
      label: 'tar1090 markers.js (GPL-3)',
    },
  ];

  for (const { url, out, label } of sources) {
    process.stdout.write(`Downloading ${label}... `);
    try {
      await download(url, out);
      const size = fs.statSync(out).size;
      console.log(`OK (${size} bytes) -> ${path.basename(out)}`);
    } catch (e) {
      console.error(`FAILED: ${e.message}`);
    }
  }

  console.log('\nDone. Check src/utils/ for the raw files.');
}

main().catch(console.error);
