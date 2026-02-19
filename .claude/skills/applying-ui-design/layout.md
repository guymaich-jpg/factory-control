# Layout & Spacing

## Contents
- Spacing scale
- App shell structure
- Grid system
- Responsive breakpoints
- Safe area handling
- Animation reference
- RTL layout rules

---

## Spacing scale

```
4px   micro gaps (icon + text, dot + label)
8px   tight gaps (header items, time range inputs)
12px  standard gaps (card grid, stats grid, list gaps)
14px  form input padding
16px  standard section padding, form group margin-bottom
20px  card padding (welcome card)
24px  section separation
28px  large padding
100px screen-content bottom padding (space above sticky nav)
```

Use multiples of 4. Never invent values outside this scale.

---

## App shell structure

```
body
└── #app  (max-width: 600px, full-height flex column)
    ├── .app-header      sticky top, 52px min, z-index: 100
    ├── .screen-content  flex: 1, overflow-y: auto
    │                    padding: 16px 16px 100px
    └── .bottom-nav      sticky bottom, z-index: 100
```

Screen content always gets `padding-bottom: 100px` so content is not hidden behind the fixed nav.

### Login screen
No header or bottom nav. Centered vertically. Max-width 400px for form.

---

## Grid system

### Module cards grid
```css
.module-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr); /* mobile */
  gap: 12px;
}

@media (min-width: 768px) {
  .module-grid { grid-template-columns: repeat(3, 1fr); }
}
```

### Stats row
```css
.stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
```
Always 3 columns regardless of viewport — stat cards are designed for this.

---

## Responsive breakpoints

| Breakpoint | Context | Changes |
|---|---|---|
| default | Mobile (320px+) | 2-col cards, full-width form |
| 481px | Larger phones | App frame gets border + box-shadow |
| 768px | Tablets | Module grid → 3 columns; login form wider |
| 1024px | Desktop | App centered on screen; height: 90vh; max-height: 900px; border-radius: 24px |

```css
/* 481px — app frame appears */
@media (min-width: 481px) {
  #app {
    max-width: 480px;
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
    box-shadow: 0 0 40px rgba(0,0,0,0.3);
  }
}

/* 1024px — desktop centering */
@media (min-width: 1024px) {
  body { display: flex; align-items: center; justify-content: center; }
  #app  { height: 90vh; max-height: 900px; border-radius: 24px; }
}
```

---

## Safe area handling

Always account for notched devices (iOS safe areas):

```css
/* Header */
padding-top: max(8px, env(safe-area-inset-top));

/* Bottom nav */
padding-bottom: max(8px, env(safe-area-inset-bottom));
```

---

## Animation reference

### Screen transitions
```css
/* Default screen entry */
@keyframes fadeInUp {
  from { transform: translateY(12px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
/* duration: 0.22s */

/* Navigate forward (deeper) */
@keyframes slideInFromRight {
  from { transform: translateX(30%); opacity: 0; }
  to   { transform: translateX(0);   opacity: 1; }
}
/* duration: 0.25s */

/* Navigate back */
@keyframes slideInFromLeft {
  from { transform: translateX(-30%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
/* duration: 0.25s */
```

Apple + Whoop rule: direction implies hierarchy.
- Right → going deeper into a record
- Left → going back up

### Modal entry
```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* duration: 0.2s */
```

### General transition values
- Border color, opacity: `0.2s`
- Transform (press): `0.1–0.15s`
- Toggle slider: `0.3s`
- Toast slide: `0.3s`

---

## RTL layout rules

Applied when `html[dir="rtl"]` is set (Hebrew language).

```css
/* Header reverses direction */
.app-header { flex-direction: row-reverse; }

/* Select arrow moves to left side */
.form-select {
  background-position: left 14px center;
  padding-right: 14px;
  padding-left: 36px;
}

/* Required asterisk margin flips */
.req { margin-left: 0; margin-right: 2px; }

/* Language toggle repositions */
.lang-toggle { right: auto; left: 16px; }
```

When adding new flex layouts, always verify they work correctly in both LTR and RTL.
