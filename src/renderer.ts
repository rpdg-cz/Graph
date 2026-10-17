import type { GraphModel } from './model.js';
import { computeEdgeGeometry } from './geometry.js';
import {
  VIEW_WIDTH,
  VIEW_HEIGHT,
  type EdgeGeometry,
  type GraphEdge,
  type GraphNode,
  type Point,
  type ViewMode,
} from './types.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FONT_FAMILY = 'Lato, Segoe UI, Arial, sans-serif';

export interface RendererCallbacks {
  onNodeDragStart: (nodeId: string) => void;
  onNodeDrag: (nodeId: string, x: number, y: number) => void;
  onNodeDragEnd: (nodeId: string, moved: boolean) => void;
  onNodeToggleFixed: (nodeId: string) => void;
  onNodeAddAt: (x: number, y: number) => void;
  onEdgeAdd: (sourceId: string, targetId: string) => void;
  onNodeDelete: (nodeId: string) => void;
  onEdgeDelete: (edgeId: string) => void;
  onNodeLabelChange: (nodeId: string, label: string) => void;
  onEdgeLabelChange: (edgeId: string, label: string) => void;
}

interface DragState {
  nodeId: string;
  startX: number;
  startY: number;
  pointerId: number;
  moved: boolean;
}

function svgElement(tag: string, attributes?: Record<string, string>): SVGElement {
  const element = document.createElementNS(SVG_NS, tag);
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, value);
    }
  }
  return element;
}

export class GraphRenderer {
  private svg: SVGSVGElement;
  private overlay: HTMLDivElement;
  private model: GraphModel;
  private callbacks: RendererCallbacks;
  private mode: ViewMode = 'Force';
  private pendingSource: string | null = null;
  private pointer: Point | null = null;
  private hoverNodeId: string | null = null;
  private hoverLoop = false;
  private dragState: DragState | null = null;
  private suppressClick = false;
  private measureContext: CanvasRenderingContext2D | null;
  private editorInput: HTMLInputElement | null = null;

