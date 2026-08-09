import type { GroupRenderNode, RenderNode, RenderSlide } from '@genoffice/pptx-render'

export interface SlideAnnotationPoint {
  x: number
  y: number
}

export interface SlideAnnotationBounds {
  x: number
  y: number
  w: number
  h: number
}

export interface SlideAiAnnotation {
  id: string
  slideIndex: number
  point: SlideAnnotationPoint
  bounds?: SlideAnnotationBounds
  objectIds: string[]
  comment: string
}

type PointTransform = (point: SlideAnnotationPoint) => SlideAnnotationPoint

const identity: PointTransform = (point) => point

function nodeLocalPoint(point: SlideAnnotationPoint, node: RenderNode): SlideAnnotationPoint {
  const { box } = node
  const radians = (-box.rotationDeg * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const centerX = box.x + box.w / 2
  const centerY = box.y + box.h / 2
  const dx = point.x - centerX
  const dy = point.y - centerY
  let x = cos * dx - sin * dy + box.w / 2
  let y = sin * dx + cos * dy + box.h / 2
  if (box.flipH) x = box.w - x
  if (box.flipV) y = box.h - y
  return { x, y }
}

function nodeParentPoint(point: SlideAnnotationPoint, node: RenderNode): SlideAnnotationPoint {
  const { box } = node
  const x = box.flipH ? box.w - point.x : point.x
  const y = box.flipV ? box.h - point.y : point.y
  const dx = x - box.w / 2
  const dy = y - box.h / 2
  const radians = (box.rotationDeg * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return {
    x: box.x + box.w / 2 + cos * dx - sin * dy,
    y: box.y + box.h / 2 + sin * dx + cos * dy,
  }
}

function containsLocalPoint(node: RenderNode, point: SlideAnnotationPoint): boolean {
  return point.x >= 0 && point.x <= node.box.w && point.y >= 0 && point.y <= node.box.h
}

function selectedTargetHit(
  nodes: readonly RenderNode[],
  point: SlideAnnotationPoint,
  selected: ReadonlySet<string>,
): boolean {
  for (const node of nodes) {
    const local = nodeLocalPoint(point, node)
    if (selected.has(node.sourceId) && containsLocalPoint(node, local)) return true
    if (
      node.type === 'group' &&
      selectedTargetHit((node as GroupRenderNode).children, local, selected)
    ) {
      return true
    }
  }
  return false
}

function topmostEditableTarget(
  nodes: readonly RenderNode[],
  point: SlideAnnotationPoint,
  depth: number,
  ancestorLocked: boolean,
): string | undefined {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]!
    const locked = ancestorLocked || !!node.decoration
    if (locked) continue
    const local = nodeLocalPoint(point, node)
    if (node.type === 'group') {
      const child = topmostEditableTarget(
        (node as GroupRenderNode).children,
        local,
        depth + 1,
        locked,
      )
      if (child) return child
    }
    const editable = depth <= 1 && node.type !== 'placeholder-chip'
    if (editable && containsLocalPoint(node, local)) return node.sourceId
  }
  return undefined
}

/** Resolve a click to the annotation targets, preserving an existing multi-selection as one target. */
export function hitTestAnnotationTargets(
  slide: RenderSlide,
  point: SlideAnnotationPoint,
  selectedIds: readonly string[],
): string[] {
  if (selectedIds.length > 0 && selectedTargetHit(slide.nodes, point, new Set(selectedIds))) {
    return [...selectedIds]
  }
  const hit = topmostEditableTarget(slide.nodes, point, 0, false)
  return hit ? [hit] : []
}

