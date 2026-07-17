---
name: Chatbot Experiments
colors:
  background: '#ffffff'
  foreground: '#171717'
  card: '#ffffff'
  card-foreground: '#171717'
  popover: '#ffffff'
  popover-foreground: '#171717'
  primary: '#171717'
  primary-foreground: '#fafafa'
  secondary: '#f5f5f5'
  secondary-foreground: '#171717'
  muted: '#f5f5f5'
  muted-foreground: '#737373'
  accent: '#f5f5f5'
  accent-foreground: '#171717'
  destructive: '#ef4343'
  destructive-foreground: '#fafafa'
  border: '#e6e6e6'
  input: '#e6e6e6'
  ring: '#171717'
  heading: '#0d0d0d'
  sidebar: '#ffffff'
  sidebar-foreground: '#3f3f46'
  sidebar-primary: '#18181b'
  sidebar-primary-foreground: '#fafafa'
  sidebar-accent: '#f4f4f5'
  sidebar-accent-foreground: '#18181b'
  sidebar-border: '#e5e7eb'
  sidebar-ring: '#3b82f6'
  assistant-wait-indicator: '#45c5d3'
  assistant-wait-indicator-highlight: '#c9f2f8'
  assistant-wait-indicator-ring: '#2a909d'
typography:
  hero-display:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '300'
    lineHeight: 54px
    letterSpacing: -0.03em
  heading:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.02em
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: '0'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  label:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: '0'
  code:
    fontFamily: Geist Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
rounded:
  sm: calc(0.5rem - 4px)
  md: calc(0.5rem - 2px)
  lg: 0.5rem
  xl: 0.75rem
  2xl: 1rem
  3xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  chat-transcript-width: 768px
  chat-hero-width: 672px
  app-canvas-width: 1280px
---

# Design System: Chatbot Experiments

## 1. Visual Theme & Atmosphere

Chatbot Experiments is a quiet, tool-like workspace for comparing prompts, model behavior, evaluations, and next workflow decisions. The visual language is monochrome and zinc-neutral: a white canvas, almost-black foreground text, pale gray hover surfaces, and thin border lines that let the conversation content stay primary. The product deliberately avoids decorative brand color except for destructive states and the assistant waiting indicator, which uses a small teal orb to communicate active machine work without turning the whole interface into a colorful dashboard.

The atmosphere is closest to a focused AI chat lab: spacious in the empty state, compact in the sidebar, and readable in the transcript. The main chat area sits on centered rails with enough breathing room for long-form assistant output, while controls stay soft, rounded, and low-shadow. Motion is short and functional—150ms interaction feedback, subtle active scaling, and paced streaming animations that make responses feel live while respecting reduced-motion preferences.

> 💡 **Design token**: a named value like `--background` or `--primary` that components reuse instead of hard-coding colors. Tokens make theme changes safer because the role stays stable even when the raw color changes.

## 2. Color Palette & Roles

The palette comes from `packages/ui/src/styles/tokens.css` and is wired into Tailwind through `apps/web/tailwind.config.ts`. Use the semantic Tailwind classes (`bg-background`, `text-foreground`, `border-border`, `bg-sidebar`, `text-muted-foreground`) rather than raw zinc classes.

### Primary Foundation

| Descriptive name | Token | Hex | Role |
| --- | --- | --- | --- |
| **Clean White Canvas** | `--background`, `--card`, `--popover`, `--sidebar` | `#ffffff` | App background, card surfaces, composer/search popovers, and sidebar base in light mode. |
| **Near-Black Ink** | `--foreground`, `--primary`, `--card-foreground`, `--popover-foreground` | `#171717` | Primary text, primary button fill, important icons, and foreground on light surfaces. |
| **Soft Zinc Wash** | `--secondary`, `--muted`, `--accent` | `#f5f5f5` | Secondary surfaces, user message bubbles, sidebar hover equivalents, and low-emphasis filled UI. |
| **Hairline Warm Gray** | `--border`, `--input` | `#e6e6e6` | Default borders, input/composer outlines, table separators, markdown blockquote borders. |
| **Dark Mode Black Canvas** | `--background` in `.dark` | `#0a0a0a` | Dark theme page/card/popover base. |
| **Dark Mode Raised Gray** | `--secondary`, `--muted`, `--accent` in `.dark` | `#262626` | Dark theme secondary surfaces and hover states. |

### Accent & Interactive

