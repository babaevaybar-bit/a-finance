# Theme Name: Minimal
# Vibe & Description: Prioritizing a sense of airiness, it establishes information hierarchy through ample whitespace and clear distinctions in font size, weight, and spacing. The design remains extremely restrained, with almost no use of shadows or decorative colors, while ensuring long‑term reading comfort through gentle contrast and fine, non‑sharp typefaces.

# Color
- Primary Background: #FFFFFF;
-Secondary Background: #F8F9FB → Use only extremely subtle color differences to distinguish layers.
- Primary Text: #111827 (dark gray rather than pure black).
- Secondary Text: #6B7280.
- Border: #E5E7EB (1px).
- Unique Signal Color (selectable based on user requirements): Used for selected states, primary buttons, and current status indicators.

# Font
- Heading & Body: Montserrat (url: https://resource-static.bj.bcebos.com/fonts/Montserrat-VariableFont_wght.woff2)
# Animation
## Elemental animation
-The animation is minimalist and linear. Elements slide into place along the grid lines;
## Entrance animation
- There is no bouncing or elasticity effect; the page scrolls naturally like a document with an ease-out effect.
##Transition animation
- Use a fade-in or slight displacement when loading content;
##Animation implementation
- The project integrates the tailwindcss-intersect plugin, which allows you to achieve animation effects when elements enter the viewport in a manner similar to the following:
opacity-0 intersect:opacity-100 transition duration-700
- Animations can also be achieved using motion/react.

# Layout
- Content is organized into clear modules. Ample white space is used to distinguish different sections.
- Prefers left-aligned text and structured image layouts, avoiding decorative misalignments.

# Elements
- Prefers minimalist linear charts with uniform stroke thickness and no fill.
- Shadow ≈ 0, border ≤ 1px, minimizes the button's visual impact; main button ≠ large color block, emphasizes text more.