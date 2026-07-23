# GT63 Design Documentation

Version: 1.0

Status: CANONICAL

Approved: Founder

Lock: GT63 DESIGN LAYER v1.0 LOCKED

## Purpose

This folder contains the GT63 Design Layer. It is the second permanent documentation layer after the Brand Layer.

These documents do not define implementation. They define the timeless design behavior of GT63.

## Relationship with the Brand Layer

Brand defines WHY.

Design defines HOW.

Implementation comes later.

The Brand Layer explains the emotional, philosophical and language foundation of GT63. The Design Layer translates that foundation into page structure, visual hierarchy, reusable components and presentation behavior.

Before using this folder, read:

1. `../brand/GT63_EXPERIENCE_BIBLE_EN.md`
2. `../brand/GT63_DESIGN_RULES.md`
3. `../brand/GT63_WORDS.md`

## Documents

### GT63_SIGNATURE_JOURNEY_BOOK.md

Defines the canonical Journey Book from Cover to Final Page.

Use it when deciding what pages a premium GT63 presentation should include, what each page should feel like and what must never appear.

### GT63_DESIGN_SYSTEM.md

Defines the universal visual language of GT63.

Use it when making decisions about hierarchy, grids, typography, whitespace, color, photography, iconography, motion and editorial style.

### GT63_COMPONENT_LIBRARY.md

Defines reusable GT63 presentation components at a conceptual level.

Use it when deciding whether a component should exist, what emotion it should create and how it should support the journey decision.

## Priority

Use this priority order:

1. Brand Layer
2. `GT63_SIGNATURE_JOURNEY_BOOK.md`
3. `GT63_DESIGN_SYSTEM.md`
4. `GT63_COMPONENT_LIBRARY.md`
5. Future implementation documents

If the Design Layer conflicts with the Brand Layer, the Brand Layer wins.

If implementation conflicts with the Design Layer, stop and report the conflict before changing the system.

## What This Layer Does Not Contain

This layer does not contain:

- code;
- markup;
- styling syntax;
- framework choices;
- rendering methods;
- production configuration;
- product logic;
- business rules.

Those belong to implementation layers that come later.

## How AI Should Use This Folder

Before creating or changing a GT63 client-facing presentation, an AI system should:

1. Read the Brand Layer.
2. Read the Signature Journey Book.
3. Read the Design System.
4. Read the Component Library when reusable presentation elements are involved.
5. Explain how the proposed work supports the North Star.
6. Report any conflict before execution.

## Versioning

This is Design Layer v1.0.

Future versions may add patterns, refine components and expand examples. They should not rewrite the timeless principles of emotion, clarity, trust, restraint and editorial quality.

## Final Rule

No GT63 implementation should begin from a blank visual opinion.

It should begin from Brand, then Design, then execution.
