#!/usr/bin/env node
/**
 * QA Runner — Automated web app quality assurance scanner
 *
 * Usage:
 *   node tests/qa/qa-runner.js <URL> [options]
 *
 * Options:
 *   --skip-security    Skip security tests
 *   --skip-performance Skip performance tests
 *   --screenshots-dir  Directory for screenshots (default: tests/qa/screenshots)
 *   --viewport         Viewport preset: desktop|tablet|mobile (default: all)
 *   --verbose          Show detailed output for passing checks
 *
 * Examples:
 *   node tests/qa/qa-runner.js https://example.com
 *   node tests/qa/qa-runner.js https://example.com --viewport mobile
 *   node tests/qa/qa-runner.js http://localhost:8080 --verbose
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// --- Configuration ---
const TARGET_URL = process.argv[2];
const FLAGS = process.argv.slice(3);

if (!TARGET_URL) {
  console.error('Usage: node tests/qa/qa-runner.js <URL> [options]');
  console.error('Example: node tests/qa/qa-runner.js https://example.com');
  process.exit(1);
}

const SKIP_SECURITY = FLAGS.includes('--skip-security');
const SKIP_PERFORMANCE = FLAGS.includes('--skip-performance');
const VERBOSE = FLAGS.includes('--verbose');
const SCREENSHOTS_DIR = (() => {
  const idx = FLAGS.indexOf('--screenshots-dir');
  return idx >= 0 ? FLAGS[idx + 1] : 'tests/qa/screenshots';
})();
const VIEWPORT_FILTER = (() => {
  const idx = FLAGS.indexOf('--viewport');
  return idx >= 0 ? FLAGS[idx + 1] : 'all';
})();

const VIEWPORTS = {
  desktop:  { name: 'Desktop HD',     width: 1920, height: 1080 },
  laptop:   { name: 'Laptop',         width: 1280, height: 720  },
  tablet:   { name: 'Tablet Portrait', width: 768,  height: 1024 },
  mobile:   { name: 'Mobile',         width: 375,  height: 667  },
  small:    { name: 'Small Mobile',   width: 320,  height: 568  },
};

// --- Helpers ---
const bugs = [];
let bugCounter = 0;

function reportBug(severity, category, title, details) {
  bugCounter++;
  const bug = { id: `BUG-${String(bugCounter).padStart(3, '0')}`, severity, category, title, ...details };
  bugs.push(bug);
  const icon = { P0: '🔴', P1: '🟠', P2: '🟡', P3: '🔵', P4: '⚪' }[severity] || '⚫';
  console.log(`  ${icon} ${bug.id} [${severity}] ${title}`);
  if (details.detail) console.log(`     └─ ${details.detail}`);
}

function pass(msg) {
  if (VERBOSE) console.log(`  ✅ ${msg}`);
}

function info(msg) {
  console.log(`  ℹ️  ${msg}`);
}

function heading(text) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${text}`);
  console.log(`${'═'.repeat(60)}`);
}

function subheading(text) {
  console.log(`\n  ── ${text} ──`);
}

// --- Main ---
(async () => {
  console.log(`\nQA Runner — Scanning: ${TARGET_URL}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Options: security=${!SKIP_SECURITY}, performance=${!SKIP_PERFORMANCE}, viewports=${VIEWPORT_FILTER}`);

  // Ensure screenshots directory
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORTS.desktop,
    userAgent: 'QA-Runner/1.0 Playwright',
  });
  const page = await context.newPage();

  // Collect console messages and errors
  const consoleMessages = [];
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => pageErrors.push(err.message));
  page.on('requestfailed', req => {
    failedRequests.push({ url: req.url(), failure: req.failure()?.errorText });
  });

  // =========================================================
  // PHASE 1: SMOKE TESTS
  // =========================================================
  heading('Phase 1: Smoke Tests');

  let response;
  try {
    response = await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (err) {
    reportBug('P0', 'Smoke', 'Page failed to load', {
      detail: err.message,
    });
    await browser.close();
    printSummary();
    process.exit(1);
  }

  // HTTP status
  const status = response.status();
  if (status >= 400) {
    reportBug('P0', 'Smoke', `Page returned HTTP ${status}`, {
      detail: `Expected 200, got ${status}`,
    });
  } else {
    pass(`HTTP status: ${status}`);
  }

  // Page title
  const title = await page.title();
  if (!title || title === 'Untitled' || title.trim() === '') {
    reportBug('P3', 'Smoke', 'Page has no meaningful title', {
      detail: `Title: "${title || '(empty)'}"`,
    });
  } else {
    pass(`Title: "${title}"`);
  }

  // Body content
  const bodyText = await page.textContent('body').catch(() => '');
  if (!bodyText || bodyText.trim().length < 10) {
    reportBug('P1', 'Smoke', 'Page body is empty or minimal', {
      detail: `Body text length: ${bodyText?.trim().length || 0} chars`,
    });
  } else {
    pass(`Body has ${bodyText.trim().length} chars of content`);
  }

  // Console errors on load
  if (consoleErrors.length > 0) {
    reportBug('P2', 'Smoke', `${consoleErrors.length} console error(s) on page load`, {
      detail: consoleErrors.slice(0, 3).join(' | '),
    });
  } else {
    pass('No console errors on load');
  }

  // Page errors (uncaught exceptions)
  if (pageErrors.length > 0) {
    reportBug('P1', 'Smoke', `${pageErrors.length} uncaught JavaScript exception(s)`, {
      detail: pageErrors.slice(0, 3).join(' | '),
    });
  } else {
    pass('No uncaught exceptions');
  }

  // Failed network requests
  if (failedRequests.length > 0) {
    reportBug('P2', 'Smoke', `${failedRequests.length} failed network request(s)`, {
      detail: failedRequests.slice(0, 3).map(r => r.url).join(' | '),
    });
  } else {
    pass('All network requests succeeded');
  }

  // Baseline screenshot
  await page.screenshot({ fullPage: true, path: path.join(SCREENSHOTS_DIR, 'smoke-baseline.png') });
  pass('Baseline screenshot captured');

  // =========================================================
  // PHASE 2: FUNCTIONAL TESTS
  // =========================================================
  heading('Phase 2: Functional Tests');

  // Check for dead links
  subheading('Links');
  const links = await page.$$eval('a[href]', anchors =>
    anchors.map(a => ({ href: a.href, text: a.textContent.trim().substring(0, 50) }))
  );
  info(`Found ${links.length} links`);

  let deadLinks = 0;
  for (const link of links.slice(0, 30)) { // Check first 30 links to avoid timeout
    if (link.href.startsWith('javascript:') || link.href.startsWith('mailto:') || link.href === '#') continue;
    try {
      const linkPage = await context.newPage();
      const resp = await linkPage.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 10000 });
      if (resp && resp.status() >= 400) {
        deadLinks++;
        reportBug('P2', 'Functional', `Dead link: ${link.text || '(no text)'}`, {
          detail: `${link.href} returned ${resp.status()}`,
        });
      }
      await linkPage.close();
    } catch {
      // Skip links that timeout or fail to navigate (external, etc.)
    }
  }
  if (deadLinks === 0) pass('No dead links found (checked first 30)');

  // Check buttons
  subheading('Buttons');
  const buttonCount = await page.$$eval('button, [role="button"], input[type="submit"]', els => els.length);
  info(`Found ${buttonCount} button(s)`);

  // Check forms
  subheading('Forms');
  const formCount = await page.$$eval('form', forms => forms.length);
  const inputCount = await page.$$eval('input, select, textarea', inputs => inputs.length);
  info(`Found ${formCount} form(s), ${inputCount} input(s)`);

  // Check inputs without labels
  const unlabeledInputs = await page.$$eval('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea', inputs => {
    return inputs.filter(input => {
      const id = input.id;
      const ariaLabel = input.getAttribute('aria-label');
      const ariaLabelledby = input.getAttribute('aria-labelledby');
      const placeholder = input.getAttribute('placeholder');
      const hasLabel = id && document.querySelector(`label[for="${id}"]`);
      const wrappedInLabel = input.closest('label');
      return !hasLabel && !wrappedInLabel && !ariaLabel && !ariaLabelledby;
    }).map(input => ({
      tag: input.tagName.toLowerCase(),
      type: input.type || '',
      id: input.id || '',
      name: input.name || '',
      placeholder: input.placeholder || '',
    }));
  });

  if (unlabeledInputs.length > 0) {
    reportBug('P2', 'Accessibility', `${unlabeledInputs.length} input(s) without labels`, {
      detail: unlabeledInputs.slice(0, 5).map(i => `${i.tag}[type=${i.type}]#${i.id || i.name || '?'}`).join(', '),
    });
  } else {
    pass('All visible inputs have labels or aria-labels');
  }

  // =========================================================
  // PHASE 3: UI/UX — RESPONSIVE TESTING
  // =========================================================
  heading('Phase 3: UI/UX — Responsive Testing');

  const viewportsToTest = VIEWPORT_FILTER === 'all'
    ? Object.values(VIEWPORTS)
    : [VIEWPORTS[VIEWPORT_FILTER] || VIEWPORTS.desktop];

  for (const vp of viewportsToTest) {
    subheading(`${vp.name} (${vp.width}x${vp.height})`);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(500); // Let layout settle

    // Check horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    if (hasHorizontalScroll) {
      const overflowAmount = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      reportBug('P2', 'UI/UX', `Horizontal overflow on ${vp.name}`, {
        detail: `Page overflows by ${overflowAmount}px at ${vp.width}px viewport`,
      });
    } else {
      pass(`No horizontal overflow at ${vp.width}px`);
    }

    // Check for overlapping text (basic heuristic: elements with negative margins or absolute positioning)
    const overflowingElements = await page.evaluate(() => {
      const problems = [];
      const els = document.querySelectorAll('*');
      for (const el of els) {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (rect.right > window.innerWidth + 5 && style.position !== 'fixed' && style.display !== 'none' && style.visibility !== 'hidden') {
          if (el.textContent.trim().length > 0) {
            problems.push({
              tag: el.tagName.toLowerCase(),
              class: el.className?.toString().substring(0, 40) || '',
              overflow: Math.round(rect.right - window.innerWidth),
            });
          }
        }
      }
      return problems.slice(0, 5);
    });

    if (overflowingElements.length > 0) {
      for (const el of overflowingElements) {
        reportBug('P3', 'UI/UX', `Element overflows viewport on ${vp.name}`, {
          detail: `<${el.tag} class="${el.class}"> extends ${el.overflow}px beyond viewport`,
        });
      }
    }

    // Screenshot at this viewport
    const safeName = vp.name.replace(/\s+/g, '-').toLowerCase();
    await page.screenshot({ fullPage: true, path: path.join(SCREENSHOTS_DIR, `viewport-${safeName}.png`) });
    pass(`Screenshot saved: viewport-${safeName}.png`);
  }

  // Reset to desktop
  await page.setViewportSize(VIEWPORTS.desktop);

  // =========================================================
  // PHASE 4: ACCESSIBILITY
  // =========================================================
  heading('Phase 4: Accessibility');

  // Images without alt text
  subheading('Images');
  const imagesWithoutAlt = await page.$$eval('img', imgs =>
    imgs.filter(img => !img.getAttribute('alt') && img.getAttribute('alt') !== '')
      .map(img => img.src?.substring(0, 80) || '(no src)')
  );
  if (imagesWithoutAlt.length > 0) {
    reportBug('P2', 'Accessibility', `${imagesWithoutAlt.length} image(s) missing alt text`, {
      detail: imagesWithoutAlt.slice(0, 5).join(', '),
    });
  } else {
    const totalImages = await page.$$eval('img', imgs => imgs.length);
    pass(`All ${totalImages} images have alt text`);
  }

  // Heading hierarchy
  subheading('Heading Hierarchy');
  const headings = await page.$$eval('h1, h2, h3, h4, h5, h6', els =>
    els.map(el => ({ level: parseInt(el.tagName[1]), text: el.textContent.trim().substring(0, 50) }))
  );

  if (headings.length === 0) {
    reportBug('P3', 'Accessibility', 'No headings found on page', {
      detail: 'Pages should have at least one heading for screen readers',
    });
  } else {
    // Check for skipped heading levels
    let prevLevel = 0;
    for (const h of headings) {
      if (h.level > prevLevel + 1 && prevLevel > 0) {
        reportBug('P3', 'Accessibility', `Heading level skipped: h${prevLevel} → h${h.level}`, {
          detail: `"${h.text}" — headings should not skip levels`,
        });
        break;
      }
      prevLevel = h.level;
    }
    pass(`Found ${headings.length} headings`);
  }

  // Landmark regions
  subheading('Landmarks');
  const landmarks = await page.evaluate(() => {
    const roles = ['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'search'];
    const found = {};
    for (const role of roles) {
      const byRole = document.querySelectorAll(`[role="${role}"]`).length;
      const byTag = {
        banner: 'header', navigation: 'nav', main: 'main',
        contentinfo: 'footer', complementary: 'aside', search: ''
      };
      const byTagCount = byTag[role] ? document.querySelectorAll(byTag[role]).length : 0;
      found[role] = byRole + byTagCount;
    }
    return found;
  });

  if (!landmarks.main && !landmarks.navigation) {
    reportBug('P3', 'Accessibility', 'No landmark regions found', {
      detail: 'Add <main>, <nav>, <header>, <footer> for screen reader navigation',
    });
  } else {
    pass(`Landmarks: ${Object.entries(landmarks).filter(([,v]) => v > 0).map(([k,v]) => `${k}(${v})`).join(', ')}`);
  }

  // Touch target size
  subheading('Touch Targets');
  const smallTargets = await page.evaluate(() => {
    const interactiveElements = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [tabindex]');
    const small = [];
    for (const el of interactiveElements) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)) {
        const style = getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          small.push({
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || el.value || '').trim().substring(0, 30),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      }
    }
    return small;
  });

  if (smallTargets.length > 0) {
    reportBug('P4', 'Accessibility', `${smallTargets.length} touch target(s) smaller than 44x44px`, {
      detail: smallTargets.slice(0, 5).map(t => `<${t.tag}> "${t.text}" (${t.width}x${t.height})`).join(', '),
    });
  } else {
    pass('All touch targets are >= 44x44px');
  }

  // Color contrast (basic check: find very light text on white or very dark text on dark)
  subheading('Contrast (heuristic)');
  const lowContrastCount = await page.evaluate(() => {
    let count = 0;
    const textElements = document.querySelectorAll('p, span, a, li, td, th, h1, h2, h3, h4, h5, h6, label, button, div');
    for (const el of Array.from(textElements).slice(0, 200)) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (!el.textContent.trim()) continue;
      const color = style.color;
      const bg = style.backgroundColor;
      // Very rough check: if color and bg are both very similar
      if (color === bg && color !== 'rgba(0, 0, 0, 0)') count++;
    }
    return count;
  });

  if (lowContrastCount > 0) {
    reportBug('P2', 'Accessibility', `${lowContrastCount} element(s) with potentially zero contrast`, {
      detail: 'Text color matches background color exactly',
    });
  } else {
    pass('No obvious zero-contrast text found');
  }

  // =========================================================
  // PHASE 5: SECURITY
  // =========================================================
  if (!SKIP_SECURITY) {
    heading('Phase 5: Security');

    // Check localStorage for sensitive data
    subheading('Local Storage');
    const storageData = await page.evaluate(() => {
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        data[key] = localStorage.getItem(key);
      }
      return data;
    });

    const sensitivePatterns = [
      { pattern: /api[_-]?key/i, label: 'API key' },
      { pattern: /secret/i, label: 'Secret' },
      { pattern: /private[_-]?key/i, label: 'Private key' },
      { pattern: /credential/i, label: 'Credential' },
      { pattern: /^(sk|pk)[-_]/i, label: 'API key prefix' },
    ];

    for (const [key, value] of Object.entries(storageData)) {
      for (const { pattern, label } of sensitivePatterns) {
        if (pattern.test(key) || (value && pattern.test(value))) {
          reportBug('P1', 'Security', `Potential ${label} found in localStorage`, {
            detail: `Key: "${key}"`,
          });
        }
      }
    }
    pass(`Scanned ${Object.keys(storageData).length} localStorage entries`);

    // Check for inline event handlers (XSS vectors)
    subheading('Inline Scripts');
    const inlineHandlers = await page.$$eval('*', els => {
      const handlers = ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus', 'onblur', 'onsubmit'];
      let count = 0;
      for (const el of els) {
        for (const h of handlers) {
          if (el.getAttribute(h)) count++;
        }
      }
      return count;
    });

    if (inlineHandlers > 10) {
      reportBug('P3', 'Security', `${inlineHandlers} inline event handlers found`, {
        detail: 'Inline handlers are potential XSS vectors. Prefer addEventListener.',
      });
    } else {
      pass(`${inlineHandlers} inline event handler(s) (acceptable)`);
    }

    // Check for password fields not in forms or exposed
    subheading('Password Fields');
    const passwordFields = await page.$$eval('input[type="password"]', inputs =>
      inputs.map(i => ({
        autocomplete: i.getAttribute('autocomplete'),
        inForm: !!i.closest('form'),
        id: i.id || '(none)',
      }))
    );

    for (const pf of passwordFields) {
      if (!pf.inForm) {
        reportBug('P3', 'Security', 'Password field outside a <form> element', {
          detail: `Input#${pf.id} — password managers may not detect it`,
        });
      }
    }
    if (passwordFields.length > 0) pass(`${passwordFields.length} password field(s) checked`);

    // Check meta tags for sensitive info
    subheading('Meta Tags');
    const metaTags = await page.$$eval('meta', metas =>
      metas.map(m => ({ name: m.name, content: m.content?.substring(0, 100) }))
    );
    for (const meta of metaTags) {
      for (const { pattern, label } of sensitivePatterns) {
        if (pattern.test(meta.content || '')) {
          reportBug('P1', 'Security', `Potential ${label} in meta tag`, {
            detail: `<meta name="${meta.name}">`,
          });
        }
      }
    }
    pass(`Scanned ${metaTags.length} meta tags`);

    // Check for mixed content on HTTPS
    if (TARGET_URL.startsWith('https://')) {
      subheading('Mixed Content');
      const httpResources = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource');
        return resources.filter(r => r.name.startsWith('http://') && !r.name.startsWith('http://localhost'))
          .map(r => r.name.substring(0, 100));
      });

      if (httpResources.length > 0) {
        reportBug('P2', 'Security', `${httpResources.length} mixed content resource(s)`, {
          detail: httpResources.slice(0, 3).join(', '),
        });
      } else {
        pass('No mixed content detected');
      }
    }
  }

  // =========================================================
  // PHASE 6: PERFORMANCE
  // =========================================================
  if (!SKIP_PERFORMANCE) {
    heading('Phase 6: Performance');

    // Navigation timing
    subheading('Load Times');
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      if (!nav) return null;
      return {
        ttfb: Math.round(nav.responseStart - nav.requestStart),
        domLoad: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
        fullLoad: Math.round(nav.loadEventEnd - nav.startTime),
        domInteractive: Math.round(nav.domInteractive - nav.startTime),
      };
    });

    if (timing) {
      info(`TTFB: ${timing.ttfb}ms | DOM Loaded: ${timing.domLoad}ms | Full Load: ${timing.fullLoad}ms`);
      if (timing.fullLoad > 5000) {
        reportBug('P2', 'Performance', `Slow page load: ${timing.fullLoad}ms`, {
          detail: `Full load took ${timing.fullLoad}ms (target: <3000ms)`,
        });
      } else {
        pass(`Page loaded in ${timing.fullLoad}ms`);
      }
    }

    // Resource count and sizes
    subheading('Resources');
    const resources = await page.evaluate(() => {
      const entries = performance.getEntriesByType('resource');
      const summary = {};
      let totalSize = 0;
      for (const entry of entries) {
        const ext = entry.name.split('.').pop()?.split('?')[0]?.toLowerCase() || 'other';
        const type = { js: 'JavaScript', css: 'CSS', png: 'Image', jpg: 'Image', jpeg: 'Image',
          gif: 'Image', svg: 'Image', webp: 'Image', woff: 'Font', woff2: 'Font', ttf: 'Font' }[ext] || 'Other';
        if (!summary[type]) summary[type] = { count: 0, size: 0 };
        summary[type].count++;
        summary[type].size += entry.transferSize || 0;
        totalSize += entry.transferSize || 0;
      }
      return { summary, totalSize, totalCount: entries.length };
    });

    info(`Total: ${resources.totalCount} resources, ${Math.round(resources.totalSize / 1024)}KB transferred`);
    for (const [type, data] of Object.entries(resources.summary)) {
      info(`  ${type}: ${data.count} files, ${Math.round(data.size / 1024)}KB`);
    }

    if (resources.totalSize > 3 * 1024 * 1024) {
      reportBug('P2', 'Performance', `Page total weight: ${Math.round(resources.totalSize / 1024)}KB`, {
        detail: `Total transferred: ${Math.round(resources.totalSize / 1024)}KB (target: <3MB)`,
      });
    } else {
      pass(`Total page weight: ${Math.round(resources.totalSize / 1024)}KB`);
    }

    // Web Vitals (LCP, CLS)
    subheading('Web Vitals');
    const vitals = await page.evaluate(() => {
      return new Promise(resolve => {
        const data = { lcp: null, cls: 0 };

        try {
          new PerformanceObserver(list => {
            const entries = list.getEntries();
            if (entries.length > 0) data.lcp = Math.round(entries[entries.length - 1].startTime);
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        } catch { /* LCP not supported */ }

        try {
          new PerformanceObserver(list => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) data.cls += entry.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });
        } catch { /* CLS not supported */ }

        setTimeout(() => {
          data.cls = Math.round(data.cls * 1000) / 1000;
          resolve(data);
        }, 3000);
      });
    });

    if (vitals.lcp !== null) {
      info(`LCP: ${vitals.lcp}ms`);
      if (vitals.lcp > 2500) {
        reportBug('P2', 'Performance', `Slow LCP: ${vitals.lcp}ms`, {
          detail: `LCP should be under 2500ms (got ${vitals.lcp}ms)`,
        });
      } else {
        pass(`LCP: ${vitals.lcp}ms (good)`);
      }
    }

    info(`CLS: ${vitals.cls}`);
    if (vitals.cls > 0.1) {
      reportBug('P2', 'Performance', `High CLS: ${vitals.cls}`, {
        detail: `CLS should be under 0.1 (got ${vitals.cls})`,
      });
    } else {
      pass(`CLS: ${vitals.cls} (good)`);
    }
  }

  // =========================================================
  // PHASE 7: EDGE CASES
  // =========================================================
  heading('Phase 7: Edge Cases');

  // Check for console errors after basic interactions
  subheading('Post-Interaction Errors');
  const preInteractionErrors = consoleErrors.length;

  // Click first 5 visible buttons
  const visibleButtons = await page.$$('button:visible, [role="button"]:visible');
  for (const btn of visibleButtons.slice(0, 5)) {
    try {
      await btn.click({ timeout: 2000 });
      await page.waitForTimeout(300);
    } catch {
      // Some buttons may trigger navigation or modals — that's fine
    }
  }

  const postInteractionErrors = consoleErrors.length - preInteractionErrors;
  if (postInteractionErrors > 0) {
    reportBug('P2', 'Edge Case', `${postInteractionErrors} new console error(s) after clicking buttons`, {
      detail: consoleErrors.slice(preInteractionErrors, preInteractionErrors + 3).join(' | '),
    });
  } else {
    pass('No new errors after button interactions');
  }

  // Check browser zoom
  subheading('Browser Zoom');
  for (const zoom of [50, 150, 200]) {
    await page.evaluate(z => { document.body.style.zoom = `${z}%`; }, zoom);
    await page.waitForTimeout(300);
    const overflows = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    if (overflows) {
      reportBug('P3', 'Edge Case', `Horizontal overflow at ${zoom}% zoom`, {
        detail: `Page overflows when browser zoom is ${zoom}%`,
      });
    } else {
      pass(`No overflow at ${zoom}% zoom`);
    }
  }
  await page.evaluate(() => { document.body.style.zoom = '100%'; });

  // =========================================================
  // DONE — SUMMARY
  // =========================================================
  await browser.close();
  printSummary();
})();