| Descriptive name | Token | Hex | Role |
| --- | --- | --- | --- |
| **Inverted Ink Primary** | `--primary` / `--primary-foreground` | `#171717` / `#fafafa` | Primary actions such as send buttons; solid black with nearly white text. |
| **Sidebar Ink Block** | `--sidebar-primary` | `#18181b` | Logo/icon tile in the sidebar header. |
| **Sidebar Hover Frost** | `--sidebar-accent` | `#f4f4f5` | Sidebar hover and selected-row background. |
| **Focus Blue Ring** | `--sidebar-ring` | `#3b82f6` | Sidebar-specific focus ring; most other rings use near-black `--ring`. |
| **Assistant Teal Orb** | `--assistant-wait-indicator` | `#45c5d3` | Animated assistant waiting indicator only. |
| **Assistant Ice Highlight** | `--assistant-wait-indicator-highlight` | `#c9f2f8` | Dot highlight and diagonal shimmer across the thinking orb. |
| **Legacy Deep QA Teal** | `.deep-qa-ai-button` hard-coded color | `#45c3d2` | Legacy pill button border/text; visually near the assistant teal. |

### Typography & Text Hierarchy

| Descriptive name | Token/class | Hex | Role |
| --- | --- | --- | --- |
| **Primary Ink** | `text-foreground`, `text-primary` | `#171717` | Body text, headings, user message text, button/link text. |
| **Quiet Metadata Gray** | `--muted-foreground` | `#737373` | Helper copy, starter prompt descriptions, thought labels, footer disclaimer, placeholders. |
| **Sidebar Text Zinc** | `--sidebar-foreground` | `#3f3f46` | Sidebar labels and icon buttons. |
| **Heading Ink** | `--heading-color` | `#0d0d0d` | Intended heading color token, slightly stronger than body foreground. |
| **Disabled/Secondary Opacity** | opacity overlays | token + opacity | Controls commonly use `/60`, `/70`, disabled `opacity-50` or `opacity-60`. |

### Functional States

| Descriptive name | Token | Hex | Role |
| --- | --- | --- | --- |
| **Clear Error Red** | `--destructive` | `#ef4343` | Error text, destructive buttons, delete hover states. |
| **Error on Red** | `--destructive-foreground` | `#fafafa` | Text/icons on destructive fills. |
| **Subtle Error Wash** | `hover:bg-destructive/10` | transparent red | Delete icon hover backgrounds. |
| **Focus Ink Ring** | `--ring` | `#171717` | Primary focus rings and input outlines in light mode. |
| **Backdrop Scrim** | dialog overlay | `rgba(0,0,0,0.5)` | Dialog overlay with slight blur. |
| **Search Modal Shadow** | search dialog shadow | `rgba(0,0,0,0.25)` | Large, sparse modal elevation. |

## 3. Typography Rules

### Hierarchy & Weights

The app uses **Inter** through Next.js `next/font/google` for all interface text, with Latin and Vietnamese subsets. Inter gives the product a neutral, high-legibility software feel: compact enough for sidebar rows and long transcripts, but friendly when used in the large empty-state greeting. **Geist Mono** is reserved for code blocks, inline code, and terminal-style loaders, giving generated technical content a crisp developer-tool character.

| Level | Source classes | Use |
| --- | --- | --- |
| **Empty-state hero** | `text-3xl sm:text-[34px] md:text-[36px]`, `font-light`, `leading-10 sm:leading-[48px] md:leading-[54px]`, `tracking-[-0.03em]` | Main invitation: “Design your next chatbot experiment.” Airy, understated, Claude-like. |
| **Chat heading fallback** | `text-xl sm:text-2xl`, `font-semibold`, `leading-8` | Non-hero empty chat heading and accessible `h1` structure. |
| **Assistant markdown H1/H2/H3** | `prose-h1:text-xl`, `prose-h2:text-lg`, `prose-h3:text-base`, all `font-semibold` | Keeps generated content compact; headings are readable but not document-like. |
| **Body and composer** | `text-base leading-6` | Prompt textarea and longer explanatory copy; comfortable reading rhythm. |
| **Core UI labels** | `text-sm leading-5`, `font-normal` or `font-medium` | Sidebar rows, buttons, starter prompt titles, modal rows. |
| **Metadata/helper text** | `text-xs leading-4/5 text-muted-foreground` | Starter prompt descriptions, “Thought for Ns”, disclaimer, loading text. |
| **Code** | `font-mono text-[13px]` for blocks; inline code `text-[0.9em]` | Technical outputs and snippets. |

Weights are intentionally restrained: `font-light` for the large hero, `font-normal` for rows, `font-medium` for labels/actions, and `font-semibold` for titles or active rows. The UI rarely uses heavy weight; emphasis comes from spacing, alignment, and foreground contrast instead.

### Spacing Principles

