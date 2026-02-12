# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

RDSExpert is an advanced RDS (Radio Data System) and RBDS decoder for TEF webservers. It connects to TEF servers via WebSocket, decodes raw RDS group data in real time, and presents the decoded information through a dark-themed technical UI. Deployed to GitHub Pages at https://lucasgallone.github.io/RDSExpert/.

## Build & Development Commands

- `npm run dev` — Start Vite dev server with HMR
- `npm run build` — TypeScript type-check + Vite production build (outputs to `dist/`)
- `npm run preview` — Preview the production build locally

No test framework, linter, or formatter is configured.

## Tech Stack

- **React 18** with function components and hooks (no class components)
- **TypeScript 5** in strict mode
- **Vite 4** as build tool and dev server
- **Tailwind CSS** loaded via CDN in `index.html` (not via PostCSS/npm)
- **jsPDF** for PDF export functionality
- **Font Awesome 6** icons via CDN
- Fonts: JetBrains Mono (monospace displays), Inter (UI text)

## Architecture

### State Management

All application state lives in `App.tsx` via `useState`/`useRef` hooks. The central `RdsData` interface (defined in `types.ts`) holds the full decoder state. Props are drilled down to child components — there is no context API or state management library.

### Data Flow

1. **WebSocket connection** (`App.tsx`) connects to a TEF webserver
2. **Raw RDS groups** arrive as binary data and are parsed into 4-block groups
3. **Group handlers** in `App.tsx` decode each group type (0A/0B through 15A/15B) and update `RdsData` state
4. **Child components** receive decoded state as props and render the UI

### RDS Group Decoding (App.tsx, ~2000 lines)

The core decoding logic processes RDS group types including:
- **0A/0B**: PI, PS characters (with stability checking), Alternative Frequencies, flags (TP/TA/MS/Stereo)
- **1A/1B**: ECC, LIC, PIN
- **2A/2B**: RadioText with dual A/B buffers and mask-based completion tracking
- **3A**: ODA Application Identification (up to 5 concurrent)
- **4A**: Clock Time (CT)
- **8A**: TMC (Traffic Message Channel) messages
- **10A**: PTYN (Program Type Name)
- **12A**: RT+ tag extraction
- **14A/14B**: EON (Enhanced Other Networks)
- **15A/15B**: Long PS (32 characters)

A custom `RDS_G2_MAP` character table maps RDS character codes to Unicode.

### Component Responsibilities

| Component | Purpose |
|---|---|
| `App.tsx` | WebSocket connection, RDS group decoding, all state management |
| `LcdDisplay.tsx` | LCD-style display for PS, RT, Long PS, PTYN with underscore visualization modes |
| `InfoGrid.tsx` | Alternative Frequencies (Method A cumulative / Method B grouped) and EON network data |
| `GroupAnalyzer.tsx` | Real-time RDS group stream with color coding, hex view, and group count statistics |
| `TmcViewer.tsx` | TMC message list/detail view with pause/resume (max 500 messages) |
| `HistoryControls.tsx` | PS/RT history (last 14 entries), PDF export, bandscan recording with metadata |

### Constants (constants.ts, ~26K lines)

Large lookup tables: ODA application IDs, ECC country codes, LIC language codes. This file is intentionally large — it contains reference data needed for RDS decoding.

### Types (types.ts)

All TypeScript interfaces and enums: `RdsData`, `BandscanEntry`, `EonNetwork`, `TmcMessage`, `RtPlusTag`, `ConnectionStatus`, PTY arrays (RDS/RBDS/Combined).

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) builds and deploys to GitHub Pages on every push to `main`. Uses Node.js 20. The Vite config uses `base: './'` for relative asset paths required by GitHub Pages.

## Domain-Specific Notes

- RDS decoding intentionally prioritizes accuracy over sensitivity — weak signals may not decode fully
- HTTPS-only constraint due to browser mixed-content restrictions (HTTP variant hosted separately by @Bkram)
- Mobile layout requires landscape orientation
- AF (Alternative Frequencies) has two distinct methods (A and B) with different data structures and display logic
