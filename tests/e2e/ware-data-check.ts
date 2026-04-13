import { test, Page, Frame } from '@playwright/test';

const URL = 'https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/RegionallyFamous/bazaar/main/blueprint.json';

async function getFrame(page: Page): Promise<Frame | null> {
  for (const f of page.frames()) {
    if (f.url().includes('/wp-admin/') && f.url().includes('admin.php')) return f;
  }
  return null;
}

test('check /wares API response for icon field differences', async ({ page }) => {
  test.setTimeout(180_000);
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
  await wpFrame.waitForTimeout(1000);

  // Fetch /wares and dump the full ware objects
  const waresData = await wpFrame.evaluate(async () => {
    const win = window as any;
    const nonce = win.bazaarShell?.nonce ?? win.wpApiSettings?.nonce ?? '';
    const r = await fetch('/wp-json/bazaar/v1/wares', { headers: { 'X-WP-Nonce': nonce } });
    return await r.json();
  });

  console.log('\n/wares API response:');
  waresData.forEach((w: any) => {
    console.log(`  ${w.slug.padEnd(8)}: icon=${JSON.stringify(w.icon)} version=${w.version} enabled=${w.enabled}`);
  });

  // Check iconUrl logic inline
  const iconUrls = await wpFrame.evaluate(() => {
    const win = window as any;
    const shell = win.bazaarShell;
    if (!shell) return 'bazaarShell not found on window';
    return { 
      nonce: shell.nonce?.slice(0, 8) + '...',
      restUrl: shell.restUrl ?? 'not found',
    };
  });
  console.log('\nbazaarShell context:', JSON.stringify(iconUrls));

  // Check what the nav buttons actually contain
  const navHTML = await wpFrame.evaluate(() => {
    const btns = document.querySelectorAll('.bsh-nav__btn[data-slug]');
    return Array.from(btns)
      .filter(b => ['mosaic', 'sine', 'board'].includes(b.getAttribute('data-slug') ?? ''))
      .map(b => ({
        slug: b.getAttribute('data-slug'),
        innerHTML: b.innerHTML.replace(/\s+/g, ' ').slice(0, 300),
      }));
  });
  console.log('\nNav button innerHTML (board vs mosaic vs sine):');
  navHTML.forEach((b: any) => {
    console.log(`  [${b.slug}]: ${b.innerHTML}`);
  });
});
