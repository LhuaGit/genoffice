# GenOffice Tool Contract

## Allowed execution surface

Use only tools that the GenOffice Slides host exposes. Do not invent tool names.

| Design need | Preferred tool |
|---|---|
| Inspect complete page content and formatting | `read_slide` |
| Inspect the latest whole-deck outline | `get_deck_context` |
| Move, resize, align, distribute, restyle, recolor, or edit several elements | `execute_slide_script` |
| Replace one element's complete text | `set_element_text` or `setText` inside `execute_slide_script` |
| Change one element's text style | `set_element_style` or `setStyle` inside `execute_slide_script` |
| Change fill or stroke | `setFill` / `setStroke` inside `execute_slide_script` |
| Add or delete a justified element | The corresponding GenOffice `add_*` / `delete_element` tool |
| Explicitly redesign a whole page | `regenerate_slide` |

## In-place editing rules

- Use current element ids and runtime `els`; never guess ids or coordinates.
- Compute relative layout from current boxes and `canvas`, not remembered coordinates.
- Batch related edits in one script.
- Use formulas for margins, columns, gaps, and alignment anchors.
- Keep locked decorations unchanged.
- Direct children of a top-level group may be edited through their exposed ids; nested group contents require the host's ungroup workflow.
- Treat a successful tool call as execution evidence, not quality evidence. Read and respond to the returned audit.

## Forbidden substitutions

Do not use:

- shell, Bash, Python, Node.js, or subprocesses
- filesystem editing of `.pptx`, SVG, HTML, or OOXML
- PPT Master scripts
- external MCP tools for slide mutation
- a newly generated file as a substitute for editing the open deck

## Script pattern

Use a small number of explicit role selections and shared measurements:

```javascript
const title = els.find(e => e.id === 'title-id');
const items = els.filter(e => /^item-/.test(e.id));
const margin = 80, gap = 24;
const width = (canvas.w - 2 * margin - (items.length - 1) * gap) / items.length;
items.forEach((item, i) => setBox(item.id, {
  x: margin + i * (width + gap),
  y: 210,
  w: width,
  h: 300
}));
setStyle(title.id, { fontSize: 38, bold: true });
```

Adapt the pattern to real ids and boxes. Do not copy placeholder ids into a tool call.