function printSummary() {
  heading('QA SUMMARY');

  if (bugs.length === 0) {
    console.log('\n  No bugs found! The application passed all automated checks.\n');
    return;
  }

  // Count by severity
  const bySeverity = {};
  const byCategory = {};
  for (const bug of bugs) {
    bySeverity[bug.severity] = (bySeverity[bug.severity] || 0) + 1;
    byCategory[bug.category] = (byCategory[bug.category] || 0) + 1;
  }

  console.log(`\n  Total bugs found: ${bugs.length}`);
  console.log('');
  console.log('  By Severity:');
  for (const [sev, count] of Object.entries(bySeverity).sort()) {
    const label = { P0: 'Blocker', P1: 'Critical', P2: 'Major', P3: 'Minor', P4: 'Enhancement' }[sev] || sev;
    console.log(`    ${sev} (${label}): ${count}`);
  }
  console.log('');
  console.log('  By Category:');
  for (const [cat, count] of Object.entries(byCategory).sort()) {
    console.log(`    ${cat}: ${count}`);
  }

  console.log('\n  All bugs:');
  for (const bug of bugs) {
    const icon = { P0: '🔴', P1: '🟠', P2: '🟡', P3: '🔵', P4: '⚪' }[bug.severity] || '⚫';
    console.log(`    ${icon} ${bug.id} [${bug.severity}/${bug.category}] ${bug.title}`);
  }

  console.log(`\n  Screenshots saved to: ${SCREENSHOTS_DIR}/`);
  console.log('');
}
