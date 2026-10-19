---
name: Super Agents
description: Operator's Ledger. Paper ground, green ink, one ochre accent, tabular numbers.
colors:
  paper: "#f6f3eb"
  paper-raised: "#fcfbf7"
  wash: "#ebede3"
  line: "#d5d9cc"
  line-strong: "#a9b1a6"
  ink: "#1b2a24"
  ink-muted: "#5b6a62"
  green: "#234f45"
  green-deep: "#17382f"
  green-wash: "#dfe9e0"
  ochre: "#9a6a16"
  ochre-wash: "#f3e7cc"
  ok: "#2b6a44"
  ok-wash: "#dcebdc"
  bad: "#9b2f1f"
  bad-wash: "#f6dcd5"
  dark-ground: "#121a16"
  dark-raised: "#182420"
  dark-wash: "#20302a"
  dark-line: "#33463d"
  dark-ink: "#e4e9e0"
  dark-ink-muted: "#a4b2a8"
  dark-green: "#a3c3b2"
  dark-ochre: "#dcb66b"
  dark-ok: "#9fcaa8"
  dark-bad: "#eba08f"
typography:
  display:
    fontFamily: "var(--font-sans), 'IBM Plex Sans', 'Segoe UI', sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "var(--font-sans), 'IBM Plex Sans', 'Segoe UI', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontFamily: "var(--font-sans), 'IBM Plex Sans', 'Segoe UI', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "var(--font-sans), 'IBM Plex Sans', 'Segoe UI', sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "var(--font-sans), 'IBM Plex Sans', 'Segoe UI', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.02em"
  figure:
    fontFamily: "var(--font-sans), 'IBM Plex Sans', 'Segoe UI', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    fontFeature: "'tnum' 1"
  code:
    fontFamily: "var(--font-mono), 'IBM Plex Mono', ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  xxl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.green}"
    textColor: "{colors.paper-raised}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.green-deep}"
    textColor: "{colors.paper-raised}"
  button-secondary:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
  tag:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "2px 6px"
  tag-attention:
    backgroundColor: "{colors.ochre-wash}"
    textColor: "{colors.ochre}"
  tag-ok:
    backgroundColor: "{colors.ok-wash}"
    textColor: "{colors.ok}"
  tag-bad:
    backgroundColor: "{colors.bad-wash}"
    textColor: "{colors.bad}"
  section:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "24px 0"
  link-card:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: Super Agents

## Overview

**Creative North Star: "The Operator's Ledger"**

A ledger is a working document: ruled lines, a calm paper ground, figures set in columns that line up, a note in the margin where something needs attention. Nothing on the page performs. The design earns trust by precision: every number has a date and a source beside it, every unknown is spelled out, and attention is a single ochre mark used so rarely that it still means something.

Density is deliberate. Dashboards are read in a minute on a phone between other things, so the page is sections of ruled rows rather than grids of same-size cards. The documentation is a reference book: the world lives in the masthead, the navigation rail, headings and code blocks, and the reading column stays plain, at a real measure, in a reading face.

**Key characteristics:**
- One family, IBM Plex Sans, carries everything; Plex Mono only for code and identifiers.
- Warm paper ground with deep green ink; the same palette in dark mode moves to a green-black ground.
- Ruled lists and tables instead of card scaffolds; a card exists only when it is a link target.
- Tabular numerals, right-aligned amounts, currency written before the figure.
- Flat surfaces; depth from tonal layering and 1 px lines, never from shadows at rest.

## Colors

A paper-and-ink palette with one accent for attention and two semantic states.

