/**
 * UI/UX & Accessibility QA Test Script
 * Arava Distillery — Factory Control
 *
 * Phase 3: UI/UX Tests (viewport screenshots, horizontal scroll, overflow, overlap)
 * Phase 4: Accessibility Tests (alt text, labels, headings, focus, contrast, ARIA, touch targets, aria-live)
 *
 * Run: node /home/user/Aravadistillery-Factory-Control/tests/qa/uiux-a11y.js
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const TARGET_URL = 'https://guymaich-jpg.github.io/Aravadistillery-Factory-Control/';
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

// ── Helpers ──────────────────────────────────────────────
const PASS = '\x1b[32mPASS\x1b[0m';
const FAIL = '\x1b[31mFAIL\x1b[0m';
const WARN = '\x1b[33mWARN\x1b[0m';
const INFO = '\x1b[36mINFO\x1b[0m';

let totalTests = 0;
let passed = 0;
let failed = 0;
let warnings = 0;

function logResult(status, testName, detail = '') {
  totalTests++;
  const detailStr = detail ? ` — ${detail}` : '';
  if (status === 'pass') {
    passed++;
    console.log(`  [${PASS}] ${testName}${detailStr}`);
  } else if (status === 'fail') {
    failed++;
    console.log(`  [${FAIL}] ${testName}${detailStr}`);
  } else if (status === 'warn') {
    warnings++;
    console.log(`  [${WARN}] ${testName}${detailStr}`);
  } else {
    console.log(`  [${INFO}] ${testName}${detailStr}`);
  }
}

function logSection(title) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

// ── Viewports ────────────────────────────────────────────
const VIEWPORTS = [
  { name: 'desktop-hd',       width: 1920, height: 1080 },
  { name: 'laptop',           width: 1280, height: 720 },
  { name: 'tablet-portrait',  width: 768,  height: 1024 },
  { name: 'mobile',           width: 375,  height: 667 },
  { name: 'small-mobile',     width: 320,  height: 568 },
];

/**
 * Navigate to the page reliably. We use 'commit' waitUntil (available in
 * modern Playwright) so we don't block on slow external resources (Google
 * Fonts, Firebase, etc.), and then manually wait for JS to render the DOM.
 */
async function loadPage(page, timeout = 60000) {
  try {
    await page.goto(TARGET_URL, { waitUntil: 'commit', timeout });
  } catch (err) {
    // If 'commit' isn't supported, fall back to load
    await page.goto(TARGET_URL, { timeout });
  }
  // Let JS render (the app is SPA-style, builds DOM in script.js)
  await page.waitForTimeout(4000);
}

