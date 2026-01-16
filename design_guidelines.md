# String Art Generator - Design Guidelines

## Design Approach
**System-Based Design**: Material Design 3 with modern glassmorphism accents for a professional, technical application that prioritizes functionality while maintaining visual polish.

## Core Design Principles
1. **Precision First**: Clear visual hierarchy for technical controls and parameters
2. **Process Clarity**: Distinct visual states for upload → configure → generate → guide workflow
3. **Professional Polish**: Modern, clean interface that inspires confidence in the algorithm's sophistication
4. **Focused Interaction**: Minimize distractions during the generation and guidance phases

## Layout System
**Spacing Units**: Tailwind units of 2, 4, 6, 8, 12, 16, 24
- Tight spacing (p-2, gap-2) for related controls
- Standard spacing (p-4, gap-4) for component separation  
- Generous spacing (p-8, p-12) for major sections

**Container Strategy**:
- Main workspace: max-w-7xl mx-auto
- Control panels: max-w-md for parameter forms
- Preview area: Flexible, responsive to content

## Typography Hierarchy

**Font Stack**: 
- Primary: 'Inter' (Google Fonts) - clean, technical, excellent for UI
- Monospace: 'JetBrains Mono' (Google Fonts) - for numerical values and pin sequences

**Scale**:
- H1: text-3xl font-bold (Main title)
- H2: text-2xl font-semibold (Section headers)
- H3: text-xl font-semibold (Subsection headers)
- Body: text-base (Standard UI text)
- Small: text-sm (Labels, helper text)
- Tiny: text-xs (Metadata, pin numbers)

## Component Library

### Primary Application Layout
- **Header**: Persistent top bar with app title, processing status indicator, export actions
- **Three-Column Workspace** (desktop):
  - Left sidebar (300px): Upload & parameter controls
  - Center panel (flex-1): Canvas preview area
  - Right sidebar (280px): Generation progress, thread list, player controls
- **Mobile**: Single column stack with collapsible panels

### Upload Zone
- Large dropzone with dashed border
- Icon + instruction text centered
- Thumbnail preview after upload with replace option
- Drag-and-drop visual feedback

### Parameter Controls Panel
**Grouped Control Sets**:
1. Frame Configuration (radio cards with icons)
   - Circular / Square selector
   - Pin count slider (100-400)
   - Frame size input

2. Thread Settings
   - Thread width slider with live preview
   - Opacity controls
   - Color mode toggle (Monochrome/Color)
   - Color palette selector (for multi-color)

3. Quality Settings
   - Resolution dropdown
   - Optimization mode (Fast/Balanced/High Quality)
   - Advanced toggles (collapsible)

### Generation Interface
- **Progress Component**:
  - Large circular progress ring with percentage
  - Current stage indicator (text below)
  - Estimated time remaining
  - "Cancel" action

- **Live Preview**:
  - Real-time canvas showing thread accumulation
  - Zoom controls (fit/100%/200%)
  - Toggle overlay: target image vs current progress

### Interactive Guidance Player
**Primary Player Controls** (prominent, centered):
- Large Play/Pause button (icon button with glassmorphism effect)
- Step backward/forward buttons
- Auto-advance toggle with speed selector (2s/3s/4s per step)

**Thread Information Display**:
- Current thread number (large, mono font): "Thread 347 of 3,482"
- Active pin sequence: "Pin 42 → Pin 187" (highlighted, large)
- Next thread preview: "Next: Pin 187 → Pin 9" (muted)

**Visual Canvas**:
- Active thread: Bright, high-contrast accent color stroke
- Completed threads: Semi-transparent gray
- Pin numbers: Small labels with background circles on hover
- Current pins: Pulsing highlight effect

**Audio Controls**:
- Voice guidance toggle
- Volume slider
- Voice speed selector

### Export Panel
**Download Options** (card-based buttons):
- JSON instructions (with icon + file size)
- SVG preview
- PDF printable guide
- Share link (copy to clipboard)

**Metadata Display**:
- Total threads used
- Estimated time to complete
- Materials needed list

## Navigation & States

### Application States
1. **Empty State**: Upload prompt with example images
2. **Configuration State**: Parameters visible, generate button enabled
3. **Processing State**: Progress overlay, controls disabled
4. **Result State**: Preview + player + export options
5. **Error State**: Clear error message with retry action

### Button Hierarchy
- Primary action: Solid background, prominent (Generate, Export)
- Secondary action: Outlined style (Cancel, Reset)
- Tertiary action: Ghost style (Advanced options, tooltips)

## Visual Treatment

### Glassmorphism Accents
Apply to:
- Floating control panels
- Player overlay on canvas
- Parameter cards
- Tooltips

Effect: `backdrop-blur-lg bg-white/80 border border-white/20 shadow-xl`

### Canvas Treatment
- Clean white background for thread preview
- Subtle grid overlay (optional toggle)
- Drop shadow for depth: `shadow-2xl`

### Status Indicators
- Processing: Animated gradient border
- Success: Green accent glow
- Warning: Amber highlight
- Error: Red border with icon

## Icons
**Library**: Heroicons (via CDN)
- Upload: `cloud-arrow-up`
- Play/Pause: `play`/`pause`
- Settings: `cog-6-tooth`
- Download: `arrow-down-tray`
- Voice: `speaker-wave`
- Zoom: `magnifying-glass-plus`/`magnifying-glass-minus`

## Images
**No hero images needed** - this is a functional application. Focus on:
- Example result thumbnails in empty state (3-4 small previews of stunning string art)
- Loading state illustrations (animated thread weaving)
- Help tooltips with visual diagrams

## Responsive Behavior
- Desktop (1024px+): Three-column layout
- Tablet (768px-1023px): Two-column, collapsible sidebars
- Mobile (<768px): Single stack, bottom sheet player controls

## Accessibility
- All controls keyboard navigable
- Clear focus indicators (ring-2 ring-offset-2)
- ARIA labels for icon buttons
- Screen reader announcements for progress updates
- High contrast mode support