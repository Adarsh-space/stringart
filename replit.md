# StringArt Pro - Professional String Art Generator

## Overview
A professional-grade string art generation application that converts images into precise pin-to-pin thread instructions. Built with advanced optimization algorithms (greedy + simulated annealing + backtracking) for high-accuracy results that can compete with and exceed existing mobile apps.

## Current State
- **Version**: 1.0 MVP
- **Status**: Fully functional with core features

## Architecture

### Frontend (React + TypeScript)
- `client/src/pages/home.tsx` - Main application page with state management
- `client/src/components/theme-toggle.tsx` - Dark/light mode toggle
- `client/src/components/string-art/` - Core components:
  - `image-upload-zone.tsx` - Drag-and-drop image upload
  - `parameter-controls.tsx` - Frame, thread, and quality settings
  - `generation-progress.tsx` - Circular progress display
  - `canvas-preview.tsx` - Live preview with zoom controls
  - `guidance-player.tsx` - Step-by-step assembly instructions with voice
  - `export-panel.tsx` - JSON/SVG/PDF export options

### Backend (Express + TypeScript)
- `server/routes.ts` - API endpoints for generation, progress, and export
- `server/storage.ts` - In-memory job storage
- `server/string-art-engine.ts` - Core optimization engine

### Shared
- `shared/schema.ts` - TypeScript types and Zod schemas

## Key Features
1. **Hybrid Optimization Engine**
   - Greedy algorithm for initial structure
   - Simulated annealing for refinement
   - Backtracking for cleanup

2. **Physical Thread Modeling**
   - Configurable thread width and opacity
   - Bresenham line rendering
   - Density accumulation

3. **Edge Detection**
   - Sobel edge detection
   - Edge weighting for better structure preservation

4. **Interactive Guidance Player**
   - Step-by-step instructions
   - Voice announcement via Web Speech API
   - Configurable auto-advance speed

5. **Export Options**
   - JSON (pin-to-pin data)
   - SVG (vector preview)
   - PDF (printable guide)

## API Endpoints
- `POST /api/generate` - Start generation job
- `GET /api/progress/:jobId` - Get job progress
- `GET /api/result/:jobId` - Get completed result
- `POST /api/cancel/:jobId` - Cancel ongoing job
- `GET /api/export/:jobId/svg` - Export as SVG
- `GET /api/export/:jobId/pdf` - Export as PDF

## Configuration
- Pin Count: 100-800 (default 400)
- Max Threads: 500-50,000 (default 10,000)
- Thread Width: 0.2-1.5mm (default 0.4mm)
- Thread Opacity: 3-35% (default 12%)
- Min Pin Skip: 1-50 (default 2, lower = more detail)
- Frame Types: Circular, Square, Rectangular
- Quality Presets:
  - Fast: 2,000 threads, minPinSkip=5
  - Balanced: 5,000 threads, minPinSkip=3
  - High: 10,000 threads, minPinSkip=2, simulated annealing enabled

## Development
- Run: `npm run dev`
- Frontend: React + Vite + TailwindCSS + shadcn/ui
- Backend: Express + TypeScript

## Recent Changes
- Initial MVP implementation (2026-01-15)
- Added hybrid optimization engine
- Implemented interactive guidance player
- Added export functionality (JSON, SVG, PDF)
- Fixed generation bug with undefined pins array (2026-01-15)
- Added color mode support with 25-color thread palette (2026-01-15)
- Added ThreadColors component showing required thread colors and counts (2026-01-15)
- **Advanced Algorithm Upgrade (2026-01-15)**:
  - Real-time thread-by-thread visualization during generation
  - Accuracy scoring with MSE + SSIM metrics
  - LAB color space matching for perceptual accuracy
  - Multi-sample line evaluation (5 points per thread)
  - Gamma-corrected thread blending (gamma 2.2)
  - Genetic algorithm refinement for "high" quality preset
  - AccuracyScore component displaying final accuracy
- **Image Cropping & Auto-Optimize (2026-01-15)**:
  - Zoom (1-3x) and pan controls for image positioning
  - Auto-optimize button analyzes image for optimal settings
  - Crop parameters applied during server preprocessing
