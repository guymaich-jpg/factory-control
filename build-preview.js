#!/usr/bin/env node
// build-preview.js — Bundles all source files into a single preview.html
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

const css      = read('style.css');
const firebase = read('firebase.js');
const i18n     = read('i18n.js');
const auth     = read('auth.js');
const data     = read('data.js');
const script   = read('script.js');

const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="theme-color" content="#EFEFEC" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#1A1E1B" media="(prefers-color-scheme: dark)">
    <meta name="color-scheme" content="light dark">
    <meta name="description" content="Arava Distillery — Production Control System">
    <title>Arava Distillery · Preview</title>
    <script>
      (function() {
        var lang = localStorage.getItem('factory_lang') || 'he';
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
        var storedTheme = localStorage.getItem('factory_theme');
        if (storedTheme) {
          document.documentElement.setAttribute('data-theme', storedTheme);
        } else {
          var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        }
      })();
    </` + `script>
    <style>
${css}
    </style>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
        href="https://fonts.googleapis.com/css2?family=Trirong:ital,wght@0,400;0,600;0,700;1,400&family=Quattrocento+Sans:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap"
        rel="stylesheet">
    <script src="https://unpkg.com/feather-icons"></` + `script>
    <script>
${firebase}
    </` + `script>
    <script>
${i18n}
    </` + `script>
    <script>
${auth}
    </` + `script>
    <script>
${data}
    </` + `script>
</head>

<body>
    <div id="app"></div>
    <script>
${script}
    </` + `script>
</body>

</html>`;

const outPath = path.join(ROOT, 'preview.html');
fs.writeFileSync(outPath, html, 'utf8');

const sizeKB = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`preview.html generated (${sizeKB} KB)`);
