# V11 Proposal Experience Platform

Status: V11.0A research checkpoint  
Scope: documentation only  
Production behavior changed: no

## Strategic Pivot

GT63 / 2L1P started with the correct early architecture:

```text
Screenshot -> OCR -> Parser -> Offer -> PDF
```

That flow proved the first product surface, but it is not the final product.

The V11 direction is:

```text
Input -> Unified Travel JSON -> Luxury Proposal Experience -> HTML / PDF / WhatsApp / Email
```

Extraction remains important, but it is infrastructure. The durable product value is the proposal experience that agencies can send to clients.

## Product Definition

GT63 is a Luxury Travel Proposal Operating System.

Travel agents do not buy OCR. They do not buy parser accuracy by itself. They buy the ability to create premium, client-ready travel proposals faster, with better presentation, stronger trust, and a higher chance of closing the client.

The product should continue to accept screenshots, PDFs, manual input, OCR, Vision JSON, or future extraction engines. Those are input modules. The core platform should own the higher-value layer:

```text
Travel Offer JSON -> Luxury Client Proposal
```

## Strategic Principle

Extraction is the staircase. The proposal experience is the house.

OCR, Vision JSON, Lift, NuExtract, DeepSeek OCR, Gemini, Docling, Marker, and similar tools should be treated as replaceable input modules. If extraction becomes easier or commoditized, GT63 should become stronger because it can use any extractor while preserving the same proposal engine and agency workflow.

## Architecture Layers

### 1. Input Layer

Accepts source material from operators:

- flight screenshots
- hotel screenshots
- PDFs
- manual form input
- copied text
- future supplier/API imports

The input layer should not be the product center. Its job is to collect source material and preserve evidence for review.

### 2. Extraction Layer

Converts input into structured candidates:

- existing OCR/parser flow
- Vision JSON spike
- future document extraction engines
- manual correction by operator

This layer can improve over time, but V11 should avoid making extraction perfection a blocker for product value.

### 3. Unified Travel JSON Layer

Normalizes extracted and manually entered data into one stable internal shape.

First direction:

```json
{
  "client": {},
  "destination": {},
  "dates": {},
  "travelers": [],
  "flights": [],
  "hotels": [],
  "rooms": [],
  "images": [],
  "price": {},
  "margin": {},
  "inclusions": [],
  "exclusions": [],
  "notes": [],
  "agencyBranding": {},
  "deliveryOptions": {}
}
```

The Unified Travel JSON should become the boundary between extraction work and proposal rendering.

### 4. Travel Knowledge Layer

Adds context and selling power:

- destination mood
- neighborhood framing
- seasonality notes
- practical travel advice
- hotel positioning
- why this trip fits the client
- optional experiences and upgrades

This layer turns raw travel data into a client-facing story.

### 5. Luxury Proposal Engine

Renders a premium proposal experience from Unified Travel JSON.

It should support:

- mobile-first HTML
- PDF-safe layout
- strong visual hierarchy
- agency branding
- reusable sections
- template variants

### 6. Delivery Layer

Packages the proposal for real agency workflows:

- client web link
- PDF export
- WhatsApp version
- email version
- print-safe version later if needed

### 7. Agency Workflow Layer

Keeps the operational loop:

- draft
- sent
- viewed
- booked
- cancelled/lost
- margin visibility
- client history
- operator review

## Proposal Components

The proposal should feel like a premium travel presentation, not a database printout.

Core components:

- cinematic hero
- destination mood intro
- trip overview
- flight summary
- hotel showcase
- room or villa section
- gallery
- optional itinerary
- why this trip
- inclusions and exclusions
- price presentation
- terms and validity
- concierge note
- agent signature
- WhatsApp CTA

## Design Principles

- premium editorial layout
- large imagery
- whitespace
- fewer tables
- more storytelling
- luxury typography
- clear price hierarchy
- mobile-first HTML
- PDF-safe layout
- agency branding
- fast operator review
- client clarity over technical completeness

## V11 Roadmap

### V11.0A - Proposal Experience Platform Research

Create this strategic document. No code changes.

### V11.0B - Static Luxury HTML Prototype

Build a static premium proposal from sample Unified Travel JSON.

Goal: prove the client experience before wiring new extraction work.

### V11.0C - Connect Prototype To Existing Offer Data

Map current offer data into the prototype without changing import behavior.

Goal: reuse today's working data while improving presentation.

### V11.0D - PDF Export Polish

Make the HTML proposal export cleanly to PDF.

Goal: one source of truth for web and PDF presentation.

### V11.0E - WhatsApp / Email Versions

Create short-form proposal variants for real sales channels.

Goal: help agencies send client-ready material faster.

### V11.1 - Agency Branding And Template System

Introduce brand controls and reusable proposal templates.

Goal: turn GT63 from an internal builder into a repeatable agency operating system.

## Explicit Pause List

Paused unless production-critical:

- new parser profiles
- rare OCR edge-case fixes
- confidence threshold tuning
- new flight-site support
- itinerary tokenizer expansion
- extraction perfection as a primary goal

Allowed:

- minimal extraction maintenance
- regression safety
- Vision Spike as research
- low-risk shadow migrations already in progress
- fixes that protect existing production behavior

## Non-Goals

Do not use V11.0A to:

- rewrite OCR
- rewrite the parser
- change flight import behavior
- change hotel import behavior
- optimize confidence thresholds
- change production offer generation
- change client pages
- start a new extraction architecture

## Decision

V10.26A remains valid as a research track.

The main product direction now shifts toward:

```text
Unified Travel JSON -> Luxury Proposal Experience
```

The next high-value implementation checkpoint is not another parser fix. It is a static luxury HTML proposal prototype from sample JSON.
