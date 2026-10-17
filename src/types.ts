export type IndexMode = '0' | '1' | 'custom';
export type ViewMode = 'Force' | 'Draw' | 'Edit' | 'Delete' | 'Config';

export interface GraphNode {
  id: string;
  label: string;
  x: number;
  y: number;
  fixed: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface GraphSettings {
  directed: boolean;
  indexMode: IndexMode;
  nodeRadius: number;
  idealEdgeDistance: number;
  repulsionDistance: number;
  nodeFill: string;
  nodeStroke: string;
  edgeColor: string;
  loopRadius: number;
  loopSpacing: number;
  exportScale: number;
}

export interface GraphSnapshot {
  version: 1;
  nodes: GraphNode[];
  edges: GraphEdge[];
  settings: GraphSettings;
}

export interface ParseIssue {
  line: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface ParseResult {
  ok: boolean;
  issues: ParseIssue[];
}

export interface Point {
  x: number;
  y: number;
}

export interface EdgeGeometry {
  path: string;
  labelPoint: Point;
  hitPath: string;
  isLoop: boolean;
  start: Point;
  control1?: Point;
  control2?: Point;
  end: Point;
}

export const VIEW_WIDTH = 760;
export const VIEW_HEIGHT = 560;

export const COLOR_OPTIONS = [
  'white',
  'red',
  'blue',
  'black',
  'purple',
  'orange',
  'green',
  'gray',
  'teal',
  'navy',
] as const;
