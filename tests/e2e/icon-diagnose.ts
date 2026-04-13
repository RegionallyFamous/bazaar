import { test, Page, Frame } from '@playwright/test';

const URL = 'https://playground.wordpress.net/?blueprint-url=https://raw.githubusercontent.com/RegionallyFamous/bazaar/main/blueprint.json';

async function getFrame(page: Page): Promise<Frame | null> {
  for (const f of page.frames()) {
    if (f.url().includes('/wp-admin/') && f.url().includes('admin.php')) return f;
  }
  return null;
}

test('diagnose mosaic icon failure', async ({ page }) => {
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

  // Inject a MutationObserver ASAP to record all img src attempts in the nav
  const imgEvents = await wpFrame.evaluate(async () => {
    return new Promise<any[]>((resolve) => {
      const events: any[] = [];
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of Array.from(m.addedNodes)) {
            if ((node as HTMLElement).tagName === 'IMG') {
              const img = node as HTMLImageElement;
              const parent = img.closest('[data-slug]');
              const slug = parent?.getAttribute('data-slug') ?? 'unknown';
              events.push({ type: 'img-added', slug, src: img.src.slice(-80) });
              img.addEventListener('load', () => events.push({ type: 'load', slug }));
              img.addEventListener('error', () => events.push({ type: 'error', slug, src: img.src.slice(-80) }));
            }
          }
          for (const node of Array.from(m.removedNodes)) {
            if ((node as HTMLElement).tagName === 'IMG') {
              const parent = (m.target as HTMLElement).closest('[data-slug]');
              events.push({ type: 'img-removed', slug: parent?.getAttribute('data-slug') ?? 'unknown' });
            }
          }
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      // Resolve after 8 seconds
      setTimeout(() => { observer.disconnect(); resolve(events); }, 8000);
    });
  });

  console.log('\nMutationObserver events (img lifecycle):');
  imgEvents.forEach(e => console.log(' ', JSON.stringify(e)));

  // Also check current state of nav buttons
  const navState = await wpFrame.evaluate(() => {
    const btns = document.querySelectorAll('.bsh-nav__btn[data-slug]');
    return Array.from(btns).map(btn => {
      const slug = btn.getAttribute('data-slug') ?? '';
      const img = btn.querySelector('img') as HTMLImageElement | null;
      // Look for any img children (including hidden ones)
      const allImgs = btn.querySelectorAll('img');
      return {
        slug,
        imgCount: allImgs.length,
        firstImgSrc: allImgs[0] ? (allImgs[0] as HTMLImageElement).src.slice(-80) : 'none',
        btnInnerHTML: btn.innerHTML.slice(0, 200),
      };
    });
  });
  console.log('\nNav button state:');
  navState.forEach((s: any) => {
    if (s.slug) console.log(`  ${s.slug}: imgCount=${s.imgCount} src=${s.firstImgSrc}`);
  });

  // Fetch the actual icon SVG content and check it
  console.log('\nActual SVG content check:');
  const svgContent = await wpFrame.evaluate(async () => {
    const slugs = ['board', 'mosaic', 'sine'];
    const results: Record<string, any> = {};
    for (const slug of slugs) {
      const r = await fetch(`/wp-json/bazaar/v1/serve/${slug}/icon.svg`);
      const text = await r.text();
      results[slug] = {
        status: r.status,
        length: text.length,
        first100: text.slice(0, 100),
        isValidXml: text.trim().startsWith('<'),
        hasSvgTag: text.includes('<svg'),
      };
    }
    return results;
  });
  Object.entries(svgContent).forEach(([slug, r]: [string, any]) => {
    console.log(`  ${slug}: status=${r.status} len=${r.length} validXml=${r.isValidXml} hasSvg=${r.hasSvgTag}`);
    console.log(`    first 100: ${r.first100.replace(/\n/g, '\\n')}`);
  });
});
