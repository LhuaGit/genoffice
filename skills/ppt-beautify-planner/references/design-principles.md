# Design Principles

## Preserve before improving

Classify every input as one of:

- Literal: wording, numbers, page order, or brand values that must remain exact.
- Semantic: facts and relationships that must remain true while expression may change.
- Reference: a direction to preserve while adapting its realization.
- Permission: an available option, not a quota that must be used.

For ordinary beautification, treat copy, figures, chart data, and existing image meaning as Literal. Treat the current layout and styling as Reference unless the user explicitly locks them.

## Communication hierarchy

Make the page answer these questions in order:

1. What is the single takeaway?
2. What evidence or structure supports it?
3. What should the audience notice, decide, or do next?

Use title, emphasis, position, scale, and whitespace to encode that order. Avoid giving equal visual weight to unrelated items.

## Composition

- Contrast: create an intentional difference in role, not random variety.
- Repetition: reuse tokens, corner treatment, alignment anchors, and spacing intervals.
- Alignment: align to a small number of shared edges or centers.
- Proximity: keep related elements closer than unrelated elements.
- Whitespace: reserve empty space around the main message; do not fill space merely because it exists.
- Rhythm: use a consistent spacing unit and deliberate larger jumps between sections.

## Density

- Prefer one title region and one primary content region.
- Use two or three visual groups for most business slides.
- Reduce decoration before shrinking body text.
- Keep body text concise, but do not rewrite or delete user copy during a preserve-content beautification.
- If content cannot fit without becoming unreadable, report the conflict instead of silently removing content.

## Typography

- Keep title, subtitle, body, annotation, and numeric-emphasis roles distinct.
- Within a role, keep font family, size, color, and alignment consistent.
- Avoid more than three materially different text sizes on a normal content slide.
- Use bold selectively for hierarchy; do not bold entire dense paragraphs.
- Preserve the theme font by omitting `fontFamily` unless changing typography is explicit.

## Color

- Use the existing deck palette as the default source of truth.
- Use one dominant accent and, when needed, one secondary accent.
- Reserve the strongest accent for the primary takeaway or action.
- Ensure readable text/background contrast.
- Do not introduce a new color solely to make each sibling item different.

## Objective formatting defects

Always repair these when detected:

- Native bullet plus a literal bullet marker in paragraph text.
- Same-level bullets with inconsistent indentation or text size without semantic reason.
- Text overflow, clipping, or canvas overflow.
- Unintentional text-to-text or text-to-media overlap.
- Ragged sibling alignment or spacing caused by accidental offsets.
