# Component Patterns

## Contents
- Buttons
- Cards
- Forms
- Navigation
- Modals
- Lists & records
- Badges & pills
- Special components

---

## Buttons

### Base rules (Apple HIG)
- Min height: **48px** — all interactive elements
- Active press: `transform: scale(0.97)` — tactile without animation noise
- Disabled: `opacity: 0.5; pointer-events: none`
- One `.btn-primary` per screen — hierarchy demands a single clear CTA

### Button classes

```html
<!-- Primary CTA -->
<button class="btn btn-primary">Save Record</button>

<!-- Secondary action -->
<button class="btn btn-secondary">Cancel</button>

<!-- Destructive (Apple: red = destructive only) -->
<button class="btn btn-danger">Delete</button>

<!-- Positive confirmation -->
<button class="btn btn-success">Approve</button>

<!-- Loading state -->
<button class="btn btn-primary is-loading" disabled>Saving...</button>
```

### Loading state
`.is-loading` adds a spinning pseudo-element (`btnSpin` keyframe). Always set `disabled` alongside.

### FAB (Floating Action Button)
```html
<button class="fab-add" aria-label="Add record">
  <i data-feather="plus"></i>
</button>
```
- 52×52px circle, `var(--accent)` background
- Fixed bottom-right, `z-index: 200`
- Shadow: `0 4px 16px rgba(79,140,255,0.4)`

---

## Cards

### Module card
```html
<div class="module-card" data-module="fermentation">
  <div class="mc-icon"><i data-feather="droplet"></i></div>
  <div class="mc-info">
    <div class="mc-title">Fermentation</div>
    <div class="mc-count">12 records</div>
  </div>
</div>
```
- Top accent bar: 3px, module color from `data-module`
- Icon bg: module color at 20% opacity
- Border-radius: `var(--radius)` (12px)
- Press: `scale(0.97)`

### Stat card
```html
<div class="stat-card">
  <div class="sc-value">247</div>
  <div class="sc-label">Total Batches</div>
</div>
```
- Always in a 3-column grid (`.stats-row`)
- Value: 24px/700, Label: 12px/600 `--text-secondary`

### Welcome card
- Gradient: `135deg, var(--accent), #8b5cf6`
- All text white
- Used only on the dashboard — not reused elsewhere (Apple: deference)

### Detail card
```html
<div class="detail-card">
  <div class="detail-row">
    <span class="dr-label">Batch ID</span>
    <span class="dr-value">FC-2024-001</span>
  </div>
</div>
```

---

## Forms

### Structure
```html
<div class="form-group">
  <label class="form-label">
    Field Name <span class="req">*</span>
  </label>
  <input type="text" class="form-input" placeholder="...">
  <!-- on error: -->
  <div class="field-error-msg">This field is required</div>
</div>
```

### Input rules
- Padding: `12px 14px`
- Min-height: 48px
- Background: `var(--bg-input)`
- Border: `1px solid var(--border)`
- Border-radius: `var(--radius-sm)` (8px)
- Focus: border-color → `var(--accent)`
- Error: add `.field-error` class → border-color → `var(--danger)`
- Font-size: 16px (prevents iOS auto-zoom)

### Select
- Custom arrow: SVG background-image, positioned `right 14px center`
- Padding-right: 36px to avoid text under arrow
- RTL: arrow moves to left side

### Toggle switch
```html
<label class="toggle-switch">
  <input type="checkbox">
  <span class="slider"></span>
</label>
```
- Off: `var(--border)` track
- On: `var(--success)` track
- Thumb: 22px white circle, `transition: 0.3s`

### Signature pad
```html
<div class="sig-pad-wrapper">
  <canvas id="sigCanvas"></canvas>
  <button class="sig-clear-btn">Clear</button>
</div>
```
- Canvas height: 120px
- Background: `var(--bg-input)`
- Clear button: absolute top-right, 6px inset

---

## Navigation

### App header (`.app-header`)
- Height: 52px min
- Padding: `8px 12px` + `env(safe-area-inset-top)`
- Background: `var(--bg-card)`
- Border-bottom: `1px solid var(--border)`
- `position: sticky; top: 0; z-index: 100`
- Layout: `[back/left actions] [title] [right actions]`

### Bottom nav (`.bottom-nav`)
- `position: sticky; bottom: 0; z-index: 100`
- Background: `var(--bg-card)`
- Border-top: `1px solid var(--border)`
- Padding: `8px 0` + `env(safe-area-inset-bottom)`
- Items: flex:1, column (icon + label)
- Active item: color → `var(--accent)`

### Tab bar
```html
<div class="tab-bar">
  <button class="tab-btn active">Batches</button>
  <button class="tab-btn">Reports</button>
</div>
```
- Background: `var(--bg-card)`, padding 4px, border-radius 8px
- Active tab: background `var(--accent)`, white text
- Inactive: `--text-secondary`
- Apple rule: tab bar items navigate — they do not open modals or trigger actions

---

## Modals

### Manager password modal
- Backdrop: `rgba(0,0,0,0.55)` + `backdrop-filter: blur(4px)`
- Dialog: max-width 360px, `var(--bg-card)`, border-radius 16px
- Entry animation: `fadeIn` (translateY(8px) → 0)
- Shadow: `0 20px 60px rgba(0,0,0,0.25)`
- Z-index: 9999

### Modal anatomy
```html
<div class="manager-pwd-modal">
  <div class="mpd-dialog">
    <div class="mpd-title"><i data-feather="lock"></i> Approval Required</div>
    <div class="mpd-subtitle">Manager password needed to continue.</div>
    <!-- form content -->
    <div class="mpd-actions">
      <button class="btn btn-secondary">Cancel</button>
      <button class="btn btn-primary">Confirm</button>
    </div>
  </div>
</div>
```

---

## Lists & records

### Record item (`.record-item`)
```html
<div class="record-item">
  <div class="ri-top">
    <span class="ri-title">Batch FC-001</span>
    <span class="ri-date">Jan 15</span>
  </div>
  <div class="ri-details">
    <span class="ri-meta">120L · Wheat</span>
    <span class="ri-badge approved">Approved</span>
  </div>
</div>
```
- Padding: 14px
- Border: `1px solid var(--border)`, border-radius 8px
- Press: `scale(0.98)`

Badge variants:
- `.ri-badge.approved` → `var(--success)`
- `.ri-badge.pending` → `var(--warning)`
- `.ri-badge.not-approved` → `var(--danger)`

### Recent activity item
- Flex, 12px gap
- Icon background: module color at 20% opacity, 32px circle
- Press: `scale(0.98)`

---

## Badges & pills

### Role pill
```html
<span class="role-pill role-pill-manager">Manager</span>
<span class="role-pill role-pill-worker">Worker</span>
<span class="role-pill role-pill-admin">Admin</span>
```
- 10px font, weight 700, uppercase
- Manager: light blue bg, blue text
- Worker: light green bg, green text
- Admin: light purple bg, purple text

### User badge
```html
<div class="user-badge">
  <span class="role-dot"></span>
  <span>Sarah M.</span>
</div>
```
- Padding: `4px 10px`, border-radius 20px
- Background: `var(--bg-surface)`
- Role dot: 8px circle, color matches role

---

## Toast notifications

```js
showToast('Record saved successfully');
```
- Fixed bottom-center, above bottom nav (80px from bottom)
- Background: `var(--success)`
- Animation: slides up from 100px → 0, fades in
- Auto-dismiss: 3 seconds
- Border-radius: 24px (pill shape)
- Only one toast at a time
