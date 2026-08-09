import {
  Broom,
  CaretDown,
  CaretUp,
  ChatCircleDots,
  MapPin,
  PaperPlaneTilt,
  Trash,
  X,
} from '@phosphor-icons/react'
import type { RenderSlide } from '@genoffice/pptx-render'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  annotationAnchor,
  hitTestAnnotationTargets,
  hitTestAnnotationTargetsInBounds,
  resolveAnnotationBounds,
  type SlideAiAnnotation,
  type SlideAnnotationBounds,
  type SlideAnnotationPoint,
} from '../ai/annotations'

export interface AiAnnotationLabels {
  title: string
  hint: string
  empty: string
  placeholder: string
  add: string
  targetObjects: (count: number) => string
  targetPoint: string
  send: (count: number) => string
  clear: string
  cancel: string
  delete: string
  close: string
  page: (pageNumber: number) => string
  marker: (number: number) => string
}

export type NewSlideAiAnnotation = Omit<SlideAiAnnotation, 'id'>

interface AiAnnotationLayerProps {
  slide: RenderSlide
  slideIndex: number
  annotations: readonly SlideAiAnnotation[]
  mode: boolean
  zoom: number
  selectedIds: readonly string[]
  labels: AiAnnotationLabels
  onCreate: (annotation: NewSlideAiAnnotation) => void
  onUpdate: (id: string, comment: string) => void
  onDelete: (id: string) => void
}

interface PendingAnnotation {
  slideIndex: number
  point: SlideAnnotationPoint
  bounds?: SlideAnnotationBounds
  objectIds: string[]
}

interface DragSelection {
  pointerId: number
  start: SlideAnnotationPoint
  current: SlideAnnotationPoint
  startClient: SlideAnnotationPoint
}

interface AnnotationRenderItem {
  annotation: SlideAiAnnotation
  number: number
  pending: boolean
}

const DRAFT_ID = '__ai-annotation-draft__'
const DRAG_THRESHOLD_PX = 4

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function boundsBetween(
  start: SlideAnnotationPoint,
  end: SlideAnnotationPoint,
): SlideAnnotationBounds {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    w: Math.abs(end.x - start.x),
    h: Math.abs(end.y - start.y),
  }
}

function targetLabel(annotation: Pick<SlideAiAnnotation, 'objectIds'>, labels: AiAnnotationLabels) {
  return annotation.objectIds.length > 0
    ? labels.targetObjects(annotation.objectIds.length)
    : labels.targetPoint
}

/**
 * Canvas overlay for location-aware AI comments. It intentionally lives in
 * `.stage-rel`, so all anchors use the slide's native coordinate system. UI
 * controls are counter-scaled to remain the same physical size at every zoom.
 */