- **Algorithm Fixes (2026-01-15)**:
  - Fixed early termination: removed bestScore<=0 stop condition that prevented reaching maxThreads
  - Fixed color mode: threads now show actual colors during generation (not just black)
  - Relaxed pin fatigue: gentler penalty curve to avoid premature convergence
  - Color consistency: colors assigned during generation are preserved in final output
- **Major Quality Improvements (2026-01-16)**:
  - Color-aware optimization: Line selection now considers color matching during generation, not just post-hoc assignment
  - Optimized default parameters: minPinSkip reduced to 3 (was 20), maxThreads increased to 5000 (was 3000)
  - Enhanced preprocessing: Added contrast enhancement (linear 1.3x, -30 offset) for better detail extraction
  - Improved edge detection: Normalized and power-curved edge map for stronger structure preservation
  - Increased edge weight bonus: 5x (was 2x) to prioritize important features
  - Disabled pin fatigue and simulated annealing by default for faster, more detailed generation
  - Random fallback ensures generation never stops early
- **Continue Generation & Thread Preview (2026-01-16)**:
  - Continue generation: Add +500/+1000/+2000 more threads to an existing result
  - Thread preview slider: Interactively view the result at any thread count (1 to total)
  - Backend API: POST /api/continue/:jobId for continuing, GET /api/preview/:jobId/:threadCount for preview
  - Canvas preview re-renders threads in real-time based on slider position
  - Engine's continueGeneration() method rebuilds state from existing result and continues optimization
- **Accuracy Optimization v2.0 (2026-01-16)**:
  - SSIM-aware perceptual line scoring: Combines MSE reduction (60%), structure preservation (30%), edge detection (10%)
  - LAB color space deltaE scoring: Perceptual color matching for accurate thread colors
  - Local refinement pass: Measures actual contribution of each thread, replaces bottom 10% with better alternatives
  - Proper color state management: revertLine now correctly reverts colorProgressImage in color mode
  - Updated defaults for higher quality: 400 pins (was 300), 10,000 threads (was 6,000), 0.12 opacity (was 0.15), minPinSkip=2 (was 5)
  - Supports up to 800 pins and 50,000 threads for maximum detail
- **Accuracy Optimization v3.0 (2026-01-16)** - Target: 93-97% accuracy:
  - **Enhanced Scoring Weights**: 0.40 SSIM + 0.25 MSE + 0.20 Edge alignment + 0.10 Smoothness + 0.05 Overdraw penalty
  - **Full SSIM calculation**: Uses luminance, contrast, and structure components for perceptual quality
  - **Edge-aligned line selection**: calculateEdgeAlignment() scores how well threads align with edge gradients using Sobel kernels
  - **Overdraw tracking**: Penalizes excessive layering in already-dark regions
  - **Smoothness penalty**: Reduces abrupt value changes along thread paths
  - **Density compositing**: Proper formula: new_density = old_density + opacity * (1 - old_density)
  - **Multi-candidate local refinement**: Tests alternatives from both same-start and same-end pins (10+ candidates per replacement)
  - **State tracking**: Added overdrawMap, densityImage, edgeGradientX/Y for advanced rendering
- **Accuracy Optimization v4.0 (2026-01-16)** - Target: 95-97% accuracy:
  - **Multi-Resolution Error Evaluation**: Evaluates candidates at low (1/4), mid (1/2), and high resolution. Weighted 0.2/0.3/0.5. Early rejection of lines that harm low-res structure
  - **Edge-Guided Line Proposals**: Candidate generation biased by edge direction alignment. 70% edge-guided + 30% random (Fisher-Yates sampling for true randomness)
  - **Multi-Resolution Buffers**: targetLowRes, targetMidRes, progressLowRes, progressMidRes for pyramid evaluation
  - **Downsampling**: Box filter with linear space averaging for gamma-correct image scaling
  - **Multi-Scale Optimization Pipeline**: Three-stage coarse-to-fine generation (25% structure + 35% medium + 40% detail)
  - **Two-Layer Rendering**: Stage-specific thread opacities (150%/110%/80%) for bold structure and fine detail
  - **Pin Skip Per Stage**: Decreasing skip values (1/6 → 1/15 → minPinSkip) to capture global then local features
  - **Frequent Multi-Res Updates**: ~150 updates per generation (was ~20) to prevent buffer staleness
  - Enabled for "high" quality preset automatically
