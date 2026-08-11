# BeautifyPlan Contract

Form this plan before mutation. It may remain internal unless the user requests the plan, but every executed operation must trace to it.

```json
{
  "scope": {
    "slideIndexes": [0],
    "selectedElementIds": []
  },
  "preserve": [
    "copy",
    "figures",
    "chart-data",
    "page-order",
    "editable-objects"
  ],
  "communicationJob": "evidence",
  "diagnosis": [
    "weak hierarchy",
    "uneven sibling spacing"
  ],
  "direction": {
    "layoutPattern": "three-card-evidence",
    "visualDirection": "business-briefing",
    "rationale": "Make the three evidence groups comparable while preserving the deck identity."
  },
  "tokens": {
    "marginPx": 80,
    "gapPx": 24,
    "titlePt": 38,
    "bodyPt": 18
  },
  "operations": [
    {
      "elementIds": ["item-1", "item-2", "item-3"],
      "action": "distribute-horizontal",
      "reason": "Equal sibling rhythm"
    }
  ],
  "verification": [
    "no layout audit issues",
    "no paragraph-format audit issues",
    "all preserved content remains"
  ]
}
```

## Field rules

- `slideIndexes`: use current 0-based tool indexes.
- `preserve`: include every invariant applicable to the request.
- `communicationJob`: one of `headline`, `evidence`, `comparison`, `sequence`, `decision`, `summary`, `call-to-action`, or a short custom value.
- `diagnosis`: include only issues supported by page data or an attached rendering.
- `layoutPattern`: select from `layout-patterns.md` or state a concrete custom arrangement.
- `visualDirection`: select from `visual-directions.md`, preserve the existing deck direction, or state a concrete custom direction.
- `tokens`: derive from existing deck values where possible; avoid arbitrary magic numbers.
- `operations`: use existing element ids. Adding an element requires a direct reason tied to comprehension.
- `verification`: always include content preservation and relevant audits.

## Failure conditions

Do not execute when:

- the requested page or element cannot be identified;
- the page data is stale after a regenerate/ungroup operation;
- preserving all content conflicts with readable layout and the user has not chosen a trade-off;
- the plan requires a tool the host does not expose.
