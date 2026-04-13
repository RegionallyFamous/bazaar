/**
 * Tests whether each ware's icon.svg can actually be rendered as <img>
 * by creating img elements in the browser and checking naturalWidth.
 */
import { test, chromium } from '@playwright/test';

test('direct SVG render test — standalone browser (no Playground)', async ({ }) => {
  test.setTimeout(60_000);

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Create a minimal HTML page with img tags for all 7 ware icons
  const slugs = ['board', 'flow', 'ledger', 'mosaic', 'sine', 'swatch', 'tome'];
  
  // Use the raw GitHub content URLs (direct, no redirect)
  const bust = Date.now(); // cache-bust to avoid serving old broken SVG
  const iconUrls: Record<string, string> = {
    board:  `https://raw.githubusercontent.com/RegionallyFamous/bazaar/main/wares/board/public/icon.svg?v=${bust}`,
    flow:   `https://raw.githubusercontent.com/RegionallyFamous/bazaar/main/wares/flow/public/icon.svg?v=${bust}`,
    ledger: `https://raw.githubusercontent.com/RegionallyFamous/bazaar/main/wares/ledger/public/icon.svg?v=${bust}`,
    mosaic: `https://raw.githubusercontent.com/RegionallyFamous/bazaar/main/wares/mosaic/public/icon.svg?v=${bust}`,
    sine:   `https://raw.githubusercontent.com/RegionallyFamous/bazaar/main/wares/sine/public/icon.svg?v=${bust}`,
    swatch: `https://raw.githubusercontent.com/RegionallyFamous/bazaar/main/wares/swatch/public/icon.svg?v=${bust}`,
    tome:   `https://raw.githubusercontent.com/RegionallyFamous/bazaar/main/wares/tome/public/icon.svg?v=${bust}`,
  };

  const html = `<!DOCTYPE html><html><body>${
    slugs.map(s => `<img id="${s}" src="${iconUrls[s]}" width="64" height="64" alt="${s}"><span id="${s}-label">${s}</span><br>`).join('\n')
  }</body></html>`;

  await page.setContent( html );
  await page.waitForTimeout(5000); // wait for images to load

  const results = await page.evaluate((slugs) => {
    return slugs.map(slug => {
      const img = document.getElementById(slug) as HTMLImageElement;
      return {
        slug,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        src: img.src.slice(-60),
      };
    });
  }, slugs);

  console.log('\nDirect SVG render test (GitHub raw URLs):');
  results.forEach((r: any) => {
    const ok = r.complete && r.naturalWidth > 0;
    console.log(`  ${ok ? '✓' : '✗'} ${r.slug.padEnd(8)}: complete=${r.complete} ${r.naturalWidth}x${r.naturalHeight}`);
  });

  await page.screenshot({ path: 'tests/e2e/screenshots/svg-render-direct.png' });
  await browser.close();
});
