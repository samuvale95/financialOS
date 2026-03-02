# FinancialOS — Design System

## Philosophy
Dark-first, premium feel. Inspired by fintech leaders (Robinhood, Revolut, Monzo).
Minimal chrome, data-forward, smooth animations.

---

## Color Palette

### Background Layers
| Token | Hex | Usage |
|-------|-----|-------|
| `bg.primary` | `#0A0B0F` | Root background |
| `bg.secondary` | `#12141A` | Page sections |
| `bg.card` | `#1A1D26` | Cards, surfaces |
| `bg.elevated` | `#20243A` | Modals, sheets |
| `bg.overlay` | `#0A0B0F99` | Dimmed overlays |

### Accent & Brand
| Token | Hex | Usage |
|-------|-----|-------|
| `accent.primary` | `#6C63FF` | CTAs, selected tabs |
| `accent.secondary` | `#8B82FF` | Hover states |
| `accent.glow` | `#6C63FF33` | Shadow, glow effects |

### Semantic Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `semantic.success` | `#00D68F` | Income, positive delta |
| `semantic.warning` | `#FFB347` | Budget ~70-90% |
| `semantic.danger` | `#FF6B6B` | Over budget, losses |
| `semantic.info` | `#4FC3F7` | Neutral info |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `text.primary` | `#FFFFFF` | Headlines, key data |
| `text.secondary` | `#8F95A3` | Labels, subtitles |
| `text.muted` | `#4A5166` | Placeholders, disabled |
| `text.accent` | `#6C63FF` | Links, interactive |

---

## Gradients

```
NetWorth Hero: #6C63FF → #4FC3F7 (diagonal 135°)
Income:        #00D68F → #00A36C
Expense:       #FF6B6B → #CC4444
Card Shine:    transparent → #FFFFFF08
```

---

## Typography

Font family: **Inter** (via expo-google-fonts or system)

| Scale | Size | Weight | Line Height |
|-------|------|--------|-------------|
| `display` | 32 | 700 | 38 |
| `h1` | 28 | 700 | 34 |
| `h2` | 22 | 600 | 28 |
| `h3` | 18 | 600 | 24 |
| `body` | 16 | 400 | 22 |
| `bodyMedium` | 16 | 500 | 22 |
| `caption` | 13 | 400 | 18 |
| `micro` | 11 | 500 | 14 |

---

## Spacing (8pt grid)

```
xs:  4px
sm:  8px
md:  12px
lg:  16px
xl:  24px
2xl: 32px
3xl: 48px
```

---

## Border Radius

```
sm:   6px
md:   12px
lg:   16px
xl:   24px
full: 9999px
```

---

## Shadows

```
card:     0 4px 16px rgba(0,0,0,0.4)
elevated: 0 8px 32px rgba(0,0,0,0.6)
glow:     0 0 20px rgba(108,99,255,0.3)
```

---

## Components

### Card
- Background: `bg.card` (#1A1D26)
- Border: 1px solid rgba(255,255,255,0.06)
- Radius: 16px
- Padding: 16px

### Card.Elevated
- Background: `bg.elevated` (#20243A)
- Shadow: elevated
- Radius: 20px

### Badge (Pill)
- Height: 24px
- Padding H: 10px
- Radius: full
- Font: micro (11px, 500)

### Button
- Primary: accent.primary bg, 14px bold, radius 12px, h 48px
- Secondary: transparent bg, accent.primary border, accent.primary text
- Ghost: no bg, no border, accent.primary text

### ProgressBar (Semaforo)
- Track: #FFFFFF12
- Fill green: success (<70%)
- Fill yellow: warning (70-90%)
- Fill red: danger (>90%)
- Height: 6px, radius full

---

## Budget Semaforo Logic
- Verde (safe):    0% – 69%
- Giallo (caution): 70% – 89%
- Rosso (over):    90% – 100%+

---

## Tab Bar
- Background: #12141A with blur
- Border top: rgba(255,255,255,0.06)
- Icon size: 24px
- Active: accent.primary
- Inactive: text.muted (#4A5166)
- Label font: micro (11px)

---

## Animations
- Page transition: fade + slide (300ms, easing: ease-out)
- Card press: scale 0.97 (150ms)
- Tab switch: icon bounce (spring)
- Number counter: 800ms ease-out
- Shimmer skeleton: 1.2s loop

---

## Icons (Ionicons)
- Dashboard: `home` / `home-outline`
- Spese: `receipt` / `receipt-outline`
- Import: `cloud-upload` / `cloud-upload-outline`
- Portfolio: `trending-up` / `trending-up-outline`
- Coach: `bulb` / `bulb-outline`
