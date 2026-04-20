# Design System Specification: Clinical Visionary

## 1. Overview & Creative North Star
**The Creative North Star: "The Digital Surgeon"**

This design system is built to bridge the gap between cold, clinical precision and the warmth of human-centric innovation. It moves away from the "standard SaaS" aesthetic by embracing a high-end editorial feel characterized by extreme contrast, deep tonal layering, and "glowing" focal points. 

We break the traditional template look by utilizing **intentional asymmetry** and **breathing room**. Layouts should feel like a curated gallery—uncluttered, authoritative, and visionary. By balancing the technical rigor of `Space Grotesk` with the functional clarity of `Inter`, we create an environment that feels both scientifically advanced and intuitively accessible.

---

## 2. Colors & Atmospheric Depth

The palette is rooted in the "Void"—a deep, near-black foundation—interrupted by "Luminous" accents that guide the eye toward critical interactions.

### The Palette (Material Design Tokens)
*   **Background / Surface:** `#131313` (The base of all experiences)
*   **Primary:** `#B1C5FF` (A soft, electric blue for high-visibility actions)
*   **Primary Container:** `#0051C3` (The "Glow" source—used for depth and active states)
*   **Secondary (Accent):** `#A6E6FF` (Cyan-leaning for clinical highlights)
*   **Tertiary:** `#D6BAFF` (Soft purple for visionary, human-centric callouts)

### The "No-Line" Rule
To maintain a premium, seamless feel, **1px solid borders are strictly prohibited for sectioning.** Boundaries must be defined through:
1.  **Background Shifts:** Transitioning from `surface` to `surface-container-low`.
2.  **Tonal Transitions:** Using subtle, large-scale gradients to imply a change in context.

### Signature Textures & Glassmorphism
To avoid a flat, "cheap" look, use **Glassmorphism** for floating elements (modals, navigation bars, hover cards).
*   **Recipe:** Use `surface-container-highest` at 60% opacity with a `backdrop-blur` of 24px.
*   **Gradients:** Apply a "Linear Glow" to main CTAs using a transition from `primary` to `primary-container`. This provides a three-dimensional "soul" to the UI.

---

## 3. Typography: Editorial Authority

We use a high-contrast typographic scale to establish a clear hierarchy.

*   **Display & Headline (`Space Grotesk`):** These are your "Statements." Use `display-lg` (3.5rem) with tight letter-spacing (-0.02em) for hero sections. It conveys technological precision.
*   **Title & Body (`Inter`):** These are your "Information." `Inter` provides maximum readability. Use `body-lg` (1rem) for general copy to ensure a sophisticated, airy feel.
*   **Labels (`Inter` / Monospace):** Small technical details (like sensor data or timestamps) should use `label-md` or a monospace font to evoke a "clinical terminal" aesthetic.

---

## 4. Elevation & Tonal Layering

In this system, depth is not "added" via shadows; it is "carved" via light.

### The Layering Principle
Stack surface tiers to create natural lift.
*   **Level 0 (Base):** `surface` (`#131313`)
*   **Level 1 (Section):** `surface-container-low` (`#1B1C1C`)
*   **Level 2 (Card):** `surface-container` (`#1F2020`)
*   **Level 3 (Interactive):** `surface-container-high` (`#2A2A2A`)

### Ambient Shadows
If a floating effect is mandatory (e.g., a primary Modal):
*   **Color:** Use a tinted version of `on-surface` (white/blue) at 5% opacity.
*   **Blur:** Minimum 40px to 60px. It should feel like a soft atmospheric glow rather than a shadow.

### The "Ghost Border" Fallback
If accessibility requires a container boundary, use a **Ghost Border**: `outline-variant` (`#434653`) at **15% opacity**. This creates a "suggestion" of a line without breaking the seamless flow.

---

## 5. Component Guidelines

### Buttons: The Kinetic Energy
*   **Primary:** A vibrant gradient of `primary` to `primary-container`. High roundedness (`0.375rem`). Text is `on-primary`.
*   **Secondary:** Ghost style. Transparent background with a `Ghost Border` (15% opacity) and `primary` colored text.
*   **Hover State:** Increase the `backdrop-blur` and add a subtle `inner-glow` using the `surface-bright` token.

### Cards & Lists: The Negative Space Rule
*   **Structure:** No divider lines. Separate list items using `1.5rem` of vertical whitespace or a subtle background shift to `surface-container-low` on hover.
*   **Imagery:** Product imagery should be high-contrast, shot on dark backgrounds, and appear to "emerge" from the UI.

### Input Fields: Clinical Precision
*   **Background:** `surface-container-lowest`.
*   **Active State:** The bottom border transforms into a 2px `primary` glow. The label shifts to `primary` color using `label-sm`.

### Signature Component: The "Data Pulse"
Use small, animated `primary` colored dots next to technical headers to indicate "live" or "active" clinical data, reinforcing the technological personality.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** use asymmetrical layouts (e.g., 60/40 splits) to create an editorial, non-template feel.
*   **Do** allow for massive amounts of whitespace (margins of 80px+ on desktop).
*   **Do** use `tertiary` (purple) accents sparingly to highlight "human" or "visionary" insights.

### Don’t:
*   **Don’t** use pure black (`#000000`). Use the specified `surface` tones to maintain depth.
*   **Don’t** use standard "drop shadows" (0, 4, 4, 0). They feel dated and "dirty" in a clinical UI.
*   **Don’t** use 100% opaque borders. They create visual noise that distracts from the content.
*   **Don’t** center-align long blocks of body text. Keep it left-aligned for an authoritative, structured look.