Typography follows a compact 4px/8px rhythm. Body copy uses `leading-6` for readability; sidebar and button labels use `leading-5` to keep controls dense. The hero uses unusually tall line heights up to 54px to make the start screen feel calm and centered. Letter spacing is only tightened for display (`-0.03em`) or tokenized as `--letter-spacing-tight: -0.02em`; everyday body text stays at normal tracking.

Markdown content is optimized for chat rather than articles: paragraphs have no extra margins, lists use 1-step gaps, blockquotes are muted with a 4px left border, and tables are wrapped in bordered scroll containers. This preserves readable structure without breaking the conversational rhythm.

```text
Type hierarchy

36px light hero       → empty-state invitation
20px semibold heading → markdown h1 / fallback heading
16px regular body     → composer and generated prose
14px regular/medium   → controls and sidebar rows
12px medium helper    → metadata, disclaimer, status text
13px Geist Mono       → code blocks
```

## 4. Component Stylings

### Buttons

Buttons are shadcn-style primitives with a neutral, high-contrast default. Public buttons in `packages/ui/src/components/button.tsx` use `rounded-md`, `text-sm font-medium`, centered `inline-flex`, `gap-2`, focus rings, and disabled `opacity-50`. Primary actions use `bg-primary text-primary-foreground hover:bg-primary/90`; secondary actions use pale gray fills; outline actions sit on the background with a border and turn into accent surfaces on hover.

| Variant | Visual treatment | Use |
| --- | --- | --- |
| **Default / primary** | Near-black fill, near-white text, subtle hover darkening | Send action and primary CTAs. |
| **Destructive** | Red fill, near-white text, hover `destructive/90` | Delete and irreversible actions. |
| **Outline** | `border-input`, background canvas, accent hover | Retry, secondary confirmation actions. |
| **Secondary** | Pale gray fill with near-black text | Low-emphasis actions. |
| **Ghost** | No fill until hover | Sidebar icons, collapse/search controls, toolbar actions. |
| **Link** | Primary text with underline on hover | Inline action text. |

Sizing is compact: default public buttons are `h-10 px-4`, small buttons are `h-9 px-3`, large buttons are `h-11 px-8`, and icon buttons are square `h-10 w-10`. Chat send overrides this into a circular `size-9 rounded-full` button with `active:scale-[0.97]` for tactile feedback.

### Cards & Domain-Specific Containers

Cards use `rounded-xl border bg-card text-card-foreground shadow` with 24px internal padding (`p-6`) and a slightly tighter title style (`font-semibold leading-none tracking-tight`). The system prefers bordered surfaces with very subtle shadows over heavy elevation.

The more important domain containers are chat-specific:

- **Prompt composer**: a large `rounded-3xl` container with `border`, `pt-1`, and either `bg-popover shadow-xs` during active chats or `bg-background shadow-none` in the starter state. It reads as a soft input pod rather than a form field.
- **User message bubble**: `bg-muted text-primary max-w-[85%] sm:max-w-[75%] rounded-3xl px-5 py-2.5`; it is right-aligned and intentionally simple.
- **Assistant message content**: full-width, transparent markdown on the transcript rail; the assistant does not use a filled bubble, so responses feel like document text within the chat.
- **Starter prompt cards**: `rounded-2xl border border-border/60 bg-background/75 p-3 min-h-[72px]`, with a muted icon cell and fine-pointer hover that only slightly changes border/background.
- **Search dialog**: `rounded-2xl border border-border/60 bg-popover`, 700px max width, 70dvh max height, blurred backdrop, and a large `0 25px 50px -12px rgba(0,0,0,0.25)` shadow.

### Navigation

Navigation is a left sidebar built from Radix/shadcn-style primitives. In the chat app it overrides the standard width to `260px` expanded and `56px` collapsed; the generic defaults are 16rem, 18rem mobile, and 3rem icon mode. The sidebar uses `bg-sidebar text-sidebar-foreground` and a right border in `border-sidebar-border`.

Sidebar rows are compact and rounded: toolbar buttons are `h-9 rounded-lg px-2.5 text-sm font-normal leading-5`, active recent chats use `bg-sidebar-accent` and `font-medium`, and destructive row actions appear only on active/hover/focus states. The collapsed state becomes a vertical strip of `size-10 rounded-xl` icon controls. The logo combines a near-black rounded square icon tile with a semibold text label, making brand presence functional rather than decorative.

Mobile navigation moves the sidebar into a sheet with a light translucent overlay (`bg-white/60 backdrop-blur-xs`) and a left slide-in panel. A floating top-left trigger (`size-8 rounded-lg bg-background/80 shadow-sm backdrop-blur`) appears only when the mobile sidebar is closed.