function nodeSlideBounds(node: RenderNode, parentToSlide: PointTransform): SlideAnnotationBounds {
  const nodeToSlide: PointTransform = (point) => parentToSlide(nodeParentPoint(point, node))
  const corners = [
    nodeToSlide({ x: 0, y: 0 }),
    nodeToSlide({ x: node.box.w, y: 0 }),
    nodeToSlide({ x: node.box.w, y: node.box.h }),
    nodeToSlide({ x: 0, y: node.box.h }),
  ]
  const minX = Math.min(...corners.map((point) => point.x))
  const minY = Math.min(...corners.map((point) => point.y))
  const maxX = Math.max(...corners.map((point) => point.x))
  const maxY = Math.max(...corners.map((point) => point.y))
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

function intersectsBounds(left: SlideAnnotationBounds, right: SlideAnnotationBounds): boolean {
  return (
    left.x < right.x + right.w &&
    left.x + left.w > right.x &&
    left.y < right.y + right.h &&
    left.y + left.h > right.y
  )
}

function targetsInBounds(
  nodes: readonly RenderNode[],
  bounds: SlideAnnotationBounds,
  parentToSlide: PointTransform,
  depth: number,
  ancestorLocked: boolean,
  result: string[],
): void {
  for (const node of nodes) {
    const locked = ancestorLocked || !!node.decoration
    if (locked) continue
    const nodeToSlide: PointTransform = (point) => parentToSlide(nodeParentPoint(point, node))
    const resultSize = result.length
    if (node.type === 'group') {
      targetsInBounds(
        (node as GroupRenderNode).children,
        bounds,
        nodeToSlide,
        depth + 1,
        locked,
        result,
      )
    }
    const editable = depth <= 1 && node.type !== 'placeholder-chip'
    if (
      editable &&
      result.length === resultSize &&
      intersectsBounds(bounds, nodeSlideBounds(node, parentToSlide))
    ) {
      result.push(node.sourceId)
    }
  }
}

/** Resolve a dragged marquee to every editable object crossing that page region. */
export function hitTestAnnotationTargetsInBounds(
  slide: RenderSlide,
  bounds: SlideAnnotationBounds,
): string[] {
  const result: string[] = []
  targetsInBounds(slide.nodes, bounds, identity, 0, false, result)
  return result
}

function unionBounds(
  nodes: readonly RenderNode[],
  targetIds: ReadonlySet<string>,
  parentToSlide: PointTransform,
  current: SlideAnnotationBounds | undefined,
): SlideAnnotationBounds | undefined {
  let result = current
  for (const node of nodes) {
    const nodeToSlide: PointTransform = (point) => parentToSlide(nodeParentPoint(point, node))
    if (targetIds.has(node.sourceId)) {
      const bounds = nodeSlideBounds(node, parentToSlide)
      result = result
        ? {
            x: Math.min(result.x, bounds.x),
            y: Math.min(result.y, bounds.y),
            w: Math.max(result.x + result.w, bounds.x + bounds.w) - Math.min(result.x, bounds.x),
            h: Math.max(result.y + result.h, bounds.y + bounds.h) - Math.min(result.y, bounds.y),
          }
        : bounds
    }
    if (node.type === 'group') {
      result = unionBounds((node as GroupRenderNode).children, targetIds, nodeToSlide, result)
    }
  }
  return result
}

/** Current axis-aligned page bounds of all referenced objects, including rotations and groups. */
export function resolveAnnotationBounds(
  slide: RenderSlide,
  annotation: SlideAiAnnotation,
): SlideAnnotationBounds {
  if (annotation.bounds) return { ...annotation.bounds }
  return (
    unionBounds(slide.nodes, new Set(annotation.objectIds), identity, undefined) ?? {
      x: annotation.point.x,
      y: annotation.point.y,
      w: 0,
      h: 0,
    }
  )
}

/** Marker position that follows targeted objects; blank-canvas comments stay at the clicked point. */
export function annotationAnchor(
  slide: RenderSlide,
  annotation: SlideAiAnnotation,
): SlideAnnotationPoint {
  const bounds = resolveAnnotationBounds(slide, annotation)
  if (bounds.w === 0 && bounds.h === 0) return { ...annotation.point }
  return { x: bounds.x + bounds.w, y: bounds.y }
}

/** Sorted, unique zero-based indexes of slides that need annotation context. */
export function referencedAnnotationSlides(annotations: readonly SlideAiAnnotation[]): number[] {
  return [
    ...new Set(
      annotations
        .map((annotation) => annotation.slideIndex)
        .filter((slideIndex) => Number.isInteger(slideIndex) && slideIndex >= 0),
    ),
  ].sort((left, right) => left - right)
}

/** Concise, transparent chat copy; the full location-aware prompt is sent separately. */
export function buildSlideAnnotationsDisplayText(
  annotations: readonly SlideAiAnnotation[],
  pageLabel: (pageNumber: number) => string,
): string {
  const multiple = annotations.length > 1
  return annotations
    .map((annotation, index) => {
      const detail = `${pageLabel(annotation.slideIndex + 1)} · ${annotation.comment.trim()}`
      return multiple ? `${index + 1}. ${detail}` : detail
    })
    .join('\n')
}

function rounded(value: number): number {
  const result = Math.round(value * 100) / 100
  return Object.is(result, -0) ? 0 : result
}

function promptPoint(point: SlideAnnotationPoint): SlideAnnotationPoint {
  return { x: rounded(point.x), y: rounded(point.y) }
}

function promptBounds(bounds: SlideAnnotationBounds): SlideAnnotationBounds {
  return {
    x: rounded(bounds.x),
    y: rounded(bounds.y),
    w: rounded(bounds.w),
    h: rounded(bounds.h),
  }
}

/** Build one deterministic, location-aware request for all pending slide annotations. */
export function buildSlideAnnotationsPrompt(
  annotations: readonly SlideAiAnnotation[],
  slides: readonly RenderSlide[],
): string {
  const lines = [
    'Apply all slide annotations below as one scoped edit request.',
    'Rules:',
    '- Modify only the annotated targets. Do not redesign or alter unrelated objects or slides.',
    '- When objectIds is empty, treat bounds (or point for a click) as a page-region anchor and only modify or add elements relevant to that local area.',
    '- Before editing each referenced slide, call read_slide for that slideIndex.',
    '- Locate targets against the current presentation revision and the fresh read_slide inventory; never rely on stale ids or geometry.',
    '- After editing, verify the affected slides for overlap, clipping, alignment, and overall layout integrity.',
    'Annotations:',
  ]
  annotations.forEach((annotation, index) => {
    const slide = slides[annotation.slideIndex]
    const bounds = slide
      ? resolveAnnotationBounds(slide, annotation)
      : { x: annotation.point.x, y: annotation.point.y, w: 0, h: 0 }
    lines.push(
      `${index + 1}. slideIndex=${annotation.slideIndex}; page=${annotation.slideIndex + 1}; objectIds=${JSON.stringify(annotation.objectIds)}; point=${JSON.stringify(promptPoint(annotation.point))}; bounds=${JSON.stringify(promptBounds(bounds))}; comment=${JSON.stringify(annotation.comment)}`,
    )
  })
  return lines.join('\n')
}
