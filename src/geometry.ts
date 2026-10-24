import type { GraphModel } from './model.js';
import {
  VIEW_WIDTH,
  VIEW_HEIGHT,
  type EdgeGeometry,
  type GraphEdge,
  type Point,
} from './types.js';

function numberText(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

function normalize(x: number, y: number): Point {
  const length = Math.sqrt(x * x + y * y);
  if (length < 0.0001) {
    return { x: 1, y: 0 };
  }
  return { x: x / length, y: y / length };
}

function quadraticPoint(start: Point, control: Point, end: Point, t: number): Point {
  const oneMinus = 1 - t;
  return {
    x: oneMinus * oneMinus * start.x + 2 * oneMinus * t * control.x + t * t * end.x,
    y: oneMinus * oneMinus * start.y + 2 * oneMinus * t * control.y + t * t * end.y,
  };
}
function cubicPoint(start: Point, control1: Point, control2: Point, end: Point, t: number): Point {
  const oneMinus = 1 - t;
  const a = oneMinus * oneMinus * oneMinus;
  const b = 3 * oneMinus * oneMinus * t;
  const c = 3 * oneMinus * t * t;
  const d = t * t * t;
  return {
    x: a * start.x + b * control1.x + c * control2.x + d * end.x,
    y: a * start.y + b * control1.y + c * control2.y + d * end.y,
  };
}


function pairKey(edge: GraphEdge): string {
  const first = edge.source < edge.target ? edge.source : edge.target;
  const second = edge.source < edge.target ? edge.target : edge.source;
  return first + '|' + second;
}

export function computeEdgeGeometry(model: GraphModel, edge: GraphEdge): EdgeGeometry {
  const source = model.getNode(edge.source);
  const target = model.getNode(edge.target);
  if (!source || !target) {
    return {
      path: '',
      hitPath: '',
      labelPoint: { x: 0, y: 0 },
      isLoop: false,
      start: { x: 0, y: 0 },
      end: { x: 0, y: 0 },
    };
  }

  const nodeRadius = model.settings.nodeRadius;
  if (edge.source === edge.target) {
    const node = source;
    const nodeLoops = model.edges.filter((item) => item.source === item.target && item.source === edge.source);
    const loopIndex = Math.max(0, nodeLoops.findIndex((item) => item.id === edge.id));
    const loopCount = Math.max(1, nodeLoops.length);
    const dx = node.x - VIEW_WIDTH / 2;
    const dy = node.y - VIEW_HEIGHT / 2;
    const outward = Math.sqrt(dx * dx + dy * dy) > 30 ? Math.atan2(dy, dx) : -Math.PI / 4;
    const angle = outward + (loopIndex - (loopCount - 1) / 2) * 0.58;
    const radial = model.settings.loopRadius + loopIndex * model.settings.loopSpacing;
    const anchorDelta = 0.58;
    const controlDelta = 0.92;
    const controlRadius = nodeRadius + radial * 1.52;
    const startAngle = angle - anchorDelta;
    const endAngle = angle + anchorDelta;
    const start: Point = {
      x: node.x + Math.cos(startAngle) * nodeRadius,
      y: node.y + Math.sin(startAngle) * nodeRadius,
    };
    const end: Point = {
      x: node.x + Math.cos(endAngle) * nodeRadius,
      y: node.y + Math.sin(endAngle) * nodeRadius,
    };
    const control1: Point = {
      x: node.x + Math.cos(angle - controlDelta) * controlRadius,
      y: node.y + Math.sin(angle - controlDelta) * controlRadius,
    };
    const control2: Point = {
      x: node.x + Math.cos(angle + controlDelta) * controlRadius,
      y: node.y + Math.sin(angle + controlDelta) * controlRadius,
    };
    const peak = cubicPoint(start, control1, control2, end, 0.5);
    const path = 'M ' + numberText(start.x) + ' ' + numberText(start.y) +
      ' C ' + numberText(control1.x) + ' ' + numberText(control1.y) +
      ' ' + numberText(control2.x) + ' ' + numberText(control2.y) +
      ' ' + numberText(end.x) + ' ' + numberText(end.y);
    const labelPoint = {
      x: peak.x + Math.cos(angle) * 19,
      y: peak.y + Math.sin(angle) * 19,
    };
    return {
      path,
      hitPath: path,
      labelPoint,
      isLoop: true,
      start,
      control1,
      control2,
      end,
    };
  }

  const group = model.edges.filter((item) => item.source !== item.target && pairKey(item) === pairKey(edge));
  const orderedGroup = [...group].sort((a, b) => a.id.localeCompare(b.id));
  const groupIndex = Math.max(0, orderedGroup.findIndex((item) => item.id === edge.id));
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
  const unit = { x: dx / distance, y: dy / distance };
  const canonicalFirstId = edge.source < edge.target ? edge.source : edge.target;
  const canonicalUnit = edge.source === canonicalFirstId ? unit : { x: -unit.x, y: -unit.y };
  const canonicalPerpendicular = { x: -canonicalUnit.y, y: canonicalUnit.x };
  const middle = {
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2,
  };

  let bend = 0;
  if (model.settings.directed) {
    const hasReverse = group.some((item) => item.source === edge.target && item.target === edge.source);
    if (hasReverse) {
      const sameDirection = orderedGroup.filter((item) => item.source === edge.source && item.target === edge.target);
      const directionIndex = Math.max(0, sameDirection.findIndex((item) => item.id === edge.id));
      const side = edge.source === canonicalFirstId ? 1 : -1;
      bend = side * (25 + directionIndex * 24);
    } else if (group.length > 1) {
      bend = (groupIndex - (group.length - 1) / 2) * 26;
    }
  } else if (group.length > 1) {
    bend = (groupIndex - (group.length - 1) / 2) * 26;
  }

  if (Math.abs(bend) < 0.01) {
    const start = {
      x: source.x + unit.x * (nodeRadius + 2),
      y: source.y + unit.y * (nodeRadius + 2),
    };
    const end = {
      x: target.x - unit.x * (nodeRadius + 2),
      y: target.y - unit.y * (nodeRadius + 2),
    };
    const path = 'M ' + numberText(start.x) + ' ' + numberText(start.y) +
      ' L ' + numberText(end.x) + ' ' + numberText(end.y);
    return {
      path,
      hitPath: path,
      labelPoint: {
        x: middle.x + canonicalPerpendicular.x * 19,
        y: middle.y + canonicalPerpendicular.y * 19,
      },
      isLoop: false,
      start,
      end,
    };
  }

  const control = {
    x: middle.x + canonicalPerpendicular.x * bend,
    y: middle.y + canonicalPerpendicular.y * bend,
  };
  const startDirection = normalize(control.x - source.x, control.y - source.y);
  const endDirection = normalize(control.x - target.x, control.y - target.y);
  const start = {
    x: source.x + startDirection.x * (nodeRadius + 2),
    y: source.y + startDirection.y * (nodeRadius + 2),
  };
  const end = {
    x: target.x + endDirection.x * (nodeRadius + 2),
    y: target.y + endDirection.y * (nodeRadius + 2),
  };
  const path = 'M ' + numberText(start.x) + ' ' + numberText(start.y) +
    ' Q ' + numberText(control.x) + ' ' + numberText(control.y) +
    ' ' + numberText(end.x) + ' ' + numberText(end.y);
  const chordMiddle = middle;
  const curveMiddle = quadraticPoint(start, control, end, 0.5);
  const bendVector = normalize(curveMiddle.x - chordMiddle.x, curveMiddle.y - chordMiddle.y);
  const labelPoint = {
    x: curveMiddle.x + bendVector.x * 19,
    y: curveMiddle.y + bendVector.y * 19,
  };
  return {
    path,
    hitPath: path,
    labelPoint,
    isLoop: false,
    start,
    control1: control,
    end,
  };
}
