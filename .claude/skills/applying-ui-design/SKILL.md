---
name: applying-ui-design
description: Applies the Factory Control app's design system when building or modifying UI. Covers design philosophy, CSS tokens, component patterns, layout rules, and typography. Use when adding new screens, components, or styles; when asked to make UI changes; or when ensuring visual consistency with the existing app.
---

# Factory Control UI Design System

## Core philosophy

Three principles govern every UI decision:

**1. Clarity (Apple)** — Every element is immediately understandable. Content takes priority over chrome. If a control doesn't earn its visual weight, remove it.

**2. Data deference (Whoop)** — The UI exists to surface data, not to impress. Metrics are the hero. Dark backgrounds recede so numbers and status indicators pop.

**3. Progressive disclosure** — Show the summary. Let the user pull for depth. Never dump all data at once. Hierarchy is: stat → list → detail → edit.

---

## Design tokens (quick reference)

All values are CSS custom properties defined in `:root` in `style.css`.

### Colors

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0f0f1a` | App background |
| `--bg-card` | `#1a1a2e` | Cards, header, bottom nav |
| `--bg-input` | `#16213e` | Form inputs |
| `--bg-surface` | `#1f1f3a` | Elevated surfaces |
| `--border` | `#2a2a4a` | All borders |
| `--text` | `#e8e8f0` | Primary text |
| `--text-secondary` | `#8888aa` | Labels, metadata |
| `--text-muted` | `#555577` | Placeholders, hints |
| `--accent` | `#4f8cff` | Primary actions, active states |
| `--accent-hover` | `#3a6fd8` | Hover/pressed accent |
| `--success` | `#34d399` | Approved, positive states |
| `--warning` | `#fbbf24` | Caution, pending |
| `--danger` | `#f87171` | Destructive actions, errors |

Full token list: see [tokens.md](tokens.md)

### Typography

Font stack: `'Inter', 'Noto Sans Thai', -apple-system, sans-serif`

| Use | Size | Weight |
|---|---|---|
| Large stat / heading | 24px | 700 |
| Screen title | 20px | 700 |
| Section header | 14–15px | 600–700 |
| Body / record title | 14px | 600 |
| Labels, metadata | 12–13px | 500–600 |
| Nav labels | 10px | 500 |

Rule: **never use font-weight below 500**. Thin weights disappear on dark backgrounds (Apple HIG).

---

## Component patterns

See [components.md](components.md) for full specs.

**Quick rules:**
- All touch targets: **min 48×48px** (Apple HIG)
- Active press: `transform: scale(0.97)` — tactile feedback without distraction
- Disabled state: `opacity: 0.5; pointer-events: none`
- Focus state: border-color → `var(--accent)`
- Error state: border-color → `var(--danger)` + `.field-error-msg` below input

**Button hierarchy:**
1. `.btn-primary` — one per screen, accent background
2. `.btn-secondary` — surface background + border
3. `.btn-danger` — destructive only (red, Apple HIG)

**Status badges:**
- Approved → `var(--success)` green
- Pending → `var(--warning)` yellow
- Not approved → `var(--danger)` red

---

## Layout & spacing

See [layout.md](layout.md) for full specs.

**Spacing scale:** 4 · 8 · 12 · 14 · 16 · 20 · 24px

**App structure:**
```
app-header (sticky top, 52px min, z-index: 100)
screen-content (flex: 1, overflow-y: auto, padding: 16px 16px 100px)
bottom-nav (sticky bottom, z-index: 100)
```

**Grid:**
- Module cards: 2-col mobile → 3-col at 768px+
- Stats row: always 3-col
- Max app width: 600px (phone-first)

**Breakpoints:** 481px · 768px · 1024px

---

## Animation rules

```css
/* Screen entry — always use one of these */
fadeInUp: translateY(12px) → 0, opacity 0→1, 0.22s
slideInFromRight: translateX(30%) → 0, 0.25s  /* navigate forward */
slideInFromLeft: translateX(-30%) → 0, 0.25s  /* navigate back */
```

**Whoop principle**: motion reveals information, it doesn't decorate. Every animation must communicate hierarchy or navigation direction.

- Transition duration: 0.2–0.3s max
- Toast appears from bottom, disappears after 3s
- FAB entrance uses `fadeInUp`

---

## RTL & i18n

- Hebrew (`lang="he"`): `dir="rtl"`, flex-direction reverses, select arrow flips to left
- Thai (`lang="th"`): font-family prioritizes `Noto Sans Thai`
- All spacing/margin rules must work in both LTR and RTL

---

## What NOT to do

- No light/light-gray backgrounds — dark theme only
- No font-weight 300 or 400 for UI labels
- No more than one accent color per screen section (Whoop: red/accent is strategic)
- No decorative animations — every motion must carry meaning (Apple: deference)
- No dumping all data at once — use progressive disclosure (Whoop)
- No touch targets below 48px height