### Inputs & Forms

Standard inputs are compact rectangular controls: `h-9`, `rounded-md`, `border border-input`, transparent background, `px-3 py-1`, `text-base md:text-sm`, and a visible `focus-visible:ring-4 focus-visible:outline-1`. Invalid fields use `aria-invalid` styles with destructive border/ring colors, keeping error semantics tied to accessibility state.

Textareas default to `min-h-[60px]`, `rounded-md`, `border-input`, `px-3 py-2`, and a 1px focus ring. The chat prompt textarea strips the default border/shadow inside the composer, autosizes up to 240px, keeps a `min-h-[44px]`, and uses `text-base leading-6` so message drafting feels like writing, not filling a form.

### Domain-Specific Components

**Assistant waiting indicator** is the strongest branded micro-component. It is a 20px teal orb with a 1px translucent teal ring, a tiny highlight dot, breathing scale/opacity animation, and diagonal shimmer. It appears with a 160ms fade and escalates copy after 6 seconds (“Still working through this.”) and 15 seconds (“This is taking longer than usual.”).

**Assistant streaming markdown** reveals text at a paced cadence: small chunks every 50ms, short pauses after commas/sentence boundaries/line breaks, and catch-up speeds for large backlogs. Tokens animate in over 220ms with a smooth cubic bezier. The implementation intentionally avoids rendering dangling markdown emphasis markers mid-stream, so the visual language feels polished even during partial responses.

**Chat search** behaves like a command palette without becoming a dark developer command menu. It uses a large rounded light popover, a 56px search header, grouped session sections (“Today”, “Previous 30 days”, “Older”), 40–44px option rows, and muted Lucide icons.

## 5. Layout Principles

### Grid & Structure

The app is a full-height chat shell (`h-dvh`) split into a collapsible sidebar and a main chat region. The main region owns viewport height, safe-area top padding, and the `bg-background` canvas. Content is arranged on explicit rails from `packages/views/src/chat/chat-layout.ts`:

| Constant | Class | Purpose |
| --- | --- | --- |
| `CHAT_CONTENT_WIDTH_CLASS` | `mx-auto w-full max-w-3xl` | Transcript and active chat content rail (768px max). |
| `CHAT_HERO_RAIL_CLASS` | `mx-auto w-full max-w-2xl` | Empty-state composer rail (672px max). |
| `CHAT_EMPTY_STATE_CANVAS_CLASS` | `max-w-7xl px-4 pt-[8vh] md:px-14 md:pt-[9vh] xl:px-20` | Large start-screen canvas with optical top positioning. |
| `CHAT_TRANSCRIPT_INSET_CLASS` | `px-4 md:px-2` | Inner readable transcript padding. |
| `CHAT_COMPOSER_INSET_CLASS` | `px-0 md:px-2` | Composer inset, wider on mobile than transcript text. |

Starter prompts use a simple responsive grid: one column on mobile and two columns from `sm` upward. Dialogs and search panels use max-width constraints (`max-w-[700px]`, `w-[calc(100vw-2rem)]`) rather than a global page grid.

### Whitespace Strategy

The system uses Tailwind’s default 4px spacing scale with a few optical exceptions. Empty-state content starts around `8vh–9vh` from the top to feel centered above the composer. Transcript messages use `gap-7`, generous enough to separate turns while keeping long conversations scannable. Active assistant turns reserve `min-h-80 md:min-h-72` below the latest response so new activity lands in a comfortable reading zone instead of being glued to the composer.

Internal component spacing stays compact: sidebar groups use `gap-1`, recent rows use `space-y-0.5`, starter cards use `gap-3` internally, and button/icon controls use 8px gaps. The contrast between spacious chat rails and dense navigation is deliberate.

### Alignment & Visual Balance

The UI is centered where users compose and read, left-aligned where users navigate. Empty-state messaging is centered and balanced (`text-balance`, `text-center`), reinforcing the start-screen prompt. Transcript alignment differentiates roles: user turns align right in rounded muted bubbles, while assistant turns align left as full-width markdown text. This creates a clear visual rhythm without avatars or strong color blocks.

Search and dialogs use top-biased positioning (`top-[15%]`) instead of perfect vertical centering, making them feel like command surfaces that leave room for results. Sidebar actions keep icons at ~17–19px with 1.8–2px strokes, matching Lucide’s light, precise feel.

### Responsive Behavior & Touch

