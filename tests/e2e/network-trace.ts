import { test, Page, Frame } from '@playwright/test';

const URL = 'https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/RegionallyFamous/bazaar/main/blueprint.json';

async function getFrame(page: Page): Promise<Frame | null> {
  for (const f of page.frames()) {
    if (f.url().includes('/wp-admin/') && f.url().includes('admin.php')) return f;
  }
  return null;
}

test('trace network requests for ware icon images', async ({ page }) => {
  test.setTimeout(180_000);

  // Track all requests that match /serve/ pattern
  const serveRequests: Array<{ url: string; status?: number; failed?: string }> = [];
  page.on('requestfinished', async req => {
    if (req.url().includes('/serve/')) {
      try {
        const resp = await req.response();
        serveRequests.push({ url: req.url().slice(-80), status: resp?.status() });
      } catch { /* ignore */ }
    }
  });
  page.on('requestfailed', req => {
    if (req.url().includes('/serve/')) {
      serveRequests.push({ url: req.url().slice(-80), failed: req.failure()?.errorText ?? 'unknown' });
    }
  });

  await page.goto(URL, { timeout: 60_000 });
  
  let wpFrame: Frame | null = null;
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(20_000);
    wpFrame = await getFrame(page);
    if (wpFrame) {
      const body = await wpFrame.evaluate(() => document.body?.className ?? '').catch(() => '');
      if (body.includes('wp-admin')) { console.log(`Frame ready at poll ${i+1}`); break; }
    }
    wpFrame = null;
  }
  if (!wpFrame) throw new Error('No frame');

  // Wait for icons to attempt loading
  await page.waitForTimeout(5000);

  console.log(`\nNetwork requests to /serve/ (${serveRequests.length} total):`);
  serveRequests.forEach(r => {
    const icon = r.url.includes('icon.svg');
    if (icon) {
      const ok = r.status === 200;
      console.log(`  ${ok ? '✓' : r.failed ? '✗ FAIL' : `~ ${r.status}`} ${r.url}`);
      if (r.failed) console.log(`    Error: ${r.failed}`);
    }
  });

  const iconRequests = serveRequests.filter(r => r.url.includes('icon.svg'));
  console.log(`\nIcon requests summary: ${iconRequests.length} requests`);
  const slugs = ['board', 'flow', 'ledger', 'mosaic', 'sine', 'swatch', 'tome'];
  slugs.forEach(slug => {
    const reqs = iconRequests.filter(r => r.url.includes(`/${slug}/`));
    console.log(`  ${slug}: ${reqs.length} request(s), statuses: ${reqs.map(r => r.status ?? r.failed).join(', ')}`);
  });
});
