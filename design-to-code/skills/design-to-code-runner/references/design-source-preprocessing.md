# Design Source Preprocessing

Use this reference at the start of every design-to-code task. Before writing any code, identify the design source type and extract specifications using the appropriate strategy.

## Why this matters

Different source types provide different levels of precision. An HTML file gives you exact pixel values; a PNG gives you visual intent that requires interpretation. Choosing the wrong extraction strategy wastes time and introduces drift from the first line of code.

## Source type detection

Check what the user or task provides:

| Source type | How to detect | Precision level |
|-------------|--------------|-----------------|
| Image (PNG/JPG/PDF) | File extensions, `front-end design/` directories | Low — requires visual interpretation |
| HTML/CSS | `.html`, `.css` files or live URLs | High — exact values readable from code |
| Figma | `figma.com/design/` URLs or Figma file keys | High — exact values via MCP API |
| Paper (.pen) | `.pen` files or active Paper editor | High — exact values via MCP API |

If the source is ambiguous, check the task spec or ask the user.

## Image sources (PNG/JPG/PDF)

Images are the least precise source. Compensate with structured preprocessing.

### Step 1: Inventory all views

Scan the design directory for all distinct screens/views. Name and number them:

```
01 — Home (default)
02 — Home (scrolled)
03 — Dashboard (sidebar expanded)
04 — Dashboard (sidebar collapsed)
05 — Design Comparison
06 — Browser Side Panel
```

### Step 2: Create multi-resolution tiers

For each design image, create 3 resolution levels:

```bash
mkdir -p compressed/ tiny/
# Compressed (600px) — for detailed comparison
for f in *.png; do sips -Z 600 "$f" --out "compressed/$f"; done
# Tiny (400px) — for quick scoring and context-safe comparison
for f in *.png; do sips -Z 400 "$f" --out "tiny/$f"; done
```

Use tiny/ for routine comparison (saves context window). Use compressed/ when investigating specific pixel-level differences. Use original only for final pixel-perfect verification.

### Step 3: Determine viewport dimensions

Estimate the target viewport from image aspect ratios:

- Desktop: typically 1440x900 or 1920x1080
- Tablet: typically 768x1024
- Mobile: typically 390x844
- Side panel: typically 350-390px wide

Record the target viewport in the implementation spec.

### Step 4: Extract what you can

From images alone, you can reliably extract:

- Layout structure (grid vs flex, column count, section ordering)
- Approximate color palette (use eyedropper tools or AI vision)
- Typography hierarchy (heading vs body vs label scale)
- Component patterns (cards, panels, nav bars)

You cannot reliably extract: exact pixel values for padding/gap/margin, exact font sizes, exact border-radius values, exact opacity values. These must be iterated through the fidelity loop.

### Image comparison during implementation

When comparing your implementation against image designs:

1. Take a browser screenshot at the same viewport size
2. Compress to the same resolution tier as the reference
3. Compare region-by-region, not the full page at once
4. For focused comparison, crop both images to the same region

## HTML/CSS sources

HTML/CSS is the most precise source. Read it, don't guess.

### Step 1: Read structure

```
Read the HTML file to understand:
- Page structure (sections, containers, grids)
- Component patterns (class names, nesting)
- Navigation and routing
- Data binding patterns
```

### Step 2: Extract design tokens from CSS

Read the CSS file to extract:

```css
/* Colors */
:root {
  --bg-main: #10141a;      /* Record every variable */
  --accent-gold: #f0c040;
}

/* Typography */
font-family: 'Space Grotesk', sans-serif;  /* Record every font stack */
font-size: 14px;                            /* Record every size */

/* Spacing */
padding: 16px 20px;    /* Record exact values */
gap: 12px;
border-radius: 8px;
```

### Step 3: Record in implementation spec

Transfer all extracted values into the implementation spec's design tokens section. These are ground truth — do not approximate.

## Figma sources (via MCP)

Use Figma MCP tools for precise extraction without manual inspection.

### Step 1: Get structure overview

```
get_metadata(nodeId, fileKey)
→ Returns XML with all node IDs, types, names, positions, sizes
→ Use this to identify all major sections and their node IDs
```

### Step 2: Get design context per section

```
get_design_context(nodeId, fileKey)
→ Returns: reference code (React+Tailwind), screenshot, contextual hints
→ Code Connect snippets map to actual codebase components
→ Adapt the reference code to your target stack
```

### Step 3: Extract design tokens

```
get_variable_defs(nodeId, fileKey)
→ Returns all design variables: colors, spacing, typography tokens
→ Map these directly to CSS custom properties
```

### Step 4: Search for reusable components

```
search_design_system(query, fileKey)
→ Find existing design system components that match your needs
→ Import via importComponentByKeyAsync instead of recreating
```

### Recommended Figma extraction order

1. `get_metadata` on root → map out all sections
2. `get_variable_defs` → extract full token system
3. `get_design_context` on each major section → get reference code + screenshots
4. `search_design_system` for any component you're about to create → check if it exists first

## Paper sources (via MCP)

Use Paper MCP tools for precise extraction from .pen files.

### Step 1: Get editor state

```
get_editor_state({include_schema: true})
→ Returns: active file, page info, artboard list with dimensions, font families
→ Schema is needed before any read/write operations
```

### Step 2: Read node structure

```
batch_get({filePath, patterns: [{type: "frame"}], readDepth: 2})
→ Returns all top-level frames with their children
→ Identify major sections by name and dimensions
```

### Step 3: Extract exact styles

```
get_computed_styles({nodeIds: ["artboard-id", "section-id", ...]})
→ Returns exact CSS properties per node: colors, padding, gap, fonts, borders
→ These are ground truth values — use them directly
```

### Step 4: Get code representation

```
get_jsx({nodeId, format: "inline-styles"})
→ Returns JSX with inline styles — exact pixel values
→ Use as reference code, adapt to your target stack
```

### Step 5: Visual reference per section

```
get_screenshot({nodeId})
→ Returns base64 image of the specific node
→ Use for comparison during the fidelity loop
```

### Recommended Paper extraction order

1. `get_editor_state` → understand file structure
2. `get_basic_info` → list artboards with dimensions
3. `batch_get` on each artboard → map out sections
4. `get_computed_styles` on all key nodes → extract exact values
5. `get_jsx` on complex sections → get reference code
6. `get_screenshot` on each artboard → save as comparison references

## Output

After preprocessing, you should have:

1. A complete inventory of all views/screens
2. Design tokens (colors, fonts, spacing) recorded in the implementation spec
3. Multi-resolution reference images (for image sources) or saved screenshots (for API sources)
4. Target viewport dimensions
5. Component structure mapped

Only then proceed to step 1 of the main workflow (discover repository contract).