  constructor(svg: SVGSVGElement, overlay: HTMLDivElement, model: GraphModel, callbacks: RendererCallbacks) {
    this.svg = svg;
    this.overlay = overlay;
    this.model = model;
    this.callbacks = callbacks;
    this.measureContext = document.createElement('canvas').getContext('2d');
    this.svg.setAttribute('viewBox', '0 0 ' + VIEW_WIDTH + ' ' + VIEW_HEIGHT);
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.attachEvents();
    this.render();
  }

  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.pendingSource = null;
    this.pointer = null;
    this.hoverNodeId = null;
    this.hoverLoop = false;
    this.closeEditor();
    this.render();
  }

  getMode(): ViewMode {
    return this.mode;
  }

  cancelPending(): void {
    if (this.pendingSource !== null) {
      this.pendingSource = null;
      this.pointer = null;
      this.hoverNodeId = null;
      this.hoverLoop = false;
      this.render();
    }
  }

  hidePreview(): void {
    this.pendingSource = null;
    this.pointer = null;
    this.hoverNodeId = null;
    this.hoverLoop = false;
  }

  render(): void {
    this.svg.replaceChildren();
    this.svg.setAttribute('data-mode', this.mode.toLowerCase());
    const defs = svgElement('defs');
    const marker = svgElement('marker', {
      id: 'arrowhead',
      markerWidth: '12',
      markerHeight: '12',
      refX: '12',
      refY: '6',
      orient: 'auto',
      markerUnits: 'userSpaceOnUse',
    });
    const arrow = svgElement('path', {
      d: 'M 0 0 L 12 6 L 0 12 Z',
      fill: this.model.settings.edgeColor,
    });
    marker.appendChild(arrow);
    defs.appendChild(marker);
    this.svg.appendChild(defs);

    const background = svgElement('rect', {
      id: 'canvas-background',
      x: '0',
      y: '0',
      width: VIEW_WIDTH.toString(),
      height: VIEW_HEIGHT.toString(),
      fill: '#ffffff',
    });
    this.svg.appendChild(background);

    const edgeLayer = svgElement('g', { class: 'edge-layer' });
    const previewLayer = svgElement('g', { class: 'preview-layer' });
    const nodeLayer = svgElement('g', { class: 'node-layer' });

    const loops = this.model.edges.filter((edge) => edge.source === edge.target);
    const regular = this.model.edges.filter((edge) => edge.source !== edge.target);
    for (const edge of regular) {
      edgeLayer.appendChild(this.renderEdge(edge));
    }
    for (const edge of loops) {
      edgeLayer.appendChild(this.renderEdge(edge));
    }

    if (this.pendingSource) {
      const preview = this.renderPreview(this.pendingSource);
      if (preview) {
        previewLayer.appendChild(preview);
      }
    }

    for (const node of this.model.nodes) {
      nodeLayer.appendChild(this.renderNode(node));
    }

    this.svg.appendChild(edgeLayer);
    this.svg.appendChild(previewLayer);
    this.svg.appendChild(nodeLayer);
  }

  private renderEdge(edge: GraphEdge): SVGGElement {
    const geometry = computeEdgeGeometry(this.model, edge);
    const group = svgElement('g', {
      class: 'edge' + (geometry.isLoop ? ' edge-loop' : ''),
      'data-edge-id': edge.id,
    }) as SVGGElement;
    const visible = svgElement('path', {
      d: geometry.path,
      fill: 'none',
      stroke: this.model.settings.edgeColor,
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    if (this.model.settings.directed) {
      visible.setAttribute('marker-end', 'url(#arrowhead)');
    }
    const hit = svgElement('path', {
      d: geometry.hitPath,
      fill: 'none',
      stroke: '#ffffff',
      'stroke-opacity': '0',
      'stroke-width': '24',
      'stroke-linecap': 'round',
      'pointer-events': 'stroke',
    });
    group.appendChild(visible);
    group.appendChild(hit);
    if (edge.label.length > 0) {
      group.appendChild(this.renderEdgeLabel(edge.label, geometry));
    }
    return group;
  }

  private renderEdgeLabel(label: string, geometry: EdgeGeometry): SVGGElement {
    const badge = svgElement('g', { class: 'edge-label-badge', 'pointer-events': 'all' }) as SVGGElement;
    const fontSize = 14;
    const textWidth = this.measureText(label, fontSize);
    const width = textWidth + 12;
    const height = 20;
    const rect = svgElement('rect', {
      x: (geometry.labelPoint.x - width / 2).toString(),
      y: (geometry.labelPoint.y - height / 2).toString(),
      width: width.toString(),
      height: height.toString(),
      rx: '4',
      fill: '#ffffff',
      'fill-opacity': '0.94',
    });
    const text = svgElement('text', {
      x: geometry.labelPoint.x.toString(),
      y: geometry.labelPoint.y.toString(),
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': FONT_FAMILY,
      'font-size': fontSize.toString(),
      fill: '#202e3e',
    });
    text.textContent = label;
    badge.appendChild(rect);
    badge.appendChild(text);
    return badge;
  }

  private renderNode(node: GraphNode): SVGGElement {
    const group = svgElement('g', {
      class: 'node' +
        (node.fixed ? ' is-fixed' : '') +
        (this.pendingSource === node.id ? ' is-source' : '') +
        (this.hoverNodeId === node.id && this.pendingSource !== null ? ' is-target' : ''),
      'data-node-id': node.id,
    }) as SVGGElement;
    const circle = svgElement('circle', {
      cx: node.x.toString(),
      cy: node.y.toString(),
      r: this.model.settings.nodeRadius.toString(),
      fill: this.model.settings.nodeFill,
      stroke: this.model.settings.nodeStroke,
      'stroke-width': node.fixed ? '5' : '2',
    });
    const text = svgElement('text', {
      x: node.x.toString(),
      y: node.y.toString(),
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      'font-family': FONT_FAMILY,
      'font-size': '14',
      'font-weight': '400',
      fill: this.model.settings.nodeStroke,
      'pointer-events': 'none',
      opacity: this.model.settings.nodeRadius < 8 ? '0' : '1',
    });
    text.textContent = node.label;
    group.appendChild(circle);
    group.appendChild(text);
    return group;
  }

  private renderPreview(sourceId: string): SVGElement | null {
    if (!this.pointer) {
      return null;
    }
    const source = this.model.getNode(sourceId);
    if (!source) {
      return null;
    }
    if (this.hoverLoop) {
      const radius = this.model.settings.loopRadius;
      const nodeRadius = this.model.settings.nodeRadius;
      const dx = source.x - VIEW_WIDTH / 2;
      const dy = source.y - VIEW_HEIGHT / 2;
      const angle = Math.sqrt(dx * dx + dy * dy) > 30 ? Math.atan2(dy, dx) : -Math.PI / 4;
      const controlRadius = nodeRadius + radius * 1.52;
      const startAngle = angle - 0.58;
      const endAngle = angle + 0.58;
      const start = {
        x: source.x + Math.cos(startAngle) * nodeRadius,
        y: source.y + Math.sin(startAngle) * nodeRadius,
      };
      const end = {
        x: source.x + Math.cos(endAngle) * nodeRadius,
        y: source.y + Math.sin(endAngle) * nodeRadius,
      };
      const control1 = {
        x: source.x + Math.cos(angle - 0.92) * controlRadius,
        y: source.y + Math.sin(angle - 0.92) * controlRadius,
      };
      const control2 = {
        x: source.x + Math.cos(angle + 0.92) * controlRadius,
        y: source.y + Math.sin(angle + 0.92) * controlRadius,
      };
      const path = svgElement('path', {
        d: 'M ' + start.x + ' ' + start.y +
          ' C ' + control1.x + ' ' + control1.y +
          ' ' + control2.x + ' ' + control2.y +
          ' ' + end.x + ' ' + end.y,
        fill: 'none',
        stroke: '#337ab7',
        'stroke-width': '2.5',
        'stroke-dasharray': '7 5',
        'pointer-events': 'none',
      });
      return path;
    }
    const dx = this.pointer.x - source.x;
    const dy = this.pointer.y - source.y;
    const length = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
    const start = {
      x: source.x + (dx / length) * (this.model.settings.nodeRadius + 3),
      y: source.y + (dy / length) * (this.model.settings.nodeRadius + 3),
    };
    const path = svgElement('path', {
      d: 'M ' + start.x + ' ' + start.y + ' L ' + this.pointer.x + ' ' + this.pointer.y,
      fill: 'none',
      stroke: '#337ab7',
      'stroke-width': '2',
      'stroke-dasharray': '6 5',
      'pointer-events': 'none',
    });
    if (this.model.settings.directed) {
      path.setAttribute('marker-end', 'url(#arrowhead)');
    }
    return path;
  }

  private measureText(text: string, fontSize: number): number {
    if (this.measureContext) {
      this.measureContext.font = fontSize.toString() + 'px ' + FONT_FAMILY;
      return this.measureContext.measureText(text).width;
    }
    return Math.max(10, text.length * fontSize * 0.58);
  }

  private attachEvents(): void {
    this.svg.addEventListener('pointerdown', (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      const nodeElement = this.findNodeElement(event.target);
      if (this.mode === 'Force' && nodeElement) {
        const nodeId = nodeElement.getAttribute('data-node-id');
        const node = nodeId ? this.model.getNode(nodeId) : undefined;
        if (nodeId && node) {
          const point = this.canvasPoint(event);
          this.dragState = {
            nodeId,
            startX: point.x,
            startY: point.y,
            pointerId: event.pointerId,
            moved: false,
          };
          this.svg.setPointerCapture(event.pointerId);
          this.callbacks.onNodeDragStart(nodeId);
          event.preventDefault();
        }
      }
    });

    this.svg.addEventListener('pointermove', (event: PointerEvent) => {
      const point = this.canvasPoint(event);
      this.pointer = point;
      const nodeElement = this.findNodeElement(event.target);
      this.hoverNodeId = nodeElement ? nodeElement.getAttribute('data-node-id') : null;

      if (this.dragState) {
        const deltaX = point.x - this.dragState.startX;
        const deltaY = point.y - this.dragState.startY;
        if (Math.sqrt(deltaX * deltaX + deltaY * deltaY) > 3) {
          this.dragState.moved = true;
        }
        this.callbacks.onNodeDrag(this.dragState.nodeId, point.x, point.y);
        event.preventDefault();
        return;
      }

      if (this.pendingSource) {
        const source = this.model.getNode(this.pendingSource);
        if (source) {
          const dx = point.x - source.x;
          const dy = point.y - source.y;
          this.hoverLoop = Math.sqrt(dx * dx + dy * dy) <= this.model.settings.nodeRadius + 10;
        }
        this.render();
      }
    });

    this.svg.addEventListener('pointerup', (event: PointerEvent) => {
      if (!this.dragState) {
        return;
      }
      const state = this.dragState;
      this.dragState = null;
      if (this.svg.hasPointerCapture(state.pointerId)) {
        this.svg.releasePointerCapture(state.pointerId);
      }
      this.callbacks.onNodeDragEnd(state.nodeId, state.moved);
      this.suppressClick = state.moved;
      window.setTimeout(() => {
        this.suppressClick = false;
      }, 0);
    });

    this.svg.addEventListener('pointercancel', () => {
      if (this.dragState) {
        const state = this.dragState;
        this.dragState = null;
        this.callbacks.onNodeDragEnd(state.nodeId, state.moved);
      }
    });

    this.svg.addEventListener('click', (event: MouseEvent) => {
      if (this.suppressClick) {
        return;
      }
      const point = this.canvasPoint(event);
      const nodeElement = this.findNodeElement(event.target);
      const edgeElement = this.findEdgeElement(event.target);
      const nodeId = nodeElement ? nodeElement.getAttribute('data-node-id') : null;
      const edgeId = edgeElement ? edgeElement.getAttribute('data-edge-id') : null;

      if (this.mode === 'Force') {
        if (nodeId) {
          this.callbacks.onNodeToggleFixed(nodeId);
        }
        return;
      }

      if (this.mode === 'Draw') {
        if (nodeId) {
          if (!this.pendingSource) {
            this.pendingSource = nodeId;
            this.hoverLoop = false;
            this.pointer = null;
            this.render();
          } else {
            const sourceId = this.pendingSource;
            this.pendingSource = null;
            this.pointer = null;
            this.hoverLoop = false;
            this.callbacks.onEdgeAdd(sourceId, nodeId);
            this.render();
          }
          return;
        }
        if (this.pendingSource) {
          this.pendingSource = null;
          this.pointer = null;
          this.hoverLoop = false;
          this.render();
          return;
        }
        this.callbacks.onNodeAddAt(point.x, point.y);
        return;
      }

      if (this.mode === 'Edit') {
        if (nodeId) {
          this.openNodeEditor(nodeId);
          return;
        }
        if (edgeId) {
          this.openEdgeEditor(edgeId);
        }
        return;
      }

      if (this.mode === 'Delete') {
        if (nodeId) {
          this.callbacks.onNodeDelete(nodeId);
          return;
        }
        if (edgeId) {
          this.callbacks.onEdgeDelete(edgeId);
        }
      }
    });

    window.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.cancelPending();
        this.closeEditor();
      }
    });
  }

  private canvasPoint(event: MouseEvent | PointerEvent): Point {
    const rect = this.svg.getBoundingClientRect();
    const scaleX = rect.width === 0 ? 1 : VIEW_WIDTH / rect.width;
    const scaleY = rect.height === 0 ? 1 : VIEW_HEIGHT / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  private findNodeElement(target: EventTarget | null): Element | null {
    if (!(target instanceof Element)) {
      return null;
    }
    return target.closest('[data-node-id]');
  }

  private findEdgeElement(target: EventTarget | null): Element | null {
    if (!(target instanceof Element)) {
      return null;
    }
    return target.closest('[data-edge-id]');
  }

  private openNodeEditor(nodeId: string): void {
    const node = this.model.getNode(nodeId);
    if (!node) {
      return;
    }
    this.openEditor('node', nodeId, node.label, { x: node.x, y: node.y });
  }

  private openEdgeEditor(edgeId: string): void {
    const edge = this.model.getEdge(edgeId);
    if (!edge) {
      return;
    }
    const geometry = computeEdgeGeometry(this.model, edge);
    this.openEditor('edge', edgeId, edge.label, geometry.labelPoint);
  }

  private openEditor(kind: 'node' | 'edge', id: string, value: string, point: Point): void {
    this.closeEditor();
    const rect = this.svg.getBoundingClientRect();
    const left = (point.x / VIEW_WIDTH) * rect.width;
    const top = (point.y / VIEW_HEIGHT) * rect.height;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.className = 'inline-label-input';
    input.style.left = (left - 48).toString() + 'px';
    input.style.top = (top - 14).toString() + 'px';
    input.style.width = '96px';
    input.setAttribute('aria-label', kind === 'node' ? 'Node label' : 'Edge label');
    this.overlay.appendChild(input);
    this.editorInput = input;

    let finished = false;
    const finish = (commit: boolean): void => {
      if (finished) {
        return;
      }
      finished = true;
      const nextValue = input.value;
      this.closeEditor();
      if (commit) {
        if (kind === 'node') {
          this.callbacks.onNodeLabelChange(id, nextValue);
        } else {
          this.callbacks.onEdgeLabelChange(id, nextValue);
        }
      }
    };

    input.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        finish(true);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
      event.stopPropagation();
    });
    input.addEventListener('blur', () => {
      finish(true);
    });
    input.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  private closeEditor(): void {
    if (this.editorInput) {
      const input = this.editorInput;
      this.editorInput = null;
      input.remove();
    }
  }
}