### Primary
- **Ledger Green** (#234f45): links, primary actions, the current navigation item, focus rings, chart lines. Deep variant (#17382f) for hover and pressed. Green Wash (#dfe9e0) for the selected row and the current sidebar item.

### Tertiary
- **Margin Ochre** (#9a6a16) on Ochre Wash (#f3e7cc): the one attention accent. "unknown", "unverified", "due soon", the first open task, a stale notice. Never decorative.

### Neutral
- **Paper** (#f6f3eb): page ground. **Paper Raised** (#fcfbf7): panels, tables, the reading column of the docs. **Wash** (#ebede3): table heads, the second neutral layer (sidebar, toolbars).
- **Line** (#d5d9cc) for rules and borders; **Line Strong** (#a9b1a6) for the total rule under a column of figures.
- **Ink** (#1b2a24) for text; **Ink Muted** (#5b6a62) for labels, dates, sources (tinted from the green, never gray).

### Semantic
- **Ok** (#2b6a44 on #dcebdc): funded, done, fresh. **Bad** (#9b2f1f on #f6dcd5): overdue, stale data, errors.

### Dark mode
Ground #121a16, raised #182420, wash #20302a, line #33463d, ink #e4e9e0, muted #a4b2a8, green #a3c3b2, ochre #dcb66b, ok #9fcaa8, bad #eba08f. Same roles, same rarity.

### Named Rules
**The One Accent Rule.** Ochre touches at most a tenth of any screen. If two things on a page are ochre, decide which one actually needs the reader.
**The Tinted Neutral Rule.** No pure gray and no pure black anywhere; every neutral is mixed from the green.
**The Meaning Rule.** Colour never carries a meaning alone: a status is always also a word (tag text), a trend is always also a number.

## Typography

**Display, body and label font:** IBM Plex Sans, self-hosted through `next/font` (fallback "Segoe UI", sans-serif).
**Code font:** IBM Plex Mono (fallback ui-monospace).

**Character:** an engineer's sans with a slight ink trap, plain enough to disappear in a table and sharp enough to carry a headline at 600. Numbers are set with `font-variant-numeric: tabular-nums` everywhere they can be compared.

### Hierarchy (fixed rem scale, ratio ≈1.2, no fluid clamps on product surfaces)
- **Display** (600, 2.25rem, 1.1, -0.02em): the page title on a dashboard, once per page.
- **Headline** (600, 1.5rem, 1.2): section titles ("Entities", "Debt and interest").
- **Title** (600, 1.125rem, 1.3): entity and panel names, table captions.
- **Body** (400, 0.9375rem, 1.55): dashboard prose; docs body is 1rem at a 65–75ch measure.
- **Label** (500, 0.75rem, 1.4, +0.02em, sentence case): column heads, "as of" lines, sources, tags. Never uppercase tracking as a kicker above a heading.
- **Figure** (500, 1.5rem, tnum): a ledger amount. Totals step to 1.75rem and get the strong rule.

### Named Rules
**The No-Kicker Rule.** Headings carry their own weight; there is no eyebrow label above them. Context goes after the heading as a muted line.
**The Ledger Line Rule.** A figure sits right-aligned on its own row: label left, amount right, date and source underneath in Label. Never a big number floating over a small label in a tile.

## Layout

Content column max 1120 px, centred, 24 px side gutters on desktop and 16 px on phone. Dashboard sections are stacked, each a headline followed by ruled rows; two-column arrangements only above 900 px and only for rows that compare (cover vs claims). Tables scroll horizontally inside their own wrapper with the first column sticky; the page never scrolls sideways. Spacing scale 4 / 8 / 16 / 24 / 40 / 64; more space above a headline than below it. Sticky in-page section navigation on dashboards; the Nextra sidebar and table of contents stay standard on docs.

Responsive behaviour is structural: columns collapse, the section nav becomes a horizontal scroll strip with 44 px targets, tables keep their columns and scroll.

## Elevation & Depth

Flat by default. Depth is tonal: paper → paper raised → wash, separated by 1 px lines. The only shadow in the system is for floating UI (search, menus, popovers): `0 12px 32px -16px rgba(27, 42, 36, 0.45)`, offset and soft, never a zero-offset halo.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest; a shadow means something floats.

## Shapes

Radius 4 px on tags and inputs, 8 px on buttons and inline notices, 12 px on panels and link cards. No pills, no 16–20 px cards, no coloured side-borders of any thickness above 1 px. Charts are drawn with 2 px strokes, square caps, one dashed zero line, tabular axis labels; no gradient fills, no sparklines standing in for content.

## Components

- **Link**: ink or green, underline offset 4 px on hover, 3 px green focus ring with 3 px offset.
- **Buttons**: primary green on paper, secondary paper with a line; 40 px tall, label type, states default / hover / focus / active / disabled (opacity .45, cursor not-allowed) / loading (label swap, no spinner in content).
- **Tag**: label type, sentence case, 2 × 6 px, 4 px radius; neutral, attention (ochre), ok, bad. The word is the meaning.
- **Ledger row**: grid `1fr auto`, 10 px vertical padding, 1 px line above; label, figure right, muted date and source line below spanning both columns.
- **Table**: wash head in label type, 1 px lines, numeric columns right-aligned tabular, first column sticky on scroll, total row with the strong rule; 720 px minimum width inside a scrolling wrapper.
- **Notice**: 8 px radius, wash ground with a 1 px line; stale and error notices use bad on bad-wash with the fix and owner named in the text; `role="status"` or `role="alert"` as appropriate.
- **Section nav**: horizontal list of links, current item underlined in green, sticky under the navbar on dashboards.
- **Link card** (hub only): raised paper, 12 px radius, 1 px line, whole card is the link, hover moves the line to green; no icon tile above the heading.
- **Chart**: inline SVG, `role="img"` with a sentence label, green line, dashed zero line, first and last date and the max and min labelled in tabular label type; honours reduced motion (no animation anyway).
- **Docs frame**: navbar wordmark in 600, sidebar current item on green wash with ink text, headings in Plex Sans 600, code blocks on wash with Plex Mono, callouts as notices. The reading column is Paper Raised at 1rem/1.65, measure 70ch.

## Do's and Don'ts

- Do write the date and source next to every figure; do spell out "unknown"; do keep entities and currencies on separate rows.
- Do keep one ochre mark per screen and let a word carry the status.
- Do use the same control vocabulary on every dashboard: same button shape, same tag, same table.
- Don't use Arial, Inter, system display faces, gradient text, glass, icon tiles above headings, section numbers, kickers, or cards nested in cards.
- Don't animate on load; motion only confirms a state change, 150–250 ms, ease-out, and is removed under `prefers-reduced-motion`.
- Don't sum across entities, round away cents that exist, or show a 0 where a document is missing.
