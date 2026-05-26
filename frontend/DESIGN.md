---
name: Aero-Ops Intelligence
colors:
  surface: '#061422'
  surface-dim: '#061422'
  surface-bright: '#2d3a49'
  surface-container-lowest: '#020f1c'
  surface-container-low: '#0f1d2a'
  surface-container: '#13212e'
  surface-container-high: '#1e2b39'
  surface-container-highest: '#293644'
  on-surface: '#d6e4f7'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#d6e4f7'
  inverse-on-surface: '#243240'
  outline: '#849495'
  outline-variant: '#3a494b'
  surface-tint: '#00dbe7'
  primary: '#e1fdff'
  on-primary: '#00363a'
  primary-container: '#00f2ff'
  on-primary-container: '#006a71'
  inverse-primary: '#00696f'
  secondary: '#b8c3ff'
  on-secondary: '#002388'
  secondary-container: '#0043eb'
  on-secondary-container: '#c6ceff'
  tertiary: '#e4ffe4'
  on-tertiary: '#003918'
  tertiary-container: '#37fa87'
  on-tertiary-container: '#006f35'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#74f5ff'
  primary-fixed-dim: '#00dbe7'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f54'
  secondary-fixed: '#dde1ff'
  secondary-fixed-dim: '#b8c3ff'
  on-secondary-fixed: '#001356'
  on-secondary-fixed-variant: '#0035be'
  tertiary-fixed: '#62ff96'
  tertiary-fixed-dim: '#00e475'
  on-tertiary-fixed: '#00210b'
  on-tertiary-fixed-variant: '#005226'
  background: '#061422'
  on-background: '#d6e4f7'
  surface-variant: '#293644'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '500'
    lineHeight: 32px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.1em
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  gutter: 20px
  margin-safe: 32px
---

## Brand & Style
This design system is engineered for high-stakes aerospace operations, delivering a "flight deck" aesthetic that balances mission-critical clarity with a futuristic, premium feel. The interface targets pilots, fleet managers, and aerospace engineers who require rapid data synthesis in low-light environments.

The visual style is a fusion of **Modern Minimalism** and **Glassmorphism**. It utilizes depth through translucency and blurred layers to maintain context while highlighting active data streams. The atmosphere is technical, sophisticated, and authoritative, evoking the sensation of looking through a high-tech cockpit HUD (Heads-Up Display). Elements should feel lightweight yet grounded, using subtle neon glows to indicate system vitality and focus.

## Colors
The palette is rooted in a deep, nocturnal foundation to minimize eye strain and maximize the vibrance of data visualizations. 

- **Primary (Cyan):** Used for active states, primary telemetry, and critical navigation paths. It represents "Light" and "Signal."
- **Secondary (Electric Blue):** Used for structural accents, secondary interactive elements, and brand reinforcement.
- **Backgrounds:** A tiered system starting at `#0B0E14` for the base environment, with `#1A1D23` used for panel containers to create subtle contrast without harsh lines.
- **Semantic Logic:** Status colors follow aviation standards—Emerald for "Optimal/Live," Orange for "Cautionary," and Red for "Critical Failure." All semantic colors should be applied with a 10-15% opacity background tint to create a cohesive glow.

## Typography
The typographic hierarchy emphasizes legibility in technical contexts. 

- **Geist** is used for headlines and primary UI labels, providing a sharp, geometric precision that feels engineered. 
- **Hanken Grotesk** handles body copy and descriptions, offering a contemporary and approachable tone that balances the technicality of the display faces. 
- **JetBrains Mono** is reserved for telemetry, coordinates, and system logs. The monospaced nature ensures that fluctuating numerical data (like altitude or velocity) does not cause layout shifts and remains perfectly scannable.

## Layout & Spacing
The layout follows a **Fluid Grid** model with high-density capabilities. 

- **The Grid:** A 12-column system is used for desktop, collapsing to 6 for tablet and 2 for mobile. 
- **Rhythm:** We use a 4px base unit to allow for the precision required in complex dashboards. 
- **Margins:** Generous outer margins (32px) provide the "breathing room" necessary for a premium feel, preventing the data-heavy interface from feeling claustrophobic. 
- **Containers:** Content is grouped into modular glass panels. Spacing between panels (gutters) is fixed at 20px to maintain a clear visual separation while allowing the background gradients to peek through.

## Elevation & Depth
Depth in this design system is achieved through **Glassmorphism** rather than traditional drop shadows.

- **Surface Tiers:** 
  - **Level 0 (Base):** Deep Navy background.
  - **Level 1 (Panels):** 60% opacity of `#1A1D23` with a 20px backdrop blur and a subtle 1px inner border (Cyan at 10% opacity) to define the edge.
  - **Level 2 (Modals/Popovers):** 80% opacity with a stronger backdrop blur (40px) and a soft Cyan ambient glow shadow (spread: 20px, opacity: 5%).
- **Interaction:** Hovering over interactive cards increases the inner border opacity and adds a "neon" stroke effect to the bottom edge, suggesting physical illumination.

## Shapes
The shape language uses a "Soft-Tech" approach. While the interface is futuristic, it avoids aggressive sharp corners to maintain a premium, accessible feel. 

Standard containers use a **0.5rem (8px)** radius. Larger dashboard modules and "floating" HUD elements may use **rounded-xl (1.5rem)** to emphasize their independence from the base grid. Buttons and toggle switches follow a semi-pill shape to distinguish them clearly from informational containers.

## Components
- **Buttons:** Primary buttons use a solid Electric Blue gradient with white text. Secondary buttons are "Ghost" style with a 1px Cyan border and a soft glow on hover.
- **Glass Panels:** These are the primary containers. They must feature a `backdrop-filter: blur(20px)` and a subtle linear gradient border from top-left (White 20%) to bottom-right (White 0%).
- **Data Chips:** Small, semi-pill components used for status. They should have a 10% opacity background of the status color (e.g., Green for live) and a 100% opacity text color.
- **Input Fields:** Dark background (#0B0E14) with a subtle Cyan bottom-border. On focus, the bottom border glows and a faint Cyan aura appears behind the field.
- **Toggle Switches:** Custom-designed "Cockpit" switches. When ON, the track glows with a Cyan gradient; when OFF, it remains a muted Charcoal.
- **Telemetry Charts:** Use thin strokes (1.5px) for line charts with a "faded area" gradient fill beneath the line to emphasize volume without cluttering the glass panel.