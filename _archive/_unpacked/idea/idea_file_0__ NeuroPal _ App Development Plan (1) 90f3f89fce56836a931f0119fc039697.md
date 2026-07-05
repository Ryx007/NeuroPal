# 📍 NeuroPal — App Development Plan (1)

**Last updated:** April 2026 | **Status:** Pre-build | **Branches:** A (React Native + Expo) · B (Flutter)

> This document is the primary reference for the NeuroPal development team. It covers the full build roadmap, sprint structure, module ownership, and workflow conventions. Read the [Full Technical Instruction Document](https://www.notion.so/NeuroPal-Full-Technical-Instruction-Document-3403f89fce5681a7b086c394cac3f8fe?pvs=21) for complete stack details.
> 

---

## 🎯 Product Overview

**NeuroPal** is a neurodivergent-focused learning and life management platform. It is a product platform, not a single app. It targets adults with ADHD, autism, AuDHD, BPD, PTSD, and related conditions.

The product has two inseparable identities:

- A **study and research tool** (NeuroReader: TTS reading of documents with AI-powered Q&A)
- A **daily regulatory system** (SCAFFOLD framework: anchors, state management, task menus, DBT tools)

These two aspects are integrated, not separate. The AI companion knows about both and connects them.

**Target platforms:** iOS · Android · Web (browser) · Windows · macOS · Linux · Smartwatch (post-MVP)

---

## 🛠️ Stack Summary

| Layer | Technology |
| --- | --- |
| Backend | Python / FastAPI |
| Database + Auth + Storage | Supabase |
| RAG Pipeline | LlamaIndex + Supabase pgvector |
| AI | Anthropic Claude API (claude-sonnet-4-20250514) |
| TTS | ElevenLabs (primary) / Google Cloud TTS (fallback) |
| Mobile Branch A | React Native + Expo |
| Mobile Branch B | Flutter |
| Web (Branch A) | React Native Web + Next.js |
| Web (Branch B) | Flutter Web |
| Backend hosting | Railway or Render |
| Web hosting | Vercel |
| Smartwatch | watchOS (Swift) + WearOS (Kotlin) — post-MVP |

---

## 🤝 Team & AI Tool Roles

| Role | Responsibility |
| --- | --- |
| Ryx (developer lead) | Product decisions, backend Python, architecture oversight, UX review |
| Fellow developer | To be assigned per branch preference — see Branch Assignment below |
| Claude / Claude Code | Backend architecture, RAG pipeline, FastAPI routes, Supabase schema, auth, refactors, accessibility audits |
| Codex / ChatGPT | Branch A frontend: React Native screens, Expo components, NativeWind styling |
| Gemini / Google AI | Branch B frontend: Flutter widgets, Material 3, Dart UI components |
| Stitch | UX flow exploration and wireframes before any implementation |
| GitHub Copilot | Inline acceleration throughout all sessions |
| Figma | Design system, component library, handoff |
| NotebookLM | Requirements, research synthesis, feature documentation |

### Branch Assignment

Both branches run in parallel for the first 2–3 weeks (NeuroReader MVP sprint). Whichever branch produces a working TTS + document upload screen first, or whichever feels more sustainable for the team, becomes the primary branch. The other is archived but not deleted.

- **Branch A (React Native + Expo):** Faster to first prototype. Strongest fit for Codex. Lower Dart learning curve.
- **Branch B (Flutter):** True native desktop binaries. Strongest fit for Gemini. Single codebase for all 6 platforms.

---

## 🗓️ Development Phases

### Phase 0 — Setup (Week 0)

Before writing any feature code:

- [ ]  Create GitHub repository with two branches: `branch-a-expo` and `branch-b-flutter`
- [ ]  Initialise Branch A: `npx create-expo-app neuropal --template`
- [ ]  Initialise Branch B: `flutter create neuropal`
- [ ]  Set up Supabase project: database, auth, storage buckets, pgvector extension enabled
- [ ]  Set up FastAPI project structure: `/api`, `/rag`, `/tts`, `/auth`, `/scaffold`
- [ ]  Configure environment variables: Supabase keys, Claude API key, ElevenLabs API key
- [ ]  Set up Railway/Render project for backend deployment
- [ ]  Set up Vercel project for web deployment
- [ ]  Connect GitHub to both hosting services (auto-deploy on push to main)
- [ ]  Run Stitch to generate initial UI flows (use the Stitch prompt in the Technical Instruction Document)
- [ ]  Lock design system in Figma from Stitch outputs

---

### Phase 1 — NeuroReader MVP (Weeks 1–4)

**Goal:** A working app where a user can upload a document, have it read aloud with speed/voice controls, and ask questions about it.

This phase is non-negotiable before anything else is built. NeuroReader is the core.

#### Sprint 1.1 — Document Upload + Display (Week 1)

**Backend (Claude Code):**

- [ ]  FastAPI endpoint: `POST /documents/upload` — accepts PDF, DOCX, EPUB, TXT
- [ ]  Supabase Storage bucket: `documents` — authenticated upload
- [ ]  Document metadata table in Supabase: `id, user_id, filename, type, upload_date, page_count, status`
- [ ]  Text extraction pipeline: PyMuPDF (PDF), python-docx (DOCX), ebooklib (EPUB)
- [ ]  FastAPI endpoint: `GET /documents` — list user's documents
- [ ]  FastAPI endpoint: `GET /documents/{id}` — retrieve document text by page

**Frontend Branch A (Codex):**

- [ ]  Document Library screen: grid/list of uploaded documents, upload FAB, empty state
- [ ]  File picker integration: expo-document-picker
- [ ]  Upload progress indicator
- [ ]  Document card component: title, type badge, last opened

**Frontend Branch B (Gemini):**

- [ ]  Same screens in Flutter
- [ ]  file_picker integration
- [ ]  Document card widget

---

#### Sprint 1.2 — TTS Engine + Reading Mode (Week 2)

**Backend (Claude Code):**

- [ ]  FastAPI endpoint: `POST /tts/generate` — accepts text chunk + voice settings, returns audio stream
- [ ]  ElevenLabs API integration: voice selection, WPM speed mapping to stability/similarity settings
- [ ]  Google Cloud TTS fallback endpoint
- [ ]  Audio streaming: chunked response for low-latency playback start
- [ ]  Word-timing data: generate timestamp-per-word for highlight sync

**Frontend Branch A (Codex):**

- [ ]  Reading Mode screen: text display with dyslexia-friendly font (OpenDyslexic), adjustable size and line spacing
- [ ]  Persistent bottom playback bar: play/pause, speed slider (WPM), voice selector
- [ ]  Highlighted word tracking: word highlight moves with audio position using word-timing data
- [ ]  expo-av audio streaming integration
- [ ]  Reading environment settings: background colour picker, font selector, line spacing slider

**Frontend Branch B (Gemini):**

- [ ]  Same in Flutter using just_audio
- [ ]  Custom word-highlight widget
- [ ]  Bottom sheet playback controls

---

#### Sprint 1.3 — RAG Pipeline + Document Q&A (Weeks 3–4)

**Backend (Claude Code):**

- [ ]  LlamaIndex pipeline: document ingestion → chunking → embedding → Supabase pgvector storage
- [ ]  Embedding model: text-embedding-3-small (OpenAI) or Voyage AI — evaluate cost vs quality
- [ ]  FastAPI endpoint: `POST /documents/{id}/query` — accepts question, returns Claude-generated answer grounded in document chunks
- [ ]  Context assembly: retrieve top-k relevant chunks, inject into Claude prompt, return answer with source references
- [ ]  Conversation history: store Q&A pairs per document in Supabase

**Frontend Branch A (Codex):**

- [ ]  Collapsible Q&A panel (slides up from bottom in Reading Mode)
- [ ]  Question input field + send button
- [ ]  Answer display: markdown rendering, source reference chips
- [ ]  Conversation history within the panel
- [ ]  Loading state during Claude response generation

**Frontend Branch B (Gemini):**

- [ ]  Same in Flutter
- [ ]  Bottom sheet Q&A panel
- [ ]  flutter_markdown for answer rendering

**Branch evaluation checkpoint:** At end of Sprint 1.3, assess both branches. Choose primary branch for Phase 2 onwards.

---

### Phase 2 — Auth + Onboarding + Core Infrastructure (Weeks 5–6)

**Goal:** Users can create accounts, complete onboarding, and have personalised framework data persisted.

#### Sprint 2.1 — Authentication (Week 5)

**Backend (Claude Code):**

- [ ]  Supabase Auth: email/password + OAuth (Google)
- [ ]  FastAPI auth middleware: JWT validation, protected routes
- [ ]  User profile table: `id, email, conditions[], energy_pattern, timezone, created_at`
- [ ]  Row-level security policies on all user data tables

**Frontend:**

- [ ]  Sign up screen
- [ ]  Sign in screen
- [ ]  OAuth button (Google)
- [ ]  Password reset flow
- [ ]  Protected route handling

#### Sprint 2.2 — Onboarding (Week 6)

**Design:** Stitch → Claude accessibility review → Figma → implement

- [ ]  Step 1: Condition profile (checkboxes, all optional, skip available)
- [ ]  Step 2: Energy pattern (morning/night/variable — slider or card selection)
- [ ]  Step 3: Primary use case (reading papers, daily regulation, both)
- [ ]  Step 4: Personalised summary screen showing what NeuroPal will do for them specifically
- [ ]  One question per screen, dot-row progress indicator, back navigation always available
- [ ]  Skip option on every step
- [ ]  Onboarding data saved to Supabase user profile

---

### Phase 3 — SCAFFOLD Framework Builder (Weeks 7–8)

**Backend (Claude Code):**

- [ ]  Framework table: `id, user_id, anchors[], float_zones[], task_menus{}, mvd_tasks[], created_at, updated_at`
- [ ]  CRUD endpoints for anchors, float zones, task menus, MVD
- [ ]  Daily state log table: `id, user_id, date, morning_state, midday_state, evening_state, notes`

**Frontend:**

- [ ]  Framework Builder screen: step-by-step configuration (condition profile → anchors → float zones → task menus)
- [ ]  Daily Anchors screen: vertical timeline, status indicators (done/next/pending), add/edit anchor
- [ ]  Task Menu Builder: zone-based menus, micro-entry enforcement, add/remove tasks
- [ ]  MVD generator: auto-suggests 3 tasks (one per zone) based on current menus
- [ ]  Home Dashboard: MVD checklist, state check-in widget, next anchor, medication strip

---

### Phase 4 — State Management + DBT Toolkit (Week 9)

**Frontend:**

- [ ]  State check-in: 3-button Green/Yellow/Red interface (large, accessible, 3-second interaction)
- [ ]  State-conditional routing: app surface changes based on reported state
- [ ]  Green → shows task menu and High Demand options
- [ ]  Yellow → shows Yellow Protocol steps, then routes to Medium Demand menu
- [ ]  Red → shows TIPP protocol cards, no task routing until re-check
- [ ]  Protocol library: TIPP, ACCEPTS, physiological sigh, grounding — step-by-step card sequences
- [ ]  Daily state log with 7-day trend chart
- [ ]  Defusion scripts: quick-access text cards for specific spiral types

---

### Phase 5 — Claude AI Companion (Weeks 10–11)

**Backend (Claude Code):**

- [ ]  AI companion endpoint: `POST /companion/chat` — accepts message + user context bundle
- [ ]  Context bundle: condition profile, current state, today's MVD, active document (if open), weekly state average
- [ ]  System prompt construction: assembles personalised context per user
- [ ]  Streaming response: SSE (Server-Sent Events) for real-time text display
- [ ]  Conversation history: stored per user in Supabase, last 20 exchanges in context
- [ ]  Source citation: companion always references peer-reviewed sources for condition-related claims

**Frontend:**

- [ ]  AI Companion chat screen
- [ ]  Streaming message display
- [ ]  Quick action buttons (common prompts per current state)
- [ ]  Source reference chips on AI responses
- [ ]  "Ask about this document" shortcut from Reading Mode

---

### Phase 6 — Science Resource Library (Week 12)

- [ ]  Supabase table: `resources` — title, authors, journal, year, DOI, abstract, plain_summary, condition_tags[], quality_type (meta-analysis/RCT/review/study)
- [ ]  Curated seed data: 50+ peer-reviewed papers covering ADHD, ASD, AuDHD, BPD, PTSD, executive function, DBT, time perception
- [ ]  Search and filter by condition, quality type, recency
- [ ]  Every entry links to original source DOI
- [ ]  Myth-busting section: common claims vs what evidence actually shows
- [ ]  Scopus API integration: `scopus_search.py` FastAPI module for live search

---

### Phase 7 — Financial Regulation Module (Week 13)

- [ ]  Spending log table: `id, user_id, amount, category, state_at_time, timestamp, notes`
- [ ]  State-spending correlation: query shows spending distribution across Green/Yellow/Red states
- [ ]  Pre-purchase pause: optional flag, triggers 10-minute wait and state check before logging
- [ ]  Bare minimum budget calculator: fixed expenses input, shows remaining
- [ ]  No bank API integration at this stage — manual logging only
- [ ]  Zero shame language throughout — all copy reviewed by Claude for tone

---

### Phase 8 — Professional Connection Directory (Week 14)

- [ ]  Directory table: `id, name, type, location, conditions_specialised[], approaches[], languages[], cost_range, telehealth, website, verified`
- [ ]  Seed data: ND-affirming professionals in Italy, India (Kolkata), UK, EU
- [ ]  Search: location, condition, approach (DBT/EMDR/ACT/somatic), telehealth, cost
- [ ]  Crisis resources: hardcoded, always at top of screen, country-specific
- [ ]  No paid placement, no referral fees — enforced at data model level (no monetization fields in schema)
- [ ]  Appointment preparation guides: static content per condition

---

### Phase 9 — Mobile Polish + App Store Submission (Weeks 15–16)

- [ ]  Full accessibility audit (Claude review + manual VoiceOver/TalkBack testing)
- [ ]  Reduced motion mode
- [ ]  Dark/light theme toggle
- [ ]  Offline mode: cached documents and framework data accessible without connection
- [ ]  Push notification system: medication reminders, anchor alerts, state check-in prompts
- [ ]  App Store assets: screenshots, preview video, description (Canva for graphics)
- [ ]  Privacy policy and terms of service
- [ ]  Beta testing: TestFlight (iOS) + Google Play Internal Testing
- [ ]  Public launch

---

### Phase 10 — Smartwatch Companion (Q4 2026)

- [ ]  watchOS app (Swift): state check-in, medication haptics, anchor alerts, TIPP emergency trigger
- [ ]  WearOS app (Kotlin): same feature set
- [ ]  Bluetooth sync for offline scenarios
- [ ]  Optional HRV passive collection (explicit opt-in, stored locally)

---

## 📋 Standard Workflow (Every Feature)

1. **Stitch** → generate 3–5 UX flow variants for the feature
2. **Claude** → critique for cognitive load, accessibility, predictability for ND users
3. **Figma** → finalise the chosen direction into the design system
4. **Codex** (Branch A) or **Gemini** (Branch B) → implement the frontend
5. **Claude Code** → backend integration, refactor, cleanup
6. **Copilot** → inline speed throughout steps 4 and 5
7. **Claude** → accessibility audit before merging

---

## 🔒 Git Conventions

- `main` — production-ready only, protected branch
- `branch-a-expo` — React Native + Expo development
- `branch-b-flutter` — Flutter development
- `backend` — FastAPI backend development
- Feature branches: `feature/[branch]-[module]-[description]` e.g. `feature/branch-a-neuroreader-tts-engine`
- Commit format: `[module] short description` e.g. `[neuroreader] add word-timing endpoint`
- PRs required before merging to main; Claude Code reviews for architecture issues

---

## ✅ Definition of Done (Every Feature)

A feature is complete when:

- [ ]  Backend endpoint tested with Postman or equivalent
- [ ]  Frontend screen renders correctly on iOS, Android, and web
- [ ]  Passes VoiceOver / TalkBack manual smoke test
- [ ]  Minimum 44x44pt tap targets on all interactive elements
- [ ]  Empty state and loading state implemented
- [ ]  No console errors or warnings
- [ ]  Claude accessibility audit passed

---

## 📞 Key Contacts

| Person | Role | Contact |
| --- | --- | --- |
| Ryx | Developer lead, product owner | [rajdeepryxmukherjee@gmail.com](mailto:rajdeepryxmukherjee@gmail.com) |
| Fellow developer | TBD | TBD |

---

## 🔗 Related Documents

- [NeuroPal — Project Prompt (for Claude project instructions)](https://www.notion.so/NeuroPal-Project-Prompt-Claude-Project-Instructions-3403f89fce5681c2a114f48b2e347a81?pvs=21)
- [NeuroPal — Full Technical Instruction Document](https://www.notion.so/NeuroPal-Full-Technical-Instruction-Document-3403f89fce5681a7b086c394cac3f8fe?pvs=21)
- [SCAFFOLD Framework — Master Reference](https://www.notion.so/Master-Reference-Ryx-s-Framework-Psychology-Project-Map-33b3f89fce5681b0aec2c73d0484d750?pvs=21)

[](https://www.notion.so/3403f89fce568021b53de9cccf4a978b?pvs=21)