The app is mobile-aware but desktop-oriented. Sidebar primitives switch to a sheet on mobile, with width `18rem` and a hidden default close button in the chat sidebar. The main shell uses dynamic viewport height (`h-dvh`) and safe-area inset padding for mobile browsers. Prompt input bottom padding includes `env(safe-area-inset-bottom)` so the composer does not collide with device chrome.

Touch and pointer rules are explicit: hover styles for starter cards and delete affordances are limited to fine pointers, while coarse pointers keep important controls visible. Most interactive rows are 36–44px high, and icon buttons are commonly 40px square or circular. Motion-sensitive users get `motion-reduce:transition-none`, `motion-reduce:animate-none`, or disabled active scaling across loaders, sheets, streaming tokens, and controls.

```text
Responsive structure

Desktop
┌ 260px sidebar ┐┌──────── centered max-w-3xl transcript ────────┐
│ recents/search││ assistant text left, user bubbles right         │
│ collapses 56px││ composer fixed to bottom rail                   │
└───────────────┘└────────────────────────────────────────────────┘

Mobile
┌──────── full-width chat ────────┐
│ floating sidebar trigger         │
│ sheet sidebar overlays from left │
│ safe-area-aware composer bottom  │
└──────────────────────────────────┘
```

## 6. Design System Notes for Stitch Generation

### Language to Use

Use prompts like: **minimal monochrome AI chat workspace**, **zinc-neutral shadcn interface**, **centered readable chat rail**, **soft rounded composer pod**, **compact collapsible sidebar**, **subtle borders over heavy shadows**, **Inter typography**, **Lucide line icons**, **calm empty-state hero**, **teal animated assistant thinking orb**, and **practical experiment-workflow tone**.

Avoid language that implies bright SaaS gradients, marketing pages, glass-heavy dashboards, or colorful analytics UI. This design system is a focused product workspace, not a landing page.

### Color References

- Clean White Canvas — `#ffffff` — primary app/surface background.
- Near-Black Ink — `#171717` — primary text and primary button fill.
- Soft Zinc Wash — `#f5f5f5` — muted/accent/secondary surfaces and message bubbles.
- Quiet Metadata Gray — `#737373` — helper text, timestamps, descriptions, placeholders.
- Hairline Warm Gray — `#e6e6e6` — borders and input outlines.
- Sidebar Text Zinc — `#3f3f46` — sidebar copy and icons.
- Sidebar Hover Frost — `#f4f4f5` — sidebar selected/hover rows.
- Clear Error Red — `#ef4343` — destructive and error states.
- Assistant Teal Orb — `#45c5d3` — waiting indicator only.
- Assistant Ice Highlight — `#c9f2f8` — shimmer/highlight on the waiting indicator.

### Component Prompts

1. **Empty chat start screen**
   > Create a minimal AI chat start screen on a white canvas. Use Inter typography, a centered light-weight 36px heading reading “Design your next chatbot experiment,” a muted one-line description, a large rounded-3xl prompt composer on a 672px rail, and four rounded-2xl starter prompt cards in a two-column grid with muted Lucide icons.

2. **Active chat transcript**
   > Design a focused chat transcript with a left sidebar and a centered 768px message rail. Assistant responses are left-aligned transparent markdown text with compact headings and lists; user messages are right-aligned pale zinc bubbles with rounded-3xl corners and 20px horizontal padding. Keep borders subtle, shadows minimal, and use a circular black send button inside a soft rounded composer.

3. **Collapsible chat sidebar**
   > Create a compact white sidebar for chat history, 260px wide with a 56px collapsed icon rail. Use near-black logo tile, zinc text, 36px rounded navigation rows, pale zinc hover states, recent chat rows with truncation, and icon-only collapsed controls using Lucide line icons.

4. **Search dialog / command surface**
   > Create a light command-palette-style search dialog positioned near the top of the viewport. It should be 700px max width, rounded-2xl, bordered, white, softly shadowed, with a 56px search header, muted search icon, grouped chat result rows, and hover/active rows in pale zinc.

### Incremental Iteration

- Start from the semantic tokens and rails first: white background, near-black text, `max-w-3xl` transcript, `max-w-2xl` empty composer.
- Add only one saturated accent: the small teal assistant waiting orb. If the screen starts feeling colorful, remove color before adding more.
- Prefer radius and spacing changes over shadows for hierarchy. Use `rounded-3xl` for chat pods/bubbles, `rounded-2xl` for starter cards/dialog surfaces, and `rounded-md/lg` for ordinary controls.
- Keep markdown readable and compact: no large article margins, no oversized headings, and use muted borders for blockquotes/tables/code.
- Preserve accessibility cues: visible focus rings, icon labels, status messaging, and reduced-motion alternatives for shimmer/scale animations.