(async () => {
  console.log('\n' + '#'.repeat(70));
  console.log('#  UI/UX & Accessibility QA Report');
  console.log('#  Arava Distillery — Factory Control');
  console.log('#  URL: ' + TARGET_URL);
  console.log('#  Date: ' + new Date().toISOString());
  console.log('#'.repeat(70));

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',          // bypass CSP for testing
      '--disable-features=IsolateOrigins',
    ],
  });

  // ================================================================
  // PHASE 3: UI/UX TESTS
  // ================================================================
  logSection('PHASE 3: UI/UX TESTS');

  // ── 3.1 Viewport Screenshots & Responsive Checks ──────────────
  logSection('3.1 — Viewport Screenshots & Responsive Checks');

  for (const vp of VIEWPORTS) {
    console.log(`\n  --- Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      bypassCSP: true,
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    try {
      await loadPage(page);
    } catch (err) {
      logResult('fail', `Page load at ${vp.name}`, String(err.message).substring(0, 120));
      await context.close();
      continue;
    }

    // Take full-page screenshot
    const ssPath = path.join(SCREENSHOTS_DIR, `viewport-${vp.name}.png`);
    try {
      await page.screenshot({ path: ssPath, fullPage: true, timeout: 15000 });
      logResult('pass', `Screenshot saved`, ssPath);
    } catch (_err) {
      try {
        await page.screenshot({ path: ssPath, fullPage: false, timeout: 10000 });
        logResult('pass', `Screenshot saved (viewport-only fallback)`, ssPath);
      } catch (err2) {
        logResult('fail', `Screenshot failed`, String(err2.message).substring(0, 100));
      }
    }

    // ── 3.2a Horizontal scrollbar check ──
    try {
      const scrollInfo = await page.evaluate(() => {
        const sw = document.documentElement.scrollWidth;
        const cw = document.documentElement.clientWidth;
        return { sw, cw, hasHScroll: sw > cw };
      });
      if (scrollInfo.hasHScroll) {
        logResult('fail', `Horizontal scrollbar detected`,
          `scrollWidth(${scrollInfo.sw}) > clientWidth(${scrollInfo.cw}) by ${scrollInfo.sw - scrollInfo.cw}px`);
      } else {
        logResult('pass', `No horizontal scrollbar`);
      }
    } catch (e) {
      logResult('warn', 'Could not check horizontal scroll', String(e.message).substring(0, 60));
    }

    // ── 3.2b Text overflow / clipping detection ──
    try {
      const overflowIssues = await page.evaluate(() => {
        const issues = [];
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (!el.offsetParent && el.tagName !== 'HTML' && el.tagName !== 'BODY') continue;
          const style = window.getComputedStyle(el);
          if (el.scrollWidth > el.clientWidth + 2 && style.overflow !== 'hidden' &&
              style.overflow !== 'auto' && style.overflow !== 'scroll' &&
              style.overflowX !== 'hidden' && style.overflowX !== 'auto' &&
              style.overflowX !== 'scroll' && style.textOverflow !== 'ellipsis') {
            const tag = el.tagName.toLowerCase();
            const cls = el.className ? `.${String(el.className).split(' ').join('.')}` : '';
            const id = el.id ? `#${el.id}` : '';
            if (el.scrollWidth - el.clientWidth > 5) {
              issues.push({
                selector: `${tag}${id}${cls}`.substring(0, 120),
                overflow: el.scrollWidth - el.clientWidth,
                text: (el.textContent || '').substring(0, 60),
              });
            }
          }
        }
        return issues.slice(0, 10);
      });

      if (overflowIssues.length > 0) {
        logResult('warn', `Text overflow detected (${overflowIssues.length} elements)`);
        for (const issue of overflowIssues) {
          console.log(`         -> ${issue.selector} — overflow by ${issue.overflow}px — text: "${issue.text}"`);
        }
      } else {
        logResult('pass', `No text overflow/clipping detected`);
      }
    } catch (e) {
      logResult('warn', 'Could not check text overflow', String(e.message).substring(0, 60));
    }

    // ── 3.2c Overlapping elements check ──
    try {
      const overlaps = await page.evaluate(() => {
        const interactiveElements = document.querySelectorAll('button, a, input, select, textarea, [role="button"]');
        const rects = [];
        for (const el of interactiveElements) {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          rects.push({
            selector: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className ? '.' + String(el.className).split(' ')[0] : ''}`,
            top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right,
            text: (el.textContent || el.getAttribute('aria-label') || '').substring(0, 40),
          });
        }
        const overlapping = [];
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i], b = rects[j];
            if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) {
              const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              const overlapArea = overlapX * overlapY;
              if (overlapArea > 100) {
                overlapping.push({
                  el1: a.selector + ` ("${a.text}")`,
                  el2: b.selector + ` ("${b.text}")`,
                  area: Math.round(overlapArea),
                });
              }
            }
          }
        }
        return overlapping.slice(0, 8);
      });

      if (overlaps.length > 0) {
        logResult('warn', `Overlapping interactive elements (${overlaps.length} pairs)`);
        for (const o of overlaps) {
          console.log(`         -> ${o.el1} overlaps with ${o.el2} — area: ${o.area}px^2`);
        }
      } else {
        logResult('pass', `No overlapping interactive elements`);
      }
    } catch (e) {
      logResult('warn', 'Could not check element overlaps', String(e.message).substring(0, 60));
    }

    await context.close();
  }

  // ================================================================
  // PHASE 4: ACCESSIBILITY TESTS
  // ================================================================
  logSection('PHASE 4: ACCESSIBILITY TESTS');

  const a11yContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    bypassCSP: true,
    ignoreHTTPSErrors: true,
  });
  const page = await a11yContext.newPage();

  let a11yPageLoaded = false;
  try {
    await loadPage(page, 60000);
    a11yPageLoaded = true;
  } catch (err) {
    console.log(`  WARNING: Page load for a11y tests encountered error: ${String(err.message).substring(0, 120)}`);
    console.log(`  Will attempt a11y checks on whatever DOM is available...`);
    a11yPageLoaded = true; // still try — the DOM may be partially there
  }

  // ── 4.1 Images Alt Text ────────────────────────────────────────
  logSection('4.1 — Images Alt Text');

  try {
    const imageResults = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      const results = [];
      for (const img of images) {
        results.push({
          src: (img.src || '').substring(0, 80),
          alt: img.getAttribute('alt'),
          hasAlt: img.hasAttribute('alt'),
          altEmpty: img.getAttribute('alt') === '',
          role: img.getAttribute('role'),
          ariaHidden: img.getAttribute('aria-hidden'),
        });
      }
      return results;
    });

    if (imageResults.length === 0) {
      logResult('pass', 'No <img> elements found (app uses SVG icons/CSS backgrounds)');
    } else {
      let imgIssues = 0;
      for (const img of imageResults) {
        if (!img.hasAlt && img.role !== 'presentation' && img.ariaHidden !== 'true') {
          logResult('fail', `Image missing alt attribute`, img.src);
          imgIssues++;
        } else if (img.hasAlt && !img.altEmpty) {
          logResult('pass', `Image has alt text`, `alt="${img.alt}"`);
        } else if (img.altEmpty) {
          logResult('pass', `Decorative image (alt="")`, img.src);
        }
      }
      if (imgIssues === 0 && imageResults.length > 0) {
        logResult('pass', `All ${imageResults.length} images have appropriate alt attributes`);
      }
    }
  } catch (e) {
    logResult('warn', 'Could not check images', String(e.message).substring(0, 60));
  }

  // SVG accessibility check
  try {
    const svgResults = await page.evaluate(() => {
      const svgs = document.querySelectorAll('svg');
      let withTitle = 0, withAriaLabel = 0, withAriaHidden = 0, noA11y = 0;
      const issues = [];
      for (const svg of svgs) {
        const hasTitle = svg.querySelector('title') !== null;
        const hasAL = svg.hasAttribute('aria-label');
        const hasAH = svg.getAttribute('aria-hidden') === 'true';
        if (hasTitle) withTitle++;
        if (hasAL) withAriaLabel++;
        if (hasAH) withAriaHidden++;
        if (!hasTitle && !hasAL && !hasAH) {
          noA11y++;
          const p = svg.parentElement;
          issues.push(p ? `${p.tagName.toLowerCase()}${p.className ? '.' + String(p.className).split(' ')[0] : ''}` : 'root');
        }
      }
      return { total: svgs.length, withTitle, withAriaLabel, withAriaHidden, noA11y, issues: issues.slice(0, 10) };
    });

    console.log(`\n  SVG icon accessibility summary:`);
    console.log(`    Total SVGs: ${svgResults.total}`);
    console.log(`    With <title>: ${svgResults.withTitle}`);
    console.log(`    With aria-label: ${svgResults.withAriaLabel}`);
    console.log(`    With aria-hidden="true": ${svgResults.withAriaHidden}`);
    console.log(`    No accessibility attributes: ${svgResults.noA11y}`);

    if (svgResults.noA11y > 0) {
      logResult('warn', `${svgResults.noA11y} SVG icons lack aria-hidden="true" or accessible label`);
      for (const issue of svgResults.issues) {
        console.log(`         -> Parent: ${issue}`);
      }
    } else if (svgResults.total > 0) {
      logResult('pass', `All ${svgResults.total} SVGs have accessibility attributes`);
    } else {
      logResult('pass', 'No SVG elements in current view');
    }
  } catch (e) {
    logResult('warn', 'Could not check SVGs', String(e.message).substring(0, 60));
  }

  // ── 4.2 Form Inputs & Labels ───────────────────────────────────
  logSection('4.2 — Form Inputs & Labels');

  try {
    const formResults = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input, select, textarea');
      const results = [];
      for (const input of inputs) {
        const id = input.id;
        const type = input.type || input.tagName.toLowerCase();
        const ariaLabel = input.getAttribute('aria-label');
        const ariaLabelledBy = input.getAttribute('aria-labelledby');
        const placeholder = input.getAttribute('placeholder');
        const title = input.getAttribute('title');
        let hasAssociatedLabel = false;
        if (id) hasAssociatedLabel = !!document.querySelector(`label[for="${id}"]`);
        if (!hasAssociatedLabel) hasAssociatedLabel = !!input.closest('label');

        const isHidden = input.type === 'hidden' ||
                          window.getComputedStyle(input).display === 'none' ||
                          input.offsetParent === null;

        results.push({
          tag: input.tagName.toLowerCase(), type,
          id: id || '(none)', name: input.name || '(none)',
          hasLabel: hasAssociatedLabel,
          ariaLabel: ariaLabel || null, ariaLabelledBy: ariaLabelledBy || null,
          placeholder: placeholder || null, title: title || null,
          isHidden,
          isLabelled: hasAssociatedLabel || !!ariaLabel || !!ariaLabelledBy || !!title,
        });
      }
      return results;
    });

    if (formResults.length === 0) {
      logResult('pass', 'No form inputs found in current view (login screen is JS-rendered)');
    } else {
      let unlabelled = 0;
      for (const input of formResults) {
        if (input.isHidden) continue;
        if (input.isLabelled) {
          const labelType = input.hasLabel ? 'label[for]' :
                            input.ariaLabel ? 'aria-label' :
                            input.ariaLabelledBy ? 'aria-labelledby' :
                            input.title ? 'title' : 'unknown';
          logResult('pass', `${input.tag}[type=${input.type}] id="${input.id}"`, `labelled via ${labelType}`);
        } else {
          unlabelled++;
          const hint = input.placeholder ? ` (has placeholder="${input.placeholder}" but no label)` : '';
          logResult('fail', `${input.tag}[type=${input.type}] id="${input.id}" — NO accessible label${hint}`);
        }
      }
      if (unlabelled > 0) {
        console.log(`\n  NOTE: ${unlabelled} form input(s) lack proper accessible labels.`);
        console.log(`        Placeholder text alone is NOT a valid accessible label per WCAG 2.1.`);
      }
    }
  } catch (e) {
    logResult('warn', 'Could not check form labels', String(e.message).substring(0, 60));
  }

  // ── 4.3 Heading Hierarchy ──────────────────────────────────────
  logSection('4.3 — Heading Hierarchy');

  try {
    const headingResults = await page.evaluate(() => {
      const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const list = [];
      for (const h of headings) {
        list.push({
          tag: h.tagName,
          level: parseInt(h.tagName.charAt(1)),
          text: h.textContent.trim().substring(0, 60),
          visible: h.offsetParent !== null || window.getComputedStyle(h).position === 'fixed',
        });
      }
      return list;
    });

    if (headingResults.length === 0) {
      logResult('warn', 'No heading elements found in current view (SPA login screen has no headings in DOM)');
    } else {
      console.log(`\n  Heading hierarchy:`);
      let prevLevel = 0;
      let hierarchyBroken = false;
      let hasH1 = false;

      for (const h of headingResults) {
        const indent = '  '.repeat(h.level);
        const vis = h.visible ? '' : ' [hidden]';
        console.log(`    ${indent}${h.tag}: "${h.text}"${vis}`);
        if (h.level === 1) hasH1 = true;
        if (prevLevel > 0 && h.level > prevLevel + 1) {
          logResult('fail', `Heading level skipped: ${h.tag} after h${prevLevel}`, `"${h.text}"`);
          hierarchyBroken = true;
        }
        prevLevel = h.level;
      }

      if (!hasH1) {
        logResult('warn', 'No <h1> element found in the page');
      } else {
        logResult('pass', 'Page has an <h1> element');
      }

      if (!hierarchyBroken) {
        logResult('pass', 'Heading hierarchy — no skipped levels');
      }

      const h1Count = headingResults.filter(h => h.level === 1).length;
      if (h1Count > 1) {
        logResult('warn', `Multiple <h1> elements found (${h1Count})`, 'Best practice is a single h1');
      }
    }
  } catch (e) {
    logResult('warn', 'Could not check headings', String(e.message).substring(0, 60));
  }

  // ── 4.4 Focus Visibility (Tab Navigation) ─────────────────────
  logSection('4.4 — Focus Visibility (Tab Navigation)');

  try {
    const focusResults = await page.evaluate(() => {
      const focusable = document.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"]'
      );
      const results = [];
      for (const el of focusable) {
        if (el.offsetParent === null && window.getComputedStyle(el).position !== 'fixed') continue;
        el.focus();
        const style = window.getComputedStyle(el);
        const hasOutline = style.outlineStyle !== 'none' && style.outlineWidth !== '0px';
        const hasBoxShadow = style.boxShadow !== 'none' && style.boxShadow !== '';
        const hasRing = hasOutline || hasBoxShadow;

        const tag = el.tagName.toLowerCase();
        const cls = el.className ? `.${String(el.className).split(' ')[0]}` : '';
        const id = el.id ? `#${el.id}` : '';
        const text = (el.textContent || el.getAttribute('aria-label') || '').trim().substring(0, 40);

        results.push({
          selector: `${tag}${id}${cls}`,
          text,
          hasOutline, hasBoxShadow,
          hasFocusIndicator: hasRing,
          outlineStyle: style.outlineStyle,
          outlineColor: style.outlineColor,
        });
      }
      return results;
    });

    let focusVisible = 0;
    let focusInvisible = 0;
    for (const r of focusResults) {
      if (r.hasFocusIndicator) {
        focusVisible++;
      } else {
        focusInvisible++;
        logResult('warn', `No visible focus indicator`, `${r.selector} ("${r.text}")`);
      }
    }

    if (focusResults.length > 0) {
      console.log(`\n  Focus visibility summary: ${focusVisible}/${focusResults.length} elements have visible focus indicators`);
      if (focusInvisible === 0) {
        logResult('pass', 'All focusable elements have visible focus indicators');
      } else {
        logResult('fail', `${focusInvisible} focusable element(s) lack visible focus indicators`);
      }
    } else {
      logResult('warn', 'No focusable elements found in current view');
    }
  } catch (e) {
    logResult('warn', 'Could not check focus visibility', String(e.message).substring(0, 60));
  }

  // Check for :focus CSS rules
  try {
    const hasFocusCSS = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule.selectorText && rule.selectorText.includes(':focus-visible')) return 'focus-visible';
            if (rule.selectorText && rule.selectorText.includes(':focus')) return 'focus';
          }
        } catch (e) { /* cross-origin */ }
      }
      return false;
    });

    if (hasFocusCSS === 'focus-visible') {
      logResult('pass', 'CSS includes :focus-visible styles');
    } else if (hasFocusCSS === 'focus') {
      logResult('pass', 'CSS includes :focus styles (consider adding :focus-visible for better UX)');
    } else {
      logResult('warn', 'No custom :focus or :focus-visible CSS rules detected');
    }
  } catch (e) { /* ignore */ }

  // ── 4.5 Color Contrast Check ───────────────────────────────────
  logSection('4.5 — Color Contrast Check');

  try {
    const contrastResults = await page.evaluate(() => {
      function luminance(r, g, b) {
        const a = [r, g, b].map(v => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
      }

      function contrastRatio(rgb1, rgb2) {
        const l1 = luminance(rgb1[0], rgb1[1], rgb1[2]);
        const l2 = luminance(rgb2[0], rgb2[1], rgb2[2]);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
      }

      function parseColor(colorStr) {
        if (!colorStr) return null;
        const m = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
        return null;
      }

      function getEffectiveBg(el) {
        let current = el;
        while (current) {
          const bg = window.getComputedStyle(current).backgroundColor;
          const parsed = parseColor(bg);
          if (parsed) {
            const alpha = bg.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
            if (!alpha || parseFloat(alpha[1]) > 0.1) return parsed;
          }
          current = current.parentElement;
        }
        return [255, 255, 255];
      }

      const textEls = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, a, button, label, td, th, li');
      const results = [];
      const checked = new Set();

      for (const el of textEls) {
        if (el.offsetParent === null && window.getComputedStyle(el).position !== 'fixed') continue;
        const text = (el.textContent || '').trim();
        if (!text || text.length < 2) continue;

        const style = window.getComputedStyle(el);
        const fgColor = parseColor(style.color);
        if (!fgColor) continue;

        const bgColor = getEffectiveBg(el);
        const ratio = contrastRatio(fgColor, bgColor);
        const fontSize = parseFloat(style.fontSize);
        const fontWeight = parseInt(style.fontWeight) || 400;
        const isLargeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);

        const wcagAA = isLargeText ? 3 : 4.5;
        const wcagAAA = isLargeText ? 4.5 : 7;

        const tag = el.tagName.toLowerCase();
        const cls = el.className ? `.${String(el.className).split(' ')[0]}` : '';
        const key = `${tag}${cls}-${style.color}-${style.backgroundColor}`;
        if (checked.has(key)) continue;
        checked.add(key);

        results.push({
          selector: `${tag}${cls}`,
          text: text.substring(0, 50),
          fg: style.color,
          bg: `rgb(${bgColor.join(',')})`,
          ratio: Math.round(ratio * 100) / 100,
          fontSize: Math.round(fontSize),
          isLargeText,
          passAA: ratio >= wcagAA,
          passAAA: ratio >= wcagAAA,
          requiredAA: wcagAA,
        });
      }
      return results;
    });

    let contrastFails = 0;
    let contrastAAAPasses = 0;
    for (const r of contrastResults) {
      if (!r.passAA) {
        contrastFails++;
        logResult('fail', `Contrast ratio ${r.ratio}:1 (needs ${r.requiredAA}:1 AA)`,
          `${r.selector} "${r.text}" — fg: ${r.fg}, bg: ${r.bg}, size: ${r.fontSize}px`);
      } else if (r.passAAA) {
        contrastAAAPasses++;
      }
    }

    if (contrastFails === 0) {
      logResult('pass', `All ${contrastResults.length} text element(s) pass WCAG AA contrast`);
    } else {
      console.log(`\n  Contrast summary: ${contrastFails} failure(s) out of ${contrastResults.length} checked`);
    }
    console.log(`  WCAG AAA compliance: ${contrastAAAPasses}/${contrastResults.length} elements`);
  } catch (e) {
    logResult('warn', 'Could not check color contrast', String(e.message).substring(0, 60));
  }

  // ── 4.6 ARIA Attributes Usage ──────────────────────────────────
  logSection('4.6 — ARIA Attributes Usage');

  try {
    const ariaResults = await page.evaluate(() => {
      const all = document.querySelectorAll('*');
      const ariaElements = [];
      const roleElements = [];
      const landmarks = [];
      const ariaAttrs = {};

      for (const el of all) {
        for (const attr of el.attributes) {
          if (attr.name.startsWith('aria-')) {
            if (!ariaAttrs[attr.name]) ariaAttrs[attr.name] = 0;
            ariaAttrs[attr.name]++;
            ariaElements.push({
              tag: el.tagName.toLowerCase(),
              attr: attr.name,
              value: attr.value.substring(0, 40),
            });
          }
          if (attr.name === 'role') {
            roleElements.push({
              tag: el.tagName.toLowerCase(),
              role: attr.value,
              id: el.id || '',
              text: (el.textContent || '').substring(0, 40).trim(),
            });
            const landmarkRoles = ['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'search', 'region', 'application'];
            if (landmarkRoles.includes(attr.value)) {
              landmarks.push({ tag: el.tagName.toLowerCase(), role: attr.value, label: el.getAttribute('aria-label') || '' });
            }
          }
        }
      }

      const skipLink = document.querySelector('a[href="#main"], a[href="#content"], .skip-link, [class*="skip"]');

      return {
        ariaAttrs,
        ariaCount: Object.keys(ariaAttrs).length,
        roleElements,
        landmarks,
        hasSkipLink: !!skipLink,
        totalAriaElements: ariaElements.length,
      };
    });

    console.log(`\n  ARIA attribute usage summary:`);
    console.log(`    Elements with ARIA attributes: ${ariaResults.totalAriaElements}`);
    console.log(`    Unique ARIA attributes used: ${ariaResults.ariaCount}`);

    if (Object.keys(ariaResults.ariaAttrs).length > 0) {
      console.log(`    Breakdown:`);
      for (const [attr, count] of Object.entries(ariaResults.ariaAttrs)) {
        console.log(`      ${attr}: ${count} occurrence(s)`);
      }
      logResult('pass', `ARIA attributes in use (${ariaResults.totalAriaElements} elements)`);
    } else {
      logResult('warn', 'No ARIA attributes found on any elements');
    }

    console.log(`\n  Role attributes:`);
    if (ariaResults.roleElements.length > 0) {
      for (const r of ariaResults.roleElements) {
        console.log(`    <${r.tag} role="${r.role}"${r.id ? ` id="${r.id}"` : ''}> — "${r.text}"`);
      }
      logResult('pass', `${ariaResults.roleElements.length} element(s) with explicit roles`);
    } else {
      logResult('warn', 'No explicit role attributes found');
    }

    console.log(`\n  Landmarks:`);
    if (ariaResults.landmarks.length > 0) {
      for (const l of ariaResults.landmarks) {
        console.log(`    <${l.tag} role="${l.role}"${l.label ? ` aria-label="${l.label}"` : ''}>`);
      }
      logResult('pass', `${ariaResults.landmarks.length} landmark region(s) defined`);
    } else {
      logResult('warn', 'No landmark regions found (role="main", role="navigation", etc.)');
    }

    if (ariaResults.hasSkipLink) {
      logResult('pass', 'Skip navigation link present');
    } else {
      logResult('warn', 'No skip navigation link found');
    }
  } catch (e) {
    logResult('warn', 'Could not check ARIA attributes', String(e.message).substring(0, 60));
  }

  // ── 4.7 Touch Target Sizes ────────────────────────────────────
  logSection('4.7 — Touch Target Sizes (minimum 44x44px)');

  try {
    const touchResults = await page.evaluate(() => {
      const interactives = document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [tabindex]');
      const tooSmall = [];
      let total = 0, passing = 0;

      for (const el of interactives) {
        if (el.offsetParent === null && window.getComputedStyle(el).position !== 'fixed') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;

        total++;
        const width = Math.round(rect.width);
        const height = Math.round(rect.height);

        if (width < 44 || height < 44) {
          const tag = el.tagName.toLowerCase();
          const cls = el.className ? `.${String(el.className).split(' ')[0]}` : '';
          const id = el.id ? `#${el.id}` : '';
          const text = (el.textContent || el.getAttribute('aria-label') || '').trim().substring(0, 40);
          tooSmall.push({ selector: `${tag}${id}${cls}`, text, width, height });
        } else {
          passing++;
        }
      }
      return { total, passing, tooSmall: tooSmall.slice(0, 15) };
    });

    console.log(`\n  Touch target summary: ${touchResults.passing}/${touchResults.total} pass 44x44px minimum`);

    if (touchResults.tooSmall.length > 0) {
      logResult('fail', `${touchResults.tooSmall.length} interactive element(s) below 44x44px minimum`);
      for (const t of touchResults.tooSmall) {
        console.log(`         -> ${t.selector} ("${t.text}") — ${t.width}x${t.height}px`);
      }
    } else {
      logResult('pass', 'All interactive elements meet 44x44px minimum touch target size');
    }
  } catch (e) {
    logResult('warn', 'Could not check touch targets', String(e.message).substring(0, 60));
  }

  // ── 4.8 aria-live Regions ──────────────────────────────────────
  logSection('4.8 — aria-live Regions');

  try {
    const liveRegions = await page.evaluate(() => {
      const elements = document.querySelectorAll('[aria-live], [role="alert"], [role="status"], [role="log"], [role="timer"], [role="progressbar"]');
      const results = [];
      for (const el of elements) {
        results.push({
          tag: el.tagName.toLowerCase(),
          id: el.id || '(none)',
          cls: el.className ? String(el.className).substring(0, 60) : '(none)',
          ariaLive: el.getAttribute('aria-live') || '(implicit)',
          role: el.getAttribute('role') || '(none)',
          ariaAtomic: el.getAttribute('aria-atomic') || '(not set)',
          ariaRelevant: el.getAttribute('aria-relevant') || '(not set)',
          text: (el.textContent || '').trim().substring(0, 50),
        });
      }
      return results;
    });

    if (liveRegions.length > 0) {
      logResult('pass', `${liveRegions.length} aria-live region(s) found`);
      for (const r of liveRegions) {
        console.log(`    <${r.tag}${r.id !== '(none)' ? ' id="' + r.id + '"' : ''} aria-live="${r.ariaLive}" role="${r.role}">`);
        console.log(`      aria-atomic="${r.ariaAtomic}", aria-relevant="${r.ariaRelevant}"`);
        if (r.text) console.log(`      Content: "${r.text}"`);
      }
    } else {
      logResult('warn', 'No aria-live regions found — dynamic content may not be announced to screen readers');
    }
  } catch (e) {
    logResult('warn', 'Could not check aria-live regions', String(e.message).substring(0, 60));
  }

  // ── Additional A11y Checks ─────────────────────────────────────
  logSection('Additional Accessibility Checks');

  try {
    // lang attribute
    const langAttr = await page.evaluate(() => {
      const el = document.documentElement;
      return el ? el.getAttribute('lang') : null;
    });
    if (langAttr) {
      logResult('pass', `<html> has lang attribute`, `lang="${langAttr}"`);
    } else {
      logResult('fail', '<html> missing lang attribute');
    }
  } catch (e) {
    logResult('warn', 'Could not check lang attribute', String(e.message).substring(0, 60));
  }

  try {
    // meta viewport
    const vpContent = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta ? meta.getAttribute('content') : null;
    });
    if (vpContent) {
      logResult('pass', 'Meta viewport tag present', vpContent);
      if (vpContent.includes('user-scalable=no') || vpContent.includes('maximum-scale=1')) {
        logResult('fail', 'Viewport prevents user zooming (user-scalable=no or maximum-scale=1)');
      } else {
        logResult('pass', 'Viewport allows user zooming');
      }
    } else {
      logResult('fail', 'No meta viewport tag found');
    }
  } catch (e) {
    logResult('warn', 'Could not check viewport meta', String(e.message).substring(0, 60));
  }

  try {
    // prefers-reduced-motion
    const hasReducedMotion = await page.evaluate(() => {
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            if (rule instanceof CSSMediaRule && rule.conditionText &&
                rule.conditionText.includes('prefers-reduced-motion')) {
              return true;
            }
          }
        } catch (e) { /* cross-origin */ }
      }
      return false;
    });
    if (hasReducedMotion) {
      logResult('pass', 'CSS supports prefers-reduced-motion media query');
    } else {
      logResult('warn', 'No prefers-reduced-motion support detected in accessible stylesheets');
    }
  } catch (e) { /* ignore */ }

  try {
    // dark mode
    const hasDarkMode = await page.evaluate(() => {
      return !!(document.querySelector('[data-theme]') || document.querySelector('meta[name="color-scheme"]'));
    });
    if (hasDarkMode) {
      logResult('pass', 'Dark mode / color-scheme support detected');
    }
  } catch (e) { /* ignore */ }

  try {
    // tabindex > 0
    const badTabindex = await page.evaluate(() => {
      const els = document.querySelectorAll('[tabindex]');
      const bad = [];
      for (const el of els) {
        const val = parseInt(el.getAttribute('tabindex'));
        if (val > 0) {
          bad.push({ tag: el.tagName.toLowerCase(), tabindex: val, text: (el.textContent || '').trim().substring(0, 40) });
        }
      }
      return bad;
    });
    if (badTabindex.length > 0) {
      logResult('warn', `${badTabindex.length} element(s) with tabindex > 0 (disrupts natural tab order)`);
      for (const b of badTabindex) {
        console.log(`         -> <${b.tag} tabindex="${b.tabindex}"> "${b.text}"`);
      }
    } else {
      logResult('pass', 'No elements with tabindex > 0 (natural tab order preserved)');
    }
  } catch (e) { /* ignore */ }

  try {
    // noscript
    const hasNoscript = await page.evaluate(() => !!document.querySelector('noscript'));
    if (hasNoscript) {
      logResult('pass', '<noscript> fallback provided');
    } else {
      logResult('warn', 'No <noscript> fallback for non-JS users');
    }
  } catch (e) { /* ignore */ }

  // ── Final Summary ──────────────────────────────────────────────
  await a11yContext.close();
  await browser.close();

  console.log('\n' + '='.repeat(70));
  console.log('  FINAL SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total tests:  ${totalTests}`);
  console.log(`  ${PASS}:        ${passed}`);
  console.log(`  ${FAIL}:        ${failed}`);
  console.log(`  ${WARN}:        ${warnings}`);
  console.log('='.repeat(70));

  if (failed > 0) {
    console.log(`\n  Result: ${FAIL} — ${failed} test(s) failed\n`);
    process.exit(1);
  } else if (warnings > 0) {
    console.log(`\n  Result: ${WARN} — All tests passed but ${warnings} warning(s) noted\n`);
    process.exit(0);
  } else {
    console.log(`\n  Result: ${PASS} — All tests passed!\n`);
    process.exit(0);
  }
})();
