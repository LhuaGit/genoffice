---
name: ppt-beautify-planner
description: Plan and execute design-led beautification of an existing PowerPoint slide in GenOffice while preserving its content and editable Office objects. Use when the user asks to beautify, polish, tidy, restyle, improve hierarchy, fix spacing/alignment, or make an existing PPT/page more professional. Use only with GenOffice Slides tools; do not use for creating a new presentation or for Python/SVG/PPTX file-generation workflows.
---

# PPT Beautify Planner

Improve an existing slide by applying explicit presentation-design judgment, then realize the plan only through GenOffice Slides tools.

## Boundaries

- Treat the open GenOffice deck as the only editable artifact.
- Preserve wording, figures, chart data, page order, and existing editable objects unless the user explicitly requests a change.
- Never run shell, Python, Node.js, SVG generation, OOXML patching, or direct filesystem writes.
- Never invoke PPT Master's generation, project, confirmation, validation, or export workflow.
- Use only tools exposed by the GenOffice Slides host. If the required tool is unavailable, return the plan and state that execution is unavailable; do not substitute another runtime.
- Default to in-place editing. Use `regenerate_slide` only when the user explicitly requests a redesign or the page cannot reasonably be repaired with existing elements.

## Required References

Read these before planning:

1. [design-principles.md](references/design-principles.md) for hierarchy, density, rhythm, and preservation rules.
2. [genoffice-tool-contract.md](references/genoffice-tool-contract.md) for the allowed execution mapping.
3. [beautify-plan.md](references/beautify-plan.md) for the plan contract.

Additionally read:

- [layout-patterns.md](references/layout-patterns.md) when changing page structure or alignment.
- [visual-directions.md](references/visual-directions.md) when the user has not supplied a visual direction or asks for a new style.

## Workflow

1. Establish scope from the latest deck outline, current page, and selection. Do not assume an older page order.
2. Inspect the target page using `read_slide` when full text, paragraph formatting, or element details are needed. For pure relative layout edits, `execute_slide_script` may read `els` directly.
3. Identify the communication job of the page: headline, evidence, comparison, sequence, decision, summary, or call to action.
4. Diagnose only material issues: hierarchy, grouping, alignment, spacing, density, typography, color use, or inconsistent bullet formatting.
5. Form a `BeautifyPlan` following [beautify-plan.md](references/beautify-plan.md). Every operation must name existing element ids or an explicitly justified new element.
6. Give the user a one- or two-sentence design direction when the change is broad.
7. Execute the whole in-place plan with as few `execute_slide_script` calls as possible. Use specialized GenOffice tools only where the tool contract requires them.
8. Inspect the returned layout and paragraph-format audit. Repair high-confidence findings immediately, with at most two focused rounds.
9. Stop when the plan is satisfied and the audit passes. Do not continue redesigning elements that already meet the plan.

## Decision Rules

- Prefer one strong hierarchy over many decorative treatments.
- Prefer alignment, spacing, scale, and whitespace before adding shapes or effects.
- Keep one dominant visual idea per page.
- Reuse existing colors and fonts unless the user asks for a style change or the current styling is objectively inconsistent.
- Do not turn every paragraph into a card. Use containers only when they clarify grouping or comparison.
- Do not add literal bullet glyphs to text that already has a native PowerPoint bullet.
- Do not specify `fontFamily` unless the user names a font or the plan explicitly changes the deck typography.
- For a multi-page request, establish shared tokens once, then edit page by page without forcing identical layouts.

## Execution Modes

### In-place polish

Use for alignment, spacing, visual hierarchy, text styling, color cleanup, card consistency, and bullet formatting. Preserve element identity and use `execute_slide_script` as the primary executor.

### Whole-page redesign

Use only for an explicit redesign request or a structurally unusable page. Read the complete source copy first, retain it verbatim in the brief, then call `regenerate_slide`. Do not follow regeneration with unsolicited native-tool polishing.

## Source Note

The design-planning separation and selected presentation heuristics are adapted from the MIT-licensed [PPT Master](https://github.com/hugohe3/ppt-master) project by Hugo He. This Skill intentionally excludes PPT Master's SVG, Python, project-management, and PPTX-export implementation.