export function AiAnnotationLayer({
  slide,
  slideIndex,
  annotations,
  mode,
  zoom,
  selectedIds,
  labels,
  onCreate,
  onUpdate,
  onDelete,
}: AiAnnotationLayerProps) {
  const [pending, setPending] = useState<PendingAnnotation | null>(null)
  const [dragSelection, setDragSelection] = useState<DragSelection | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1
  const inverseZoom = 1 / safeZoom

  const visibleAnnotations = useMemo(
    () =>
      annotations
        .map((annotation, index) => ({ annotation, number: index + 1, pending: false }))
        .filter(({ annotation }) => annotation.slideIndex === slideIndex),
    [annotations, slideIndex],
  )

  const editingAnnotation = useMemo(
    () =>
      editingId ? (annotations.find((annotation) => annotation.id === editingId) ?? null) : null,
    [annotations, editingId],
  )

  const pendingAnnotation: SlideAiAnnotation | null = pending
    ? { id: DRAFT_ID, ...pending, comment }
    : null

  const activeAnnotation = editingAnnotation ?? pendingAnnotation
  const activeAnnotationId = activeAnnotation?.id

  const renderItems: AnnotationRenderItem[] = pendingAnnotation
    ? [
        ...visibleAnnotations,
        { annotation: pendingAnnotation, number: annotations.length + 1, pending: true },
      ]
    : visibleAnnotations

  useEffect(() => {
    if (editingId && !editingAnnotation) {
      setEditingId(null)
      setComment('')
    }
  }, [editingAnnotation, editingId])

  useEffect(() => {
    if (!activeAnnotationId) return
    textareaRef.current?.focus()
    textareaRef.current?.select()
  }, [activeAnnotationId])

  const closeEditor = () => {
    setPending(null)
    setEditingId(null)
    setComment('')
  }

  const saveEditor = () => {
    const text = comment.trim()
    if (!text) return
    if (editingAnnotation) {
      onUpdate(editingAnnotation.id, text)
    } else if (pending) {
      onCreate({ ...pending, comment: text })
    }
    closeEditor()
  }

  const deleteEditing = () => {
    if (!editingAnnotation) return
    onDelete(editingAnnotation.id)
    closeEditor()
  }

  const openEditor = (annotation: SlideAiAnnotation) => {
    setPending(null)
    setEditingId(annotation.id)
    setComment(annotation.comment)
  }

  const pointFromPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
  ): SlideAnnotationPoint | null => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * slide.widthPx, 0, slide.widthPx),
      y: clamp(((event.clientY - rect.top) / rect.height) * slide.heightPx, 0, slide.heightPx),
    }
  }

  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!mode || event.button !== 0 || event.target !== event.currentTarget) return
    const point = pointFromPointer(event)
    if (!point) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setPending(null)
    setEditingId(null)
    setComment('')
    setDragSelection({
      pointerId: event.pointerId,
      start: point,
      current: point,
      startClient: { x: event.clientX, y: event.clientY },
    })
  }

  const onCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragSelection || event.pointerId !== dragSelection.pointerId) return
    const point = pointFromPointer(event)
    if (!point) return
    event.preventDefault()
    setDragSelection((current) => (current ? { ...current, current: point } : current))
  }

  const onCanvasPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragSelection || event.pointerId !== dragSelection.pointerId) return
    const point = pointFromPointer(event) ?? dragSelection.current
    const dragged =
      Math.hypot(
        event.clientX - dragSelection.startClient.x,
        event.clientY - dragSelection.startClient.y,
      ) >= DRAG_THRESHOLD_PX
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setDragSelection(null)
    setPending(
      dragged
        ? {
            slideIndex,
            point: {
              x: (dragSelection.start.x + point.x) / 2,
              y: (dragSelection.start.y + point.y) / 2,
            },
            bounds: boundsBetween(dragSelection.start, point),
            objectIds: hitTestAnnotationTargetsInBounds(
              slide,
              boundsBetween(dragSelection.start, point),
            ),
          }
        : {
            slideIndex,
            point,
            objectIds: hitTestAnnotationTargets(slide, point, selectedIds),
          },
    )
  }

  const onCanvasPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragSelection || event.pointerId !== dragSelection.pointerId) return
    setDragSelection(null)
  }

  const onEditorKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeEditor()
      return
    }
    if (
      (event.key === 'Enter' || event.key === 'Return') &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing &&
      event.keyCode !== 229
    ) {
      event.preventDefault()
      saveEditor()
    }
  }

  const collisionSlots = new Map<string, number>()
  const markerPosition = (annotation: SlideAiAnnotation) => {
    const anchor = annotationAnchor(slide, annotation)
    const key = `${Math.round(anchor.x / 8)}:${Math.round(anchor.y / 8)}`
    const slot = collisionSlots.get(key) ?? 0
    collisionSlots.set(key, slot + 1)
    return { anchor, slot }
  }

  const editorAnchor = activeAnnotation ? annotationAnchor(slide, activeAnnotation) : null
  const opensLeft = !!editorAnchor && editorAnchor.x > slide.widthPx * 0.62
  const opensUp = !!editorAnchor && editorAnchor.y > slide.heightPx * 0.6
  const editorStyle = editorAnchor
    ? ({
        left: editorAnchor.x + (opensLeft ? -12 : 12) * inverseZoom,
        top: editorAnchor.y + (opensUp ? -12 : 12) * inverseZoom,
        '--ai-annotation-scale': inverseZoom,
      } as CSSProperties)
    : undefined
  const dragBounds = dragSelection
    ? boundsBetween(dragSelection.start, dragSelection.current)
    : null

  return (
    <div
      className={`ai-annotation-layer${mode ? ' is-active' : ''}`}
      aria-label={labels.title}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={onCanvasPointerUp}
      onPointerCancel={onCanvasPointerCancel}
    >
      {dragBounds && (dragBounds.w > 0 || dragBounds.h > 0) && (
        <div
          className="ai-annotation-marquee"
          aria-hidden="true"
          style={{
            left: dragBounds.x,
            top: dragBounds.y,
            width: dragBounds.w,
            height: dragBounds.h,
            borderWidth: 2 * inverseZoom,
            borderRadius: 6 * inverseZoom,
          }}
        />
      )}
      {renderItems.map(({ annotation, number, pending: isPending }) => {
        const bounds = resolveAnnotationBounds(slide, annotation)
        const pointOnly = bounds.w === 0 && bounds.h === 0
        const { anchor, slot } = markerPosition(annotation)
        const active = activeAnnotation?.id === annotation.id
        const borderWidth = 2 * inverseZoom
        const radius = 7 * inverseZoom
        const pointSize = 12 * inverseZoom
        return (
          <div key={annotation.id} className="ai-annotation-item">
            <div
              className={`ai-annotation-target${pointOnly ? ' is-point' : ''}${active ? ' is-selected' : ''}${isPending ? ' is-pending' : ''}`}
              style={
                pointOnly
                  ? {
                      left: bounds.x - pointSize / 2,
                      top: bounds.y - pointSize / 2,
                      width: pointSize,
                      height: pointSize,
                      borderWidth,
                      borderRadius: pointSize,
                    }
                  : {
                      left: bounds.x,
                      top: bounds.y,
                      width: bounds.w,
                      height: bounds.h,
                      borderWidth,
                      borderRadius: radius,
                    }
              }
            />
            <div
              className="ai-annotation-marker-anchor"
              style={
                {
                  left: anchor.x,
                  top: anchor.y + slot * 18 * inverseZoom,
                  '--ai-annotation-scale': inverseZoom,
                } as CSSProperties
              }
            >
              <button
                type="button"
                className={`ai-annotation-marker${active ? ' is-selected' : ''}${isPending ? ' is-pending' : ''}`}
                aria-label={labels.marker(number)}
                title={annotation.comment || labels.placeholder}
                onClick={(event) => {
                  event.stopPropagation()
                  if (!isPending) openEditor(annotation)
                }}
              >
                {number}
              </button>
            </div>
          </div>
        )
      })}

      {activeAnnotation && editorAnchor && (
        <div
          className={`ai-annotation-editor-anchor${opensLeft ? ' opens-left' : ''}${opensUp ? ' opens-up' : ''}`}
          style={editorStyle}
          onClick={(event) => event.stopPropagation()}
        >
          <section className="ai-annotation-editor" aria-label={labels.title}>
            <header className="ai-annotation-editor-head">
              <span className="ai-annotation-editor-icon" aria-hidden="true">
                <MapPin size={15} weight="fill" />
              </span>
              <div>
                <strong>{labels.title}</strong>
                <span>{targetLabel(activeAnnotation, labels)}</span>
              </div>
            </header>
            <textarea
              ref={textareaRef}
              value={comment}
              rows={4}
              placeholder={labels.placeholder}
              aria-label={labels.placeholder}
              aria-keyshortcuts="Enter"
              onChange={(event) => setComment(event.target.value)}
              onKeyDown={onEditorKeyDown}
            />
            <footer className="ai-annotation-editor-actions">
              {editingAnnotation ? (
                <button type="button" className="ai-annotation-danger-btn" onClick={deleteEditing}>
                  <Trash size={14} />
                  {labels.delete}
                </button>
              ) : (
                <span />
              )}
              <div>
                <button type="button" className="ai-annotation-plain-btn" onClick={closeEditor}>
                  {labels.cancel}
                </button>
                <button
                  type="button"
                  className="ai-annotation-primary-btn"
                  disabled={!comment.trim()}
                  onClick={saveEditor}
                >
                  {labels.add}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </div>
  )
}

interface AiAnnotationTrayProps {
  annotations: readonly SlideAiAnnotation[]
  mode: boolean
  labels: AiAnnotationLabels
  onCloseMode: () => void
  onClear: () => void
  onDelete: (id: string) => void
  onNavigate: (annotation: SlideAiAnnotation) => void
  onSend: () => void
}

/** Compact review tray for collecting annotations across multiple slides. */
export function AiAnnotationTray({
  annotations,
  mode,
  labels,
  onCloseMode,
  onClear,
  onDelete,
  onNavigate,
  onSend,
}: AiAnnotationTrayProps) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (mode) setExpanded(false)
  }, [mode])

  if (!mode) return null

  return (
    <aside
      className={`ai-annotation-tray ${expanded ? 'is-expanded' : 'is-collapsed'}`}
      aria-label={labels.title}
    >
      <header className="ai-annotation-tray-head">
        <button
          type="button"
          className="ai-annotation-tray-toggle"
          aria-expanded={expanded}
          aria-controls="ai-annotation-tray-content"
          onClick={() => setExpanded((value) => !value)}
        >
          <span className="ai-annotation-tray-icon" aria-hidden="true">
            <ChatCircleDots size={17} weight="fill" />
          </span>
          <span className="ai-annotation-tray-title">
            <strong>{labels.title}</strong>
            {expanded && <span>{labels.hint}</span>}
          </span>
          <span className="ai-annotation-tray-count" aria-hidden="true">
            {annotations.length}
          </span>
          {expanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
        </button>
        <button
          type="button"
          className="ai-annotation-icon-btn"
          aria-label={labels.close}
          title={labels.close}
          onClick={onCloseMode}
        >
          <X size={16} />
        </button>
      </header>

      {expanded && (
        <div className="ai-annotation-tray-content" id="ai-annotation-tray-content">
          <div className="ai-annotation-tray-list">
            {annotations.length === 0 ? (
              <div className="ai-annotation-empty">
                <MapPin size={20} />
                <span>{labels.empty}</span>
              </div>
            ) : (
              annotations.map((annotation, index) => (
                <article className="ai-annotation-row" key={annotation.id}>
                  <button
                    type="button"
                    className="ai-annotation-row-main"
                    onClick={() => onNavigate(annotation)}
                  >
                    <span className="ai-annotation-row-number">{index + 1}</span>
                    <span className="ai-annotation-row-copy">
                      <span className="ai-annotation-row-meta">
                        <strong>{labels.page(annotation.slideIndex + 1)}</strong>
                        <span>{targetLabel(annotation, labels)}</span>
                      </span>
                      <span className="ai-annotation-row-comment">{annotation.comment}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="ai-annotation-row-delete"
                    aria-label={labels.delete}
                    title={labels.delete}
                    onClick={() => onDelete(annotation.id)}
                  >
                    <Trash size={14} />
                  </button>
                </article>
              ))
            )}
          </div>

          <footer className="ai-annotation-tray-actions">
            <button
              type="button"
              className="ai-annotation-clear-btn"
              disabled={annotations.length === 0}
              onClick={onClear}
            >
              <Broom size={14} />
              {labels.clear}
            </button>
            <button
              type="button"
              className="ai-annotation-send-btn"
              disabled={annotations.length === 0}
              onClick={onSend}
            >
              <PaperPlaneTilt size={15} weight="fill" />
              {labels.send(annotations.length)}
            </button>
          </footer>
        </div>
      )}
    </aside>
  )
}
