// ============================================================
// security-perf.js — Phase 5 (Security) & Phase 6 (Performance)
// QA Tests for Arava Distillery Factory Control
// ============================================================
const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'https://guymaich-jpg.github.io/Aravadistillery-Factory-Control/';

// Helpers
function header(title) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

function pass(label) { console.log(`  [PASS] ${label}`); }
function warn(label) { console.log(`  [WARN] ${label}`); }
function fail(label) { console.log(`  [FAIL] ${label}`); }
function info(label) { console.log(`  [INFO] ${label}`); }

let totalPass = 0;
let totalFail = 0;
let totalWarn = 0;

function PASS(label) { totalPass++; pass(label); }
function FAIL(label) { totalFail++; fail(label); }
function WARN(label) { totalWarn++; warn(label); }

(async () => {
  console.log('Starting Security & Performance QA Tests...');
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Date: ${new Date().toISOString()}`);

  // Parse proxy from environment (the container uses an authenticated proxy)
  const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  let launchOptions = { headless: true };

  if (proxyUrl) {
    try {
      // Format: http://username:password@host:port
      const match = proxyUrl.match(/^http:\/\/([^:]+):([^@]+)@([^:]+):(\d+)$/);
      if (match) {
        launchOptions.proxy = {
          server: `http://${match[3]}:${match[4]}`,
          username: match[1],
          password: match[2],
        };
        info(`Proxy configured: ${match[3]}:${match[4]} (authenticated)`);
      }
    } catch (e) {
      info(`Could not parse proxy URL: ${e.message}`);
    }
  }

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,  // Required: proxy does SSL interception
  });
  const page = await context.newPage();

  // Collect all network resources for performance analysis
  const resources = [];
  const responseHeaders = {};

  page.on('response', async (response) => {
    try {
      const url = response.url();
      const status = response.status();
      const headers = response.headers();
      const contentLength = parseInt(headers['content-length'] || '0', 10);
      const contentType = headers['content-type'] || 'unknown';

      // Capture main page headers
      if (url === TARGET_URL || url === TARGET_URL.replace(/\/$/, '')) {
        Object.assign(responseHeaders, headers);
      }

      resources.push({ url, status, contentLength, contentType, headers });
    } catch (e) { /* ignore */ }
  });

  // Navigate to page and measure real wall-clock time
  const wallStart = Date.now();
  let response;
  try {
    response = await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
  } catch (e) {
    console.error(`Failed to navigate: ${e.message}`);
    await browser.close();
    process.exit(1);
  }
  const wallEnd = Date.now();
  const wallTime = wallEnd - wallStart;

  // Wait extra for any dynamic content
  await page.waitForTimeout(2000);

  // Get the main page response headers
  const mainRespHeaders = response ? response.headers() : {};

  // ================================================================
  //  PHASE 5: SECURITY TESTS
  // ================================================================
  header('PHASE 5: SECURITY TESTS');

  // ------------------------------------------------------------------
  // 5.1 Check localStorage and sessionStorage for sensitive data
  // ------------------------------------------------------------------
  header('5.1 — localStorage & sessionStorage Sensitive Data Check');

  const sensitivePatterns = [
    /api[_-]?key/i, /token/i, /password/i, /secret/i, /private[_-]?key/i,
    /auth[_-]?token/i, /access[_-]?token/i, /refresh[_-]?token/i,
    /session[_-]?id/i, /credential/i, /bearer/i, /jwt/i
  ];

  const storageData = await page.evaluate(() => {
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      ls[key] = localStorage.getItem(key);
    }
    const ss = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      ss[key] = sessionStorage.getItem(key);
    }
    return { localStorage: ls, sessionStorage: ss };
  });

  info(`localStorage has ${Object.keys(storageData.localStorage).length} key(s)`);
  for (const key of Object.keys(storageData.localStorage)) {
    const val = storageData.localStorage[key];
    const preview = val && val.length > 80 ? val.substring(0, 80) + '...' : val;
    info(`  key: "${key}" => "${preview}"`);
  }
  info(`sessionStorage has ${Object.keys(storageData.sessionStorage).length} key(s)`);
  for (const key of Object.keys(storageData.sessionStorage)) {
    const val = storageData.sessionStorage[key];
    const preview = val && val.length > 80 ? val.substring(0, 80) + '...' : val;
    info(`  key: "${key}" => "${preview}"`);
  }

  let sensitiveFound = false;
  for (const store of ['localStorage', 'sessionStorage']) {
    for (const key of Object.keys(storageData[store])) {
      for (const pat of sensitivePatterns) {
        if (pat.test(key)) {
          FAIL(`${store} key "${key}" matches sensitive pattern ${pat}`);
          sensitiveFound = true;
        }
      }
      // Check values for JWT-like tokens
      const val = storageData[store][key];
      if (val && /^ey[A-Za-z0-9_-]{10,}\.ey[A-Za-z0-9_-]{10,}/.test(val)) {
        WARN(`${store} key "${key}" value looks like a JWT`);
        sensitiveFound = true;
      }
    }
  }
  if (!sensitiveFound) {
    PASS('No sensitive data patterns found in localStorage/sessionStorage');
  }

  // ------------------------------------------------------------------
  // 5.2 Check for inline scripts that might be XSS vectors
  // ------------------------------------------------------------------
  header('5.2 — Inline Script XSS Vector Check');

  const inlineScriptAnalysis = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script:not([src])');
    return Array.from(scripts).map((s, i) => ({
      index: i,
      length: s.textContent.length,
      snippet: s.textContent.substring(0, 300),
      hasEval: /eval\s*\(/.test(s.textContent),
      hasInnerHTML: /\.innerHTML\s*=/.test(s.textContent),
      hasDocumentWrite: /document\.write/.test(s.textContent),
      hasSetTimeoutString: /setTimeout\s*\(\s*['"]/.test(s.textContent),
      hasNewFunction: /new\s+Function\s*\(/.test(s.textContent),
      hasOuterHTML: /\.outerHTML\s*=/.test(s.textContent),
      hasInsertAdjacentHTML: /insertAdjacentHTML/.test(s.textContent),
    }));
  });

  info(`Found ${inlineScriptAnalysis.length} inline script block(s)`);
  let xssVectorsFound = false;

  for (const s of inlineScriptAnalysis) {
    const snippetOneLine = s.snippet.replace(/\s+/g, ' ').substring(0, 120);
    info(`  Script #${s.index}: ${s.length} chars — "${snippetOneLine}..."`);
    if (s.hasEval)             { FAIL(`Inline script #${s.index} uses eval() — XSS risk`); xssVectorsFound = true; }
    if (s.hasNewFunction)      { FAIL(`Inline script #${s.index} uses new Function() — XSS risk`); xssVectorsFound = true; }
    if (s.hasDocumentWrite)    { WARN(`Inline script #${s.index} uses document.write()`); }
    if (s.hasSetTimeoutString) { WARN(`Inline script #${s.index} uses setTimeout with string arg`); }
    if (s.hasInnerHTML)        { WARN(`Inline script #${s.index} uses innerHTML assignment`); }
    if (s.hasOuterHTML)        { WARN(`Inline script #${s.index} uses outerHTML assignment`); }
    if (s.hasInsertAdjacentHTML) { WARN(`Inline script #${s.index} uses insertAdjacentHTML`); }
  }

  // Check external scripts for SRI
  const externalScripts = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script[src]');
    return Array.from(scripts).map(s => ({
      src: s.getAttribute('src') || s.src,
      fullSrc: s.src,
      hasCrossorigin: s.hasAttribute('crossorigin'),
      hasIntegrity: s.hasAttribute('integrity'),
      hasNonce: s.hasAttribute('nonce'),
    }));
  });

  info(`Found ${externalScripts.length} external script(s)`);
  for (const s of externalScripts) {
    info(`  External: ${s.fullSrc}`);
    if (s.fullSrc.startsWith('http') && !s.fullSrc.includes('github.io')) {
      // Third-party script
      if (!s.hasIntegrity) WARN(`  Missing SRI (integrity) on third-party script: ${s.src}`);
      else PASS(`  SRI present on: ${s.src}`);
      if (!s.hasCrossorigin) WARN(`  Missing crossorigin attribute on: ${s.src}`);
    }
  }

  if (!xssVectorsFound) {
    PASS('No high-risk XSS patterns (eval, new Function) in inline scripts');
  }

  // ------------------------------------------------------------------
  // 5.3 Check if source maps are exposed
  // ------------------------------------------------------------------
  header('5.3 — Source Map Exposure Check');

  const sourceMapCheck = await page.evaluate(async (baseUrl) => {
    const files = ['script.js.map', 'style.css.map', 'auth.js.map', 'data.js.map', 'firebase.js.map', 'i18n.js.map'];
    const results = [];
    for (const f of files) {
      try {
        const resp = await fetch(new URL(f, baseUrl).href, { method: 'HEAD' });
        results.push({ file: f, status: resp.status, accessible: resp.ok });
      } catch (e) {
        results.push({ file: f, status: 0, accessible: false, error: e.message });
      }
    }
    return results;
  }, TARGET_URL);

  let sourceMapExposed = false;
  for (const r of sourceMapCheck) {
    if (r.accessible) {
      FAIL(`Source map exposed: ${r.file} (status ${r.status})`);
      sourceMapExposed = true;
    } else {
      info(`  ${r.file} — not accessible (status ${r.status})`);
    }
  }

  // Check SourceMap headers on responses
  for (const res of resources) {
    if (res.headers['sourcemap'] || res.headers['x-sourcemap']) {
      FAIL(`SourceMap header found on: ${res.url}`);
      sourceMapExposed = true;
    }
  }

  // Check JS content for sourceMappingURL comments
  const sourceMappingURLCheck = await page.evaluate(async (baseUrl) => {
    const jsFiles = ['script.js', 'auth.js', 'data.js', 'firebase.js', 'i18n.js'];
    const results = [];
    for (const f of jsFiles) {
      try {
        const resp = await fetch(new URL(f, baseUrl).href);
        if (resp.ok) {
          const text = await resp.text();
          const hasSourceMap = /\/\/[#@]\s*sourceMappingURL=/.test(text);
          results.push({ file: f, hasSourceMapComment: hasSourceMap });
        }
      } catch (e) {
        results.push({ file: f, error: e.message });
      }
    }
    return results;
  }, TARGET_URL);

  for (const r of sourceMappingURLCheck) {
    if (r.hasSourceMapComment) {
      WARN(`sourceMappingURL comment found in: ${r.file}`);
    } else if (!r.error) {
      info(`  ${r.file} — no sourceMappingURL comment`);
    }
  }

  if (!sourceMapExposed) {
    PASS('No source maps exposed');
  }

  // ------------------------------------------------------------------
  // 5.4 Check HTTP security headers
  // ------------------------------------------------------------------
  header('5.4 — HTTP Security Headers');

  // Fetch headers from within the browser to avoid proxy issues
  const fetchedHeaders = await page.evaluate(async (url) => {
    try {
      const resp = await fetch(url, { method: 'GET', cache: 'no-cache' });
      const headers = {};
      resp.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });
      return { ok: true, headers, status: resp.status };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }, TARGET_URL);

  // Merge: use fetched headers as primary, fall back to navigation response
  const effectiveHeaders = fetchedHeaders.ok ? fetchedHeaders.headers : mainRespHeaders;

  info('Response headers from main page:');
  for (const [hdr, value] of Object.entries(effectiveHeaders)) {
    info(`  ${hdr}: ${value.length > 120 ? value.substring(0, 120) + '...' : value}`);
  }

  const securityHeaders = {
    'strict-transport-security': { label: 'Strict-Transport-Security (HSTS)', severity: 'warn' },
    'x-content-type-options': { label: 'X-Content-Type-Options', severity: 'warn' },
    'x-frame-options': { label: 'X-Frame-Options', severity: 'warn' },
    'x-xss-protection': { label: 'X-XSS-Protection (deprecated but still useful)', severity: 'info' },
    'referrer-policy': { label: 'Referrer-Policy', severity: 'warn' },
    'permissions-policy': { label: 'Permissions-Policy', severity: 'warn' },
    'content-security-policy': { label: 'Content-Security-Policy', severity: 'warn' },
    'cross-origin-opener-policy': { label: 'Cross-Origin-Opener-Policy', severity: 'info' },
    'cross-origin-embedder-policy': { label: 'Cross-Origin-Embedder-Policy', severity: 'info' },
    'cross-origin-resource-policy': { label: 'Cross-Origin-Resource-Policy', severity: 'info' },
  };

  console.log('');
  info('Security header analysis:');
  for (const [hdrKey, config] of Object.entries(securityHeaders)) {
    if (effectiveHeaders[hdrKey]) {
      PASS(`${config.label}: ${effectiveHeaders[hdrKey]}`);
    } else {
      if (config.severity === 'warn') {
        WARN(`Missing header: ${config.label}`);
      } else {
        info(`  Optional header missing: ${config.label}`);
      }
    }
  }

  // Note about GitHub Pages
  info('NOTE: GitHub Pages sets some headers at the CDN level (HSTS, X-Content-Type-Options).');
  info('      These may not appear in fetch() but are sent by the server to real browsers.');

  // ------------------------------------------------------------------
  // 5.5 Look for hardcoded API keys or secrets in page source
  // ------------------------------------------------------------------
  header('5.5 — Hardcoded API Keys / Secrets in Page Source');

  // Get full page source plus all loaded JS files
  const allSourceCode = await page.evaluate(async (baseUrl) => {
    const jsFiles = ['script.js', 'auth.js', 'data.js', 'firebase.js', 'i18n.js'];
    let allCode = (document.documentElement ? document.documentElement.outerHTML : document.body ? document.body.innerHTML : '') + '\n';
    for (const f of jsFiles) {
      try {
        const resp = await fetch(new URL(f, baseUrl).href);
        if (resp.ok) {
          allCode += `\n// === ${f} ===\n` + await resp.text() + '\n';
        }
      } catch (e) {}
    }
    return allCode;
  }, TARGET_URL);

  info(`Total source code analyzed: ${(allSourceCode.length / 1024).toFixed(0)} KB`);

  const secretPatterns = [
    { name: 'Google/Firebase API Key', pattern: /AIza[0-9A-Za-z_-]{35}/g },
    { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g },
    { name: 'GitHub Token', pattern: /gh[pousr]_[A-Za-z0-9_]{36,}/g },
    { name: 'Slack Token', pattern: /xox[baprs]-[0-9a-zA-Z-]{10,}/g },
    { name: 'Private Key Block', pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g },
    { name: 'Bearer Token', pattern: /Bearer\s+[A-Za-z0-9_.~+\/-]{20,}/g },
  ];

  let secretsFound = false;
  for (const { name, pattern } of secretPatterns) {
    const matches = allSourceCode.match(pattern);
    if (matches) {
      for (const m of matches) {
        if (/YOUR_|EXAMPLE|placeholder|xxx/i.test(m)) {
          info(`  ${name}: placeholder value detected (OK)`);
          continue;
        }
        FAIL(`${name} found: "${m.substring(0, 60)}..."`);
        secretsFound = true;
      }
    }
  }

  // Check for hardcoded passwords in auth.js
  const hardcodedPasswords = allSourceCode.match(/hashPassword\s*\(\s*['"]([^'"]+)['"]\s*\)/g);
  if (hardcodedPasswords) {
    for (const hp of hardcodedPasswords) {
      WARN(`Hardcoded password in hash call: ${hp}`);
    }
  }

  // Check for generic secret patterns
  const genericSecrets = allSourceCode.match(/['"]?(?:api_key|apiKey|API_KEY|secret_key|secretKey)['"]?\s*[:=]\s*['"][^'"]{8,}['"]/g);
  if (genericSecrets) {
    for (const gs of genericSecrets) {
      if (/YOUR_|EXAMPLE|placeholder/i.test(gs)) {
        info(`  Generic secret pattern: placeholder (OK) — ${gs.substring(0, 60)}`);
      } else {
        WARN(`Generic secret pattern found: ${gs.substring(0, 80)}`);
        secretsFound = true;
      }
    }
  }

  // Specifically check Firebase config
  const firebaseConfigCheck = await page.evaluate(() => {
    if (typeof FIREBASE_CONFIG !== 'undefined') {
      return {
        exists: true,
        config: JSON.parse(JSON.stringify(FIREBASE_CONFIG)),
        isPlaceholder: FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.startsWith('YOUR_')
      };
    }
    return { exists: false };
  });

  if (firebaseConfigCheck.exists) {
    info(`Firebase config found. Keys: ${Object.keys(firebaseConfigCheck.config).join(', ')}`);
    info(`  apiKey: "${firebaseConfigCheck.config.apiKey}"`);
    info(`  projectId: "${firebaseConfigCheck.config.projectId}"`);
    if (firebaseConfigCheck.isPlaceholder) {
      PASS('Firebase config uses placeholder values (not real credentials)');
    } else {
      FAIL('Firebase config contains real API key — exposed to client');
    }
  } else {
    info('FIREBASE_CONFIG variable not found in window scope');
  }

  if (!secretsFound && !hardcodedPasswords) {
    PASS('No hardcoded API keys or real secrets detected in source');
  }

  // ------------------------------------------------------------------
  // 5.6 Check cookies for Secure and HttpOnly flags
  // ------------------------------------------------------------------
  header('5.6 — Cookie Security Flags');

  const cookies = await context.cookies();
  info(`Total cookies: ${cookies.length}`);

  if (cookies.length === 0) {
    PASS('No cookies set — no cookie security flags to check');
  } else {
    for (const cookie of cookies) {
      info(`  Cookie: "${cookie.name}" | Domain: ${cookie.domain} | Path: ${cookie.path}`);
      info(`    Secure: ${cookie.secure} | HttpOnly: ${cookie.httpOnly} | SameSite: ${cookie.sameSite}`);
      if (!cookie.secure) FAIL(`Cookie "${cookie.name}" missing Secure flag`);
      else PASS(`Cookie "${cookie.name}" has Secure flag`);
      if (!cookie.httpOnly) WARN(`Cookie "${cookie.name}" missing HttpOnly flag`);
      else PASS(`Cookie "${cookie.name}" has HttpOnly flag`);
      if (cookie.sameSite === 'None' || !cookie.sameSite) {
        WARN(`Cookie "${cookie.name}" SameSite=${cookie.sameSite || 'unset'}`);
      } else {
        PASS(`Cookie "${cookie.name}" SameSite=${cookie.sameSite}`);
      }
    }
  }

  // ------------------------------------------------------------------
  // 5.7 Check Content-Security-Policy
  // ------------------------------------------------------------------
  header('5.7 — Content-Security-Policy Analysis');

  const cspHeader = effectiveHeaders['content-security-policy'] || null;
  const cspMeta = await page.evaluate(() => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    return meta ? meta.getAttribute('content') : null;
  });

  if (cspHeader) {
    PASS(`CSP HTTP header present`);
    info(`  Value: ${cspHeader.substring(0, 200)}${cspHeader.length > 200 ? '...' : ''}`);
  } else {
    WARN('No Content-Security-Policy HTTP response header');
  }

  const cspToAnalyze = cspMeta || cspHeader;
  if (cspMeta) {
    PASS('CSP meta tag present');
    info(`  Value: ${cspMeta.substring(0, 200)}${cspMeta.length > 200 ? '...' : ''}`);
  } else if (!cspHeader) {
    WARN('No CSP meta tag found either');
  }

  if (cspToAnalyze) {
    const directives = cspToAnalyze.split(';').map(d => d.trim()).filter(Boolean);
    console.log('');
    info('CSP Directive Breakdown:');
    for (const dir of directives) {
      info(`  ${dir}`);
      if (/unsafe-inline/.test(dir)) WARN(`CSP uses 'unsafe-inline' in: ${dir.split(' ')[0]}`);
      if (/unsafe-eval/.test(dir)) FAIL(`CSP uses 'unsafe-eval' in: ${dir.split(' ')[0]}`);
      if (/^\s*default-src.*\*/.test(dir)) FAIL('CSP default-src allows wildcard (*)');
      if (/^\s*script-src.*\*/.test(dir)) FAIL('CSP script-src allows wildcard (*)');
    }

    const directiveNames = directives.map(d => d.split(/\s+/)[0]);
    const important = ['default-src', 'script-src', 'style-src', 'frame-ancestors', 'object-src'];
    for (const imp of important) {
      if (directiveNames.includes(imp)) PASS(`CSP includes ${imp} directive`);
      else WARN(`CSP missing ${imp} directive`);
    }
  }

  // ------------------------------------------------------------------
  // 5.8 Firebase config / service credentials in client code
  // ------------------------------------------------------------------
  header('5.8 — Firebase / Service Credentials Exposure');

  const credentialCheck = await page.evaluate(() => {
    const results = [];

    // Firebase SDK
    if (typeof firebase !== 'undefined') {
      results.push({ service: 'Firebase SDK', status: 'loaded' });
      try {
        if (firebase.apps && firebase.apps.length > 0) {
          results.push({ service: 'Firebase App', status: 'initialized' });
        } else {
          results.push({ service: 'Firebase App', status: 'not initialized (no apps)' });
        }
      } catch (e) { results.push({ service: 'Firebase App', status: `error: ${e.message}` }); }
    } else {
      results.push({ service: 'Firebase SDK', status: 'not loaded' });
    }

    // FIREBASE_ENABLED
    if (typeof FIREBASE_ENABLED !== 'undefined') {
      results.push({ service: 'FIREBASE_ENABLED', status: String(FIREBASE_ENABLED) });
    }

    // FIREBASE_CONFIG
    if (typeof FIREBASE_CONFIG !== 'undefined') {
      results.push({ service: 'FIREBASE_CONFIG', status: JSON.stringify(FIREBASE_CONFIG) });
    }

    // Check for window-level globals
    const globals = ['API_KEY', 'API_SECRET', 'CLIENT_SECRET', 'PRIVATE_KEY', 'GAS_URL', 'WEBHOOK_URL', 'GOOGLE_CLIENT_ID'];
    for (const g of globals) {
      if (typeof window[g] !== 'undefined') {
        results.push({ service: `window.${g}`, status: String(window[g]).substring(0, 60) });
      }
    }

    return results;
  });

  for (const cred of credentialCheck) {
    info(`${cred.service}: ${cred.status}`);
  }

  const fbEnabled = credentialCheck.find(c => c.service === 'FIREBASE_ENABLED');
  if (fbEnabled && fbEnabled.status === 'false') {
    PASS('Firebase is DISABLED (FIREBASE_ENABLED=false) — no live credentials exposed');
  } else if (fbEnabled && fbEnabled.status === 'true') {
    WARN('Firebase is ENABLED — credentials are active in client code');
  }

  // Check for Google Apps Script URLs in source
  const gasUrls = allSourceCode.match(/https:\/\/script\.google\.com\/macros\/[^\s'"<>)]+/g);
  if (gasUrls) {
    for (const url of [...new Set(gasUrls)]) {
      WARN(`Google Apps Script URL exposed: ${url.substring(0, 80)}`);
    }
  } else {
    info('No Google Apps Script URLs found in source code');
  }

  // Check for hardcoded default passwords in auth
  const defaultPasswordCheck = allSourceCode.match(/password:\s*hashPassword\(\s*['"]([^'"]+)['"]\s*\)/g);
  if (defaultPasswordCheck) {
    for (const dp of defaultPasswordCheck) {
      WARN(`Default user password hash found in source: ${dp}`);
    }
    WARN('Default/hardcoded user passwords are visible in client-side code');
  }

  // ================================================================
  //  PHASE 6: PERFORMANCE TESTS
  // ================================================================
  header('PHASE 6: PERFORMANCE TESTS');

  // ------------------------------------------------------------------
  // 6.1 Measure page load time (navigation timing API)
  // ------------------------------------------------------------------
  header('6.1 — Page Load Time (Navigation Timing API)');

  info(`Wall-clock navigation time (Playwright): ${wallTime} ms`);

  const navTiming = await page.evaluate(() => {
    const perf = performance.getEntriesByType('navigation')[0];
    if (!perf) return null;
    return {
      redirectTime: perf.redirectEnd - perf.redirectStart,
      dnsLookup: perf.domainLookupEnd - perf.domainLookupStart,
      tcpConnect: perf.connectEnd - perf.connectStart,
      tlsNegotiation: perf.secureConnectionStart > 0 ? perf.connectEnd - perf.secureConnectionStart : 0,
      ttfb: perf.responseStart - perf.requestStart,
      responseTime: perf.responseEnd - perf.responseStart,
      domInteractive: perf.domInteractive - perf.startTime,
      domContentLoaded: perf.domContentLoadedEventEnd - perf.startTime,
      loadComplete: perf.loadEventEnd > 0 ? perf.loadEventEnd - perf.startTime : 0,
      totalDuration: perf.duration,
      transferSize: perf.transferSize,
      encodedBodySize: perf.encodedBodySize,
      decodedBodySize: perf.decodedBodySize,
    };
  });

  if (navTiming) {
    info(`Redirect Time:        ${navTiming.redirectTime.toFixed(2)} ms`);
    info(`DNS Lookup:           ${navTiming.dnsLookup.toFixed(2)} ms`);
    info(`TCP Connect:          ${navTiming.tcpConnect.toFixed(2)} ms`);
    info(`TLS Negotiation:      ${navTiming.tlsNegotiation.toFixed(2)} ms`);
    info(`TTFB (nav API):       ${navTiming.ttfb.toFixed(2)} ms`);
    info(`Response Time:        ${navTiming.responseTime.toFixed(2)} ms`);
    info(`DOM Interactive:      ${navTiming.domInteractive.toFixed(2)} ms`);
    info(`DOM Content Loaded:   ${navTiming.domContentLoaded.toFixed(2)} ms`);
    info(`Load Complete:        ${navTiming.loadComplete.toFixed(2)} ms`);
    info(`Total Duration:       ${navTiming.totalDuration.toFixed(2)} ms`);
    info(`Transfer Size:        ${(navTiming.transferSize / 1024).toFixed(2)} KB`);
    info(`Encoded Body Size:    ${(navTiming.encodedBodySize / 1024).toFixed(2)} KB`);
    info(`Decoded Body Size:    ${(navTiming.decodedBodySize / 1024).toFixed(2)} KB`);
  }

  // Use wall-clock time as primary measurement since nav API may read 0 through proxy
  const loadTime = (navTiming && navTiming.loadComplete > 0) ? navTiming.loadComplete : wallTime;
  info(`Effective load time used for grading: ${loadTime} ms`);
  if (loadTime < 3000) PASS(`Page loaded in ${loadTime} ms (< 3s — Good)`);
  else if (loadTime < 5000) WARN(`Page loaded in ${loadTime} ms (3-5s — Acceptable)`);
  else FAIL(`Page loaded in ${loadTime} ms (> 5s — Slow)`);

  // ------------------------------------------------------------------
  // 6.2 Measure LCP (Largest Contentful Paint)
  // ------------------------------------------------------------------
  header('6.2 — Largest Contentful Paint (LCP)');

  // Open a fresh page with LCP observer pre-injected
  const lcpPage = await context.newPage();
  await lcpPage.addInitScript(() => {
    window.__lcpEntries = [];
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__lcpEntries.push({
            startTime: entry.startTime,
            size: entry.size,
            element: entry.element ? entry.element.tagName : 'unknown',
            id: entry.element ? entry.element.id : '',
            url: entry.url || '',
          });
        }
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {
      window.__lcpError = e.message;
    }
  });

  await lcpPage.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 60000 });
  await lcpPage.waitForTimeout(3000);

  const lcpData = await lcpPage.evaluate(() => ({
    entries: window.__lcpEntries || [],
    error: window.__lcpError || null,
  }));

  if (lcpData.error) {
    WARN(`LCP observer error: ${lcpData.error}`);
  }

  if (lcpData.entries.length > 0) {
    const lastLcp = lcpData.entries[lcpData.entries.length - 1];
    info(`LCP entries collected: ${lcpData.entries.length}`);
    info(`Final LCP Time:    ${lastLcp.startTime.toFixed(2)} ms`);
    info(`LCP Element:       <${lastLcp.element}> id="${lastLcp.id}"`);
    info(`LCP Size:          ${lastLcp.size}`);
    if (lastLcp.url) info(`LCP URL:           ${lastLcp.url}`);

    if (lastLcp.startTime < 2500) PASS(`LCP is ${lastLcp.startTime.toFixed(0)} ms (Good, < 2.5s)`);
    else if (lastLcp.startTime < 4000) WARN(`LCP is ${lastLcp.startTime.toFixed(0)} ms (Needs Improvement, 2.5-4s)`);
    else FAIL(`LCP is ${lastLcp.startTime.toFixed(0)} ms (Poor, > 4s)`);
  } else {
    WARN('No LCP entries observed (page may have minimal visible content before interaction)');
  }

  // ------------------------------------------------------------------
  // 6.3 Measure CLS (Cumulative Layout Shift)
  // ------------------------------------------------------------------
  header('6.3 — Cumulative Layout Shift (CLS)');

  const clsData = await lcpPage.evaluate(() => {
    return new Promise((resolve) => {
      let totalCLS = 0;
      const shifts = [];
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              totalCLS += entry.value;
              shifts.push({
                value: entry.value,
                sources: entry.sources ? entry.sources.map(s => ({
                  node: s.node ? s.node.nodeName : 'unknown',
                })) : [],
              });
            }
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => {
          observer.disconnect();
          resolve({ cls: totalCLS, shifts });
        }, 2000);
      } catch (e) {
        resolve({ cls: 0, shifts: [], error: e.message });
      }
    });
  });

  info(`CLS Score:          ${clsData.cls.toFixed(4)}`);
  info(`Layout shift events: ${clsData.shifts.length}`);
  if (clsData.error) info(`CLS observer note: ${clsData.error}`);
  for (const s of clsData.shifts.slice(0, 10)) {
    info(`  Shift: ${s.value.toFixed(4)}${s.sources.length > 0 ? ' from ' + s.sources.map(x => x.node).join(', ') : ''}`);
  }

  if (clsData.cls < 0.1) PASS(`CLS is ${clsData.cls.toFixed(4)} (Good, < 0.1)`);
  else if (clsData.cls < 0.25) WARN(`CLS is ${clsData.cls.toFixed(4)} (Needs Improvement, 0.1-0.25)`);
  else FAIL(`CLS is ${clsData.cls.toFixed(4)} (Poor, > 0.25)`);

  await lcpPage.close();

  // ------------------------------------------------------------------
  // 6.4 Measure TTFB (Time to First Byte)
  // ------------------------------------------------------------------
  header('6.4 — Time to First Byte (TTFB)');

  const ttfbNav = navTiming ? navTiming.ttfb : 0;
  info(`TTFB (Navigation Timing API): ${ttfbNav.toFixed(2)} ms`);

  // Additional TTFB measurement via fetch from within the page
  const ttfbFetch = await page.evaluate(async (url) => {
    const start = performance.now();
    try {
      const resp = await fetch(url, { cache: 'no-cache' });
      const firstByte = performance.now();
      await resp.text();
      const done = performance.now();
      return {
        ttfb: firstByte - start,
        total: done - start,
        status: resp.status,
      };
    } catch (e) {
      return { error: e.message };
    }
  }, TARGET_URL);

  if (ttfbFetch.error) {
    info(`TTFB fetch measurement failed: ${ttfbFetch.error}`);
  } else {
    info(`TTFB (in-page fetch): ${ttfbFetch.ttfb.toFixed(2)} ms`);
    info(`Total fetch time:     ${ttfbFetch.total.toFixed(2)} ms`);
    info(`Fetch status:         ${ttfbFetch.status}`);
  }

  const effectiveTTFB = ttfbFetch && !ttfbFetch.error ? ttfbFetch.ttfb : ttfbNav;
  if (effectiveTTFB > 0) {
    if (effectiveTTFB < 200) PASS(`TTFB is ${effectiveTTFB.toFixed(0)} ms (Excellent, < 200ms)`);
    else if (effectiveTTFB < 500) PASS(`TTFB is ${effectiveTTFB.toFixed(0)} ms (Good, < 500ms)`);
    else if (effectiveTTFB < 1000) WARN(`TTFB is ${effectiveTTFB.toFixed(0)} ms (Acceptable, 500-1000ms)`);
    else FAIL(`TTFB is ${effectiveTTFB.toFixed(0)} ms (Slow, > 1s)`);
  } else {
    info('TTFB could not be accurately measured (proxy/CDN caching)');
  }

  // ------------------------------------------------------------------
  // 6.5 Count total resources loaded and their sizes
  // ------------------------------------------------------------------
  header('6.5 — Resource Count & Sizes');

  // Also get resource timing data from the browser
  const resourceTimings = await page.evaluate(() => {
    return performance.getEntriesByType('resource').map(r => ({
      name: r.name,
      type: r.initiatorType,
      transferSize: r.transferSize,
      encodedBodySize: r.encodedBodySize,
      decodedBodySize: r.decodedBodySize,
      duration: r.duration,
    }));
  });

  const resourceSummary = {};
  let totalTransferSize = 0;
  let totalDecodedSize = 0;

  for (const r of resourceTimings) {
    const type = r.type || 'other';
    if (!resourceSummary[type]) {
      resourceSummary[type] = { count: 0, transferSize: 0, decodedSize: 0, items: [] };
    }
    resourceSummary[type].count++;
    resourceSummary[type].transferSize += r.transferSize || 0;
    resourceSummary[type].decodedSize += r.decodedBodySize || 0;
    resourceSummary[type].items.push({
      name: r.name.length > 100 ? '...' + r.name.slice(-80) : r.name,
      size: r.transferSize,
      decoded: r.decodedBodySize,
      duration: r.duration,
    });
    totalTransferSize += r.transferSize || 0;
    totalDecodedSize += r.decodedBodySize || 0;
  }

  info(`Total resources (Resource Timing): ${resourceTimings.length}`);
  info(`Total transfer size: ${(totalTransferSize / 1024).toFixed(2)} KB`);
  info(`Total decoded size:  ${(totalDecodedSize / 1024).toFixed(2)} KB`);

  // Also count from intercepted responses
  info(`Total responses intercepted: ${resources.length}`);
  console.log('');

  for (const [type, data] of Object.entries(resourceSummary).sort((a, b) => b[1].transferSize - a[1].transferSize)) {
    info(`${type}: ${data.count} resource(s), transfer: ${(data.transferSize / 1024).toFixed(2)} KB, decoded: ${(data.decodedSize / 1024).toFixed(2)} KB`);
    for (const item of data.items) {
      info(`    ${item.name} — ${(item.size / 1024).toFixed(1)} KB (${item.duration.toFixed(0)} ms)`);
    }
  }

  if (resourceTimings.length < 30) PASS(`Total resources: ${resourceTimings.length} (< 30, efficient)`);
  else if (resourceTimings.length < 60) WARN(`Total resources: ${resourceTimings.length} (30-60, moderate)`);
  else FAIL(`Total resources: ${resourceTimings.length} (> 60, too many HTTP requests)`);

  if (totalTransferSize < 500 * 1024) PASS(`Total transfer size: ${(totalTransferSize / 1024).toFixed(0)} KB (< 500 KB)`);
  else if (totalTransferSize < 1024 * 1024) WARN(`Total transfer size: ${(totalTransferSize / 1024).toFixed(0)} KB (500 KB-1 MB)`);
  else FAIL(`Total transfer size: ${(totalTransferSize / 1024).toFixed(0)} KB (> 1 MB, heavy)`);

  // ------------------------------------------------------------------
  // 6.6 Check if JS/CSS are minified
  // ------------------------------------------------------------------
  header('6.6 — JS/CSS Minification Check');

  const minificationCheck = await page.evaluate(async (baseUrl) => {
    const files = [
      { name: 'script.js', type: 'js' },
      { name: 'style.css', type: 'css' },
      { name: 'auth.js', type: 'js' },
      { name: 'data.js', type: 'js' },
      { name: 'firebase.js', type: 'js' },
      { name: 'i18n.js', type: 'js' },
    ];
    const results = [];
    for (const f of files) {
      try {
        const resp = await fetch(new URL(f.name, baseUrl).href);
        if (!resp.ok) { results.push({ name: f.name, error: `HTTP ${resp.status}` }); continue; }
        const body = await resp.text();
        const lines = body.split('\n');
        const totalChars = body.length;
        const totalLines = lines.length;
        const avgLineLength = totalChars / totalLines;
        const hasComments = f.type === 'js'
          ? /\/\*[\s\S]{10,}?\*\/|\/\/[^\n]{5,}/.test(body)
          : /\/\*[\s\S]{10,}?\*\//.test(body);
        const hasIndentation = /\n {4,}|\n\t{2,}/.test(body);
        const isMinLike = (avgLineLength > 500 && !hasComments) || f.name.includes('.min.');

        results.push({
          name: f.name,
          type: f.type,
          totalChars,
          totalLines,
          avgLineLength: Math.round(avgLineLength),
          hasComments,
          hasIndentation,
          isMinified: isMinLike,
        });
      } catch (e) {
        results.push({ name: f.name, error: e.message });
      }
    }
    return results;
  }, TARGET_URL);

  for (const r of minificationCheck) {
    if (r.error) {
      info(`  ${r.name}: could not check — ${r.error}`);
      continue;
    }
    info(`  ${r.name}: ${r.totalLines} lines, ${r.totalChars} chars, avg ${r.avgLineLength} chars/line`);
    if (r.isMinified) {
      PASS(`${r.name} appears minified`);
    } else {
      WARN(`${r.name} is NOT minified (${r.totalLines} lines, avg line ${r.avgLineLength} chars)`);
      if (r.hasComments) info(`    Contains comments — should strip for production`);
      if (r.hasIndentation) info(`    Contains indentation/whitespace — should minify`);
    }
  }

  // ------------------------------------------------------------------
  // 6.7 Measure DOM size (number of elements)
  // ------------------------------------------------------------------
  header('6.7 — DOM Size');

  const domMetrics = await page.evaluate(() => {
    const allElements = document.querySelectorAll('*');
    const tagCounts = {};
    let maxDepth = 0;

    function getDepth(el) {
      let depth = 0;
      let p = el.parentElement;
      while (p) { depth++; p = p.parentElement; }
      return depth;
    }

    const widthByDepth = {};
    allElements.forEach(el => {
      const tag = el.tagName;
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      const d = getDepth(el);
      if (d > maxDepth) maxDepth = d;
      widthByDepth[d] = (widthByDepth[d] || 0) + 1;
    });

    let maxWidth = 0, maxWidthLevel = 0;
    for (const [d, w] of Object.entries(widthByDepth)) {
      if (w > maxWidth) { maxWidth = w; maxWidthLevel = parseInt(d); }
    }

    // Top 10 most used tags
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return {
      totalElements: allElements.length,
      maxDepth,
      maxWidth,
      maxWidthLevel,
      bodyChildren: document.body ? document.body.children.length : 0,
      topTags,
    };
  });

  info(`Total DOM elements:   ${domMetrics.totalElements}`);
  info(`Maximum DOM depth:    ${domMetrics.maxDepth}`);
  info(`Maximum DOM width:    ${domMetrics.maxWidth} elements at depth ${domMetrics.maxWidthLevel}`);
  info(`Body direct children: ${domMetrics.bodyChildren}`);
  info('Top tags by count:');
  for (const [tag, count] of domMetrics.topTags) {
    info(`  <${tag}>: ${count}`);
  }

  if (domMetrics.totalElements < 800) PASS(`DOM has ${domMetrics.totalElements} elements (< 800, small)`);
  else if (domMetrics.totalElements < 1500) PASS(`DOM has ${domMetrics.totalElements} elements (< 1500, moderate)`);
  else if (domMetrics.totalElements < 3000) WARN(`DOM has ${domMetrics.totalElements} elements (1500-3000, large)`);
  else FAIL(`DOM has ${domMetrics.totalElements} elements (> 3000, very large)`);

  if (domMetrics.maxDepth < 15) PASS(`DOM depth is ${domMetrics.maxDepth} (< 15, good)`);
  else if (domMetrics.maxDepth < 25) WARN(`DOM depth is ${domMetrics.maxDepth} (15-25, moderate)`);
  else FAIL(`DOM depth is ${domMetrics.maxDepth} (> 25, deeply nested)`);

  // ------------------------------------------------------------------
  // 6.8 Check for memory usage baseline
  // ------------------------------------------------------------------
  header('6.8 — Memory Usage Baseline');

  // Use CDP for accurate memory metrics
  let memoryMeasured = false;
  try {
    const cdpSession = await page.context().newCDPSession(page);
    const metrics = await cdpSession.send('Performance.getMetrics');

    info('Chrome DevTools Protocol (CDP) Metrics:');
    const interestingMetrics = [
      'JSHeapUsedSize', 'JSHeapTotalSize', 'Nodes',
      'LayoutCount', 'RecalcStyleCount', 'LayoutDuration',
      'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration',
      'JSEventListeners', 'Documents', 'Frames'
    ];

    for (const m of metrics.metrics) {
      if (interestingMetrics.includes(m.name)) {
        let displayValue;
        if (m.name.includes('Size')) {
          displayValue = `${(m.value / 1024 / 1024).toFixed(2)} MB`;
        } else if (m.name.includes('Duration')) {
          displayValue = `${(m.value * 1000).toFixed(2)} ms`;
        } else {
          displayValue = String(m.value);
        }
        info(`  ${m.name}: ${displayValue}`);
      }
    }

    const jsHeapUsed = metrics.metrics.find(m => m.name === 'JSHeapUsedSize');
    const jsHeapTotal = metrics.metrics.find(m => m.name === 'JSHeapTotalSize');
    const nodes = metrics.metrics.find(m => m.name === 'Nodes');
    const listeners = metrics.metrics.find(m => m.name === 'JSEventListeners');

    if (jsHeapUsed) {
      const heapMB = jsHeapUsed.value / 1024 / 1024;
      if (heapMB < 10) PASS(`JS heap used: ${heapMB.toFixed(2)} MB (< 10 MB, efficient)`);
      else if (heapMB < 50) PASS(`JS heap used: ${heapMB.toFixed(2)} MB (< 50 MB, moderate)`);
      else WARN(`JS heap used: ${heapMB.toFixed(2)} MB (> 50 MB, high)`);
      memoryMeasured = true;
    }

    if (jsHeapTotal) {
      const totalMB = jsHeapTotal.value / 1024 / 1024;
      info(`JS heap total allocated: ${totalMB.toFixed(2)} MB`);
      if (jsHeapUsed) {
        const utilization = (jsHeapUsed.value / jsHeapTotal.value * 100).toFixed(1);
        info(`Heap utilization: ${utilization}%`);
      }
    }

    if (nodes) {
      info(`DOM Nodes (CDP): ${nodes.value}`);
    }
    if (listeners) {
      info(`Event Listeners: ${listeners.value}`);
      if (listeners.value < 100) PASS(`Event listeners: ${listeners.value} (< 100, efficient)`);
      else if (listeners.value < 500) PASS(`Event listeners: ${listeners.value} (< 500, moderate)`);
      else WARN(`Event listeners: ${listeners.value} (> 500, many — check for leaks)`);
    }
  } catch (e) {
    WARN(`CDP metrics not available: ${e.message}`);
  }

  // Also try performance.memory
  if (!memoryMeasured) {
    const perfMemory = await page.evaluate(() => {
      if (performance.memory) {
        return {
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
        };
      }
      return null;
    });

    if (perfMemory) {
      info(`performance.memory.usedJSHeapSize:  ${(perfMemory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
      info(`performance.memory.totalJSHeapSize: ${(perfMemory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`);
      info(`performance.memory.jsHeapSizeLimit: ${(perfMemory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`);
    }
  }

  // ================================================================
  //  FINAL SUMMARY
  // ================================================================
  header('FINAL SUMMARY');
  console.log(`  Total PASS: ${totalPass}`);
  console.log(`  Total WARN: ${totalWarn}`);
  console.log(`  Total FAIL: ${totalFail}`);
  console.log('');

  if (totalFail === 0 && totalWarn === 0) {
    console.log('  Result: ALL CHECKS PASSED — No issues found.');
  } else if (totalFail === 0) {
    console.log(`  Result: PASSED with ${totalWarn} warning(s) — review recommended.`);
  } else {
    console.log(`  Result: ${totalFail} FAILURE(S) and ${totalWarn} WARNING(S) — action needed.`);
  }
  console.log('='.repeat(70));

  await browser.close();
  console.log('\nDone.');
})();
