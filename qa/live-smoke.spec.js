// Live, READ-ONLY smoke against a deployed URL (staging or prod). No data is
// ever created, edited, or deleted — safe to run against real environments.
// Configured by playwright.qa.config.js via QA_TARGET_URL / QA_EMAIL / QA_PASSWORD.
//
// Mirrors the CRM repo's qa/live-smoke.spec.ts — same safety contract, same
// self-skipping-without-credentials behavior, adapted to this app's DOM.
const { test, expect } = require('@playwright/test');

const EMAIL = process.env.QA_EMAIL;
const PASSWORD = process.env.QA_PASSWORD;
const HAS_CREDS = !!(EMAIL && PASSWORD);

// Nav items every authenticated user sees (backoffice is manager-only, so
// deliberately excluded — the QA account's role isn't guaranteed here).
const NAV_ITEMS = ['home', 'receiving', 'production', 'spiritStock', 'bottling'];

const IGNORED_CONSOLE = /favicon|DevTools|sourcemap|manifest|Content Security Policy|violates the following/i;

function collectConsole(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  return errors;
}

async function login(page) {
  await page.fill('#login-user', EMAIL);
  await page.fill('#login-pass', PASSWORD);
  await page.click('#login-btn');
  await expect(page.locator('#login-btn')).toHaveCount(0, { timeout: 15_000 });
}

test.describe('live smoke', () => {
  test('root loads and renders (not blank)', async ({ page }) => {
    const resp = await page.goto('./', { waitUntil: 'domcontentloaded' });
    expect(resp?.status(), 'HTTP status').toBeLessThan(400);
    await expect(page).toHaveTitle(/Arava Distillery/);
    // Guards against the exact class of bug fixed in the CRM repo's #71
    // hotfix: a CSP-blocked inline reveal script leaving body hidden.
    const display = await page.evaluate(() => getComputedStyle(document.body).display);
    expect(display, 'body must be visible').not.toBe('none');
  });

  test('manifest resolves (no 404)', async ({ page }) => {
    await page.goto('./', { waitUntil: 'domcontentloaded' });
    const href = await page.getAttribute('link[rel="manifest"]', 'href');
    expect(href, 'manifest link present').toBeTruthy();
    const res = await page.request.get(new URL(href, page.url()).toString());
    expect(res.status(), `manifest ${href}`).toBe(200);
  });

  test('accessibility basics', async ({ page }) => {
    await page.goto('./', { waitUntil: 'domcontentloaded' });
    const a11y = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
    }));
    expect(a11y.lang).toBe('he');
    expect(a11y.dir).toBe('rtl');
  });

  test.describe('authenticated', () => {
    test.skip(!HAS_CREDS, 'QA_EMAIL / QA_PASSWORD not provided');

    test('logs in and shows the app shell', async ({ page }) => {
      await page.goto('./', { waitUntil: 'domcontentloaded' });
      await login(page);
      await expect(page.locator('[data-nav="home"]')).toBeVisible();
    });

    test('navigates every nav item without console errors', async ({ page }) => {
      const errors = collectConsole(page);
      await page.goto('./', { waitUntil: 'domcontentloaded' });
      await login(page);
      for (const item of NAV_ITEMS) {
        await page.click(`[data-nav="${item}"]`);
        await page.waitForTimeout(800);
      }
      const real = errors.filter((e) => !IGNORED_CONSOLE.test(e));
      expect(real, `console errors:\n${real.join('\n')}`).toEqual([]);
    });

    test('no horizontal overflow', async ({ page }) => {
      await page.goto('./', { waitUntil: 'domcontentloaded' });
      await login(page);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
      expect(overflow, 'page must not scroll horizontally').toBe(false);
    });
  });
});
