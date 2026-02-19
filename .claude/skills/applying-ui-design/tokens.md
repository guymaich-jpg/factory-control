# Design Tokens

## Contents
- Background tokens
- Text tokens
- Accent & status tokens
- Module colors
- Border radius & shadow
- Typography scale
- Icon sizing

---

## Background tokens

```css
--bg:         #0f0f1a   /* deepest layer — app root */
--bg-card:    #1a1a2e   /* cards, header, bottom nav */
--bg-input:   #16213e   /* form inputs, signature pad */
--bg-surface: #1f1f3a   /* elevated surfaces, user badge */
--border:     #2a2a4a   /* all 1px borders */
```

Layering rule (Whoop): backgrounds get progressively lighter as elements elevate. Never use a lighter background below a darker one.

---

## Text tokens

```css
--text:           #e8e8f0   /* primary — headings, values, data */
--text-secondary: #8888aa   /* labels, form labels, metadata */
--text-muted:     #555577   /* placeholders, hints, disabled */
```

---

## Accent & status tokens

```css
--accent:       #4f8cff   /* primary CTA, active nav, focus rings */
--accent-hover: #3a6fd8   /* pressed/hover state of accent */
--success:      #34d399   /* approved, positive metric */
--warning:      #fbbf24   /* pending, caution state */
--danger:       #f87171   /* destructive actions, errors, rejection */
```

Color assignment rules (Apple HIG + Whoop):
- **Blue (accent)**: primary actions only — Save, Submit, Next
- **Red (danger)**: destructive only — Delete, Reject. Never for decoration.
- **Green (success)**: confirmed/approved states. Not for primary actions.
- **Yellow (warning)**: transient states — pending, in-progress.

---

## Module colors

Each factory module has a dedicated color used for card accents and activity icons.

```css
--color-receiving:    #6366f1   /* raw materials */
--color-dates:        #f59e0b   /* date receiving */
--color-fermentation: #10b981   /* fermentation */
--color-dist1:        #3b82f6   /* distillation 1 */
--color-dist2:        #8b5cf6   /* distillation 2 */
--color-bottling:     #ec4899   /* bottling */
--color-inventory:    #14b8a6   /* inventory */
```

Usage: applied as `data-module` attribute on `.module-card`. Icon backgrounds use these at 20% opacity (`rgba`).

---

## Border radius & shadow

```css
--radius:    12px   /* cards, modals, welcome card */
--radius-sm:  8px   /* inputs, record items, badges */

/* Pill: border-radius: 20px — header buttons, toasts */
/* Circle: border-radius: 50% — FAB, avatar dots, toggle thumb */
/* Modal dialog: calc(var(--radius) + 4px) = 16px */
```

```css
--shadow: 0 4px 24px rgba(0,0,0,0.3)   /* cards */

/* FAB shadow */       0 4px 16px rgba(79,140,255,0.4)
/* Modal shadow */     0 20px 60px rgba(0,0,0,0.25)
/* Desktop frame */    0 0 60px rgba(0,0,0,0.4)
```

---

## Typography scale

Font families:
```css
/* Default */
font-family: 'Inter', 'Noto Sans Thai', -apple-system, sans-serif;

/* Thai content (lang="th") */
font-family: 'Noto Sans Thai', 'Inter', sans-serif;
```

Loaded weights: 400, 500, 600, 700 (both families via Google Fonts).

| Role | Size | Weight | Token color |
|---|---|---|---|
| Stat number (large) | 24px | 700 | `--text` |
| Screen/modal heading | 20px | 700 | `--text` |
| Header title | 15px | 700 | `--text` |
| Section header | 14px | 600 | `--text` |
| Body / record title | 14px | 600 | `--text` |
| Button text | 15px | 600 | white |
| Form label | 13px | 600 | `--text-secondary` |
| Detail row label | 13px | 500 | `--text-secondary` |
| Welcome card text | 13px | 400 | white |
| Stat label | 12px | 600 | `--text-secondary` |
| Tab button | 12px | 600 | `--text-secondary` / white active |
| Nav label | 10px | 500 | `--text-secondary` / `--accent` active |

**Rule**: never use weight < 500 in the UI. 400 is only acceptable for descriptive body copy inside cards.

---

## Icon sizing

Icons use Feather Icons (`data-feather` attribute).

| Context | Size |
|---|---|
| Bottom nav | 20×20px |
| Module card | 18×18px |
| Header buttons | 14–16px |
| Recent activity | 16×16px |
| FAB | 24×24px |
| Login illustration | 36×36px |