- **Interleaved Multi-Color Thread Art v4.2 (2026-01-16)** - Target: 90-97% accuracy:
  - **Single Shared RGB Canvas**: All colors accumulate on one canvas, eliminating layer conflicts
  - **Interleaved Color Selection**: Each thread evaluates ALL colors (CMYK) and picks the best (color + line) combination
  - **LAB Color Accuracy Scoring**: 0.70 × Delta E improvement + 0.20 × Edge preservation + 0.10 × Overdraw penalty
  - **Colors Cooperate Not Fight**: Unlike v4.1's sequential layers, colors are selected to work together
  - **Stage-Based Generation**: Structure (25%), Mid Detail (35%), Fine Detail (40%) with varying opacities
  - **Edge-Guided + Random Candidates**: 35 edge-guided + 15 random candidates per thread
  - **Subtractive Color Blending**: Thread absorbs light to simulate physical layering
  - **Thread Color Palette**: Black, Cyan, Magenta, Yellow - each stored with hex + name
  - **Step-by-Step Color Guidance**: UI shows current thread color, pauses on color changes
  - Replaces v4.1 per-channel approach which caused layer fighting and muddy colors
- **Face-Focused Optimization v5.0 (2026-01-16)** - Target: Sharp face clarity:
  - **Face Detection**: Uses @vladmandic/face-api with TensorFlow.js to detect faces in uploaded images
  - **Non-Uniform Pin Distribution**: 1.4× more pins packed around face region perimeter
  - **Face Region Mask**: Creates face/body/background zones for differential scoring
  - **Adaptive Pin Gap**: Face=2, Body=4, Background=6-8 (quality-dependent: high=6, balanced=7, fast=8)
  - **Edge Priority Boost**: 2× edge weight for lines passing through face (>30% overlap)
  - **Face Overdraw Control**: Penalizes threads in face region when density >0.60 (centralized threshold)
  - **Face Refinement Pass**: +1500 extra threads with weighted overlap scoring (30% minimum overlap)
  - **Thinner Face Threads**: 0.85× thread opacity for finer face details
  - **Fallback Detection**: Uses center-positioned estimated face box if detection fails
  - Expected: Sharp eyes, nose, mouth, jawline with ~90-95% face clarity
- **Face Optimization v5.1 Fixes (2026-01-16)** - Addressing muddy face rendering:
  - **Tighter Face Mask**: Reduced expansion from 1.4× to 1.1× to focus on actual facial features
  - **Lower Face Overdraw Threshold**: Changed from 0.85 to 0.60 to prevent muddy accumulation
  - **Centralized Thresholds**: getFaceOverdrawThreshold() function for consistent region-specific limits
  - **Relaxed Face Refinement**: Uses weighted overlap scoring instead of hard 60% cutoff
  - **Overdraw as Penalty**: Soft penalty (0.3×) instead of hard rejection when face is overdrawn
- **Face Optimization v5.2 Critical Fix (2026-01-16)** - Fixing blank face issue:
  - **CRITICAL: Run face detection on PREPROCESSED image**: Face detection now runs on the same cropped/resized image used for generation
  - Previously, face detection ran on original image but mask was applied to preprocessed 512x512, causing complete coordinate mismatch
  - Added getPreprocessedImageBuffer() method to apply same crop/resize as preprocessImage but keep RGB for face-api.js
  - Coordinates now match exactly because detection runs on the same image that generation uses
  - **Raised Face Overdraw Threshold**: Increased from 0.60 to 0.70 to allow more face detail before throttling
- **Face Optimization v5.3 Tuning (2026-01-16)** - Improving thin feature rendering (eyes, lips, nose):
  - **Lowered face overlap threshold**: 0.30 → 0.05 (5%) in scoring functions to include lines that partially touch face
  - **Face refinement overlap**: 0.30 → 0.01 (1%) to capture thin features like eye lines and lip contours
  - **Increased face edge boost**: 2x → 5x multiplier for lines through face region
  - **More face refinement threads**: 1500 → 2500 threads (15% → 20% of total)
  - **Thinner face threads**: 0.85x → 0.7x thread opacity for finer facial detail
  - **Higher overdraw threshold**: 0.70 → 0.80 to allow more face contrast before throttling
  - Expected: Clearer eyes, nose, lips, and jawline definition
