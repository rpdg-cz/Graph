import {
  VIEW_WIDTH,
  VIEW_HEIGHT,
  type GraphEdge,
  type GraphNode,
  type GraphSettings,
  type GraphSnapshot,
  type IndexMode,
  type ParseIssue,
  type ParseResult,
} from './types.js';

const DEFAULT_SETTINGS: GraphSettings = {
  directed: false,
  indexMode: '0',
  nodeRadius: 19,
  idealEdgeDistance: 140,
  repulsionDistance: 140,
  nodeFill: 'white',
  nodeStroke: 'black',
  edgeColor: 'black',
  loopRadius: 34,
  loopSpacing: 15,
  exportScale: 2,
};

let nextId = 1;

function makeId(prefix: string): string {
  nextId += 1;
  return prefix + '-' + nextId.toString();
}

function cloneNode(node: GraphNode): GraphNode {
  return { ...node };
}

function cloneEdge(edge: GraphEdge): GraphEdge {
  return { ...edge };
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function spawnPosition(index: number): { x: number; y: number } {
  const angle = index * 2.3999632297;
  const radius = 95 + Math.sqrt(index) * 34;
  return {
    x: VIEW_WIDTH / 2 + Math.cos(angle) * radius,
    y: VIEW_HEIGHT / 2 + Math.sin(angle) * radius,
  };
}

export function tokenizeDataLine(line: string): { tokens: string[]; error: string | null } {
  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  let escaped = false;
  const backslash = String.fromCharCode(92);
  const quote = String.fromCharCode(34);
  const tab = String.fromCharCode(9);

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === backslash) {
      escaped = true;
      continue;
    }
    if (char === quote) {
      inQuote = !inQuote;
      continue;
    }
    if ((char === ' ' || char === tab) && !inQuote) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }

  if (escaped) {
    current += backslash;
  }
  if (inQuote) {
    return { tokens, error: 'Unclosed quote' };
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return { tokens, error: null };
}

function needsQuoting(value: string): boolean {
  const backslash = String.fromCharCode(92);
  const quote = String.fromCharCode(34);
  const tab = String.fromCharCode(9);
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === ' ' || char === tab || char === quote || char === backslash) {
      return true;
    }
  }
  return value.length === 0;
}

export function formatToken(value: string): string {
  const quote = String.fromCharCode(34);
  const backslash = String.fromCharCode(92);
  if (!needsQuoting(value)) {
    return value;
  }
  const escaped = value.split(backslash).join(backslash + backslash).split(quote).join(backslash + quote);
  return quote + escaped + quote;
}

export function getDefaultSettings(): GraphSettings {
  return { ...DEFAULT_SETTINGS };
}

export function getDefaultSnapshot(): GraphSnapshot {
  const labels = ['0', '1', '2', '3', '4', '5'];
  const coords = [
    { x: 245, y: 235 },
    { x: 515, y: 370 },
    { x: 130, y: 105 },
    { x: 520, y: 120 },
    { x: 130, y: 390 },
    { x: 390, y: 245 },
  ];
  const nodes: GraphNode[] = labels.map((label, index) => ({
    id: makeId('n'),
    label,
    x: coords[index].x,
    y: coords[index].y,
    fixed: false,
  }));
  const byLabel = new Map(nodes.map((node) => [node.label, node.id]));
  const edgePairs = [
    ['0', '2'],
    ['0', '4'],
    ['0', '5'],
    ['1', '4'],
    ['1', '5'],
    ['2', '3'],
    ['2', '4'],
    ['4', '5'],
    ['5', '5'],
  ];
  const edges: GraphEdge[] = edgePairs.map((pair) => ({
    id: makeId('e'),
    source: byLabel.get(pair[0]) || '',
    target: byLabel.get(pair[1]) || '',
    label: '',
  }));
  return {
    version: 1,
    nodes,
    edges,
    settings: getDefaultSettings(),
  };
}

export class GraphModel {
  nodes: GraphNode[] = [];
  edges: GraphEdge[] = [];
  settings: GraphSettings = getDefaultSettings();

  constructor(snapshot?: GraphSnapshot) {
    this.restore(snapshot || getDefaultSnapshot());
  }

  snapshot(): GraphSnapshot {
    return {
      version: 1,
      nodes: this.nodes.map(cloneNode),
      edges: this.edges.map(cloneEdge),
      settings: { ...this.settings },
    };
  }

  restore(snapshot: GraphSnapshot): void {
    this.nodes = snapshot.nodes.map(cloneNode);
    this.edges = snapshot.edges.map(cloneEdge);
    this.settings = { ...getDefaultSettings(), ...snapshot.settings };
    const validIds = new Set(this.nodes.map((node) => node.id));
    this.edges = this.edges.filter((edge) => validIds.has(edge.source) && validIds.has(edge.target));
    this.settings.nodeRadius = clamp(this.settings.nodeRadius, 3, 30);
    this.settings.idealEdgeDistance = clamp(this.settings.idealEdgeDistance, 40, 240);
    this.settings.repulsionDistance = clamp(this.settings.repulsionDistance, 60, 260);
    this.settings.loopRadius = clamp(this.settings.loopRadius, 16, 90);
    this.settings.loopSpacing = clamp(this.settings.loopSpacing, 6, 40);
    this.settings.exportScale = clamp(this.settings.exportScale, 1, 4);
  }

  setSettings(partial: Partial<GraphSettings>): void {
    this.settings = { ...this.settings, ...partial };
    this.settings.nodeRadius = clamp(this.settings.nodeRadius, 3, 30);
    this.settings.idealEdgeDistance = clamp(this.settings.idealEdgeDistance, 40, 240);
    this.settings.repulsionDistance = clamp(this.settings.repulsionDistance, 60, 260);
    this.settings.loopRadius = clamp(this.settings.loopRadius, 16, 90);
    this.settings.loopSpacing = clamp(this.settings.loopSpacing, 6, 40);
    this.settings.exportScale = clamp(this.settings.exportScale, 1, 4);
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.find((node) => node.id === id);
  }

  getNodeByLabel(label: string): GraphNode | undefined {
    return this.nodes.find((node) => node.label === label);
  }

  getEdge(id: string): GraphEdge | undefined {
    return this.edges.find((edge) => edge.id === id);
  }

  nextLabel(): string {
    const used = new Set(this.nodes.map((node) => node.label));
    const start = this.settings.indexMode === '1' ? 1 : 0;
    for (let i = start; i < start + 100000; i += 1) {
      const candidate = i.toString();
      if (!used.has(candidate)) {
        return candidate;
      }
    }
    return makeId('v');
  }

  addNode(label?: string, x?: number, y?: number, fixed = false): GraphNode {
    let finalLabel = label === undefined ? this.nextLabel() : label.trim();
    if (finalLabel.length === 0) {
      finalLabel = this.nextLabel();
    }
    if (this.getNodeByLabel(finalLabel)) {
      throw new Error('Node labels must be unique: ' + finalLabel);
    }
    const position = spawnPosition(this.nodes.length);
    const node: GraphNode = {
      id: makeId('n'),
      label: finalLabel,
      x: x === undefined ? position.x : clamp(x, 40, VIEW_WIDTH - 40),
      y: y === undefined ? position.y : clamp(y, 40, VIEW_HEIGHT - 40),
      fixed,
    };
    this.nodes.push(node);
    return node;
  }

  addEdge(sourceId: string, targetId: string, label = ''): GraphEdge {
    if (!this.getNode(sourceId) || !this.getNode(targetId)) {
      throw new Error('Both endpoints must exist before adding an edge.');
    }
    const edge: GraphEdge = {
      id: makeId('e'),
      source: sourceId,
      target: targetId,
      label,
    };
    this.edges.push(edge);
    return edge;
  }

  removeNode(id: string): void {
    this.nodes = this.nodes.filter((node) => node.id !== id);
    this.edges = this.edges.filter((edge) => edge.source !== id && edge.target !== id);
  }

  removeEdge(id: string): void {
    this.edges = this.edges.filter((edge) => edge.id !== id);
  }

  setNodeLabel(id: string, rawLabel: string): void {
    const node = this.getNode(id);
    if (!node) {
      return;
    }
    const label = rawLabel.trim();
    if (label.length === 0) {
      throw new Error('A node label cannot be empty.');
    }
    const duplicate = this.nodes.find((other) => other.id !== id && other.label === label);
    if (duplicate) {
      throw new Error('Node labels must be unique: ' + label);
    }
    node.label = label;
  }

  setEdgeLabel(id: string, label: string): void {
    const edge = this.getEdge(id);
    if (edge) {
      edge.label = label.trim();
    }
  }

  serializeData(): string {
    const lines: string[] = [];
    for (const node of this.nodes) {
      lines.push(formatToken(node.label));
    }
    for (const edge of this.edges) {
      const source = this.getNode(edge.source);
      const target = this.getNode(edge.target);
      if (!source || !target) {
        continue;
      }
      let line = formatToken(source.label) + ' ' + formatToken(target.label);
      if (edge.label.length > 0) {
        line += ' ' + formatToken(edge.label);
      }
      lines.push(line);
    }
    return lines.join('\n');
  }

  parseData(text: string): ParseResult {
    const issues: ParseIssue[] = [];
    const nodeLabels: string[] = [];
    const edgeSpecs: Array<{ source: string; target: string; label: string; line: number }> = [];
    const seenNodes = new Set<string>();
    const lines = text.split(/\r?\n/);

    const addLabel = (label: string, line: number): void => {
      if (seenNodes.has(label)) {
        issues.push({ line, message: 'Duplicate node line ignored: ' + label, severity: 'warning' });
        return;
      }
      seenNodes.add(label);
      nodeLabels.push(label);
    };

    for (let index = 0; index < lines.length; index += 1) {
      const lineNumber = index + 1;
      const line = lines[index].trim();
      if (line.length === 0 || line.startsWith('#')) {
        continue;
      }
      const parsed = tokenizeDataLine(line);
      if (parsed.error) {
        issues.push({ line: lineNumber, message: parsed.error, severity: 'error' });
        continue;
      }
      const tokens = parsed.tokens;
      if (tokens.length === 0) {
        continue;
      }
      if (tokens.length === 1) {
        addLabel(tokens[0], lineNumber);
        continue;
      }
      if (tokens.length === 2 || tokens.length === 3) {
        const source = tokens[0];
        const target = tokens[1];
        const label = tokens.length === 3 ? tokens[2] : '';
        if (!seenNodes.has(source)) {
          seenNodes.add(source);
          nodeLabels.push(source);
        }
        if (!seenNodes.has(target)) {
          seenNodes.add(target);
          nodeLabels.push(target);
        }
        edgeSpecs.push({ source, target, label, line: lineNumber });
        continue;
      }
      issues.push({
        line: lineNumber,
        message: 'Expected a node, an edge, or an edge with a label.',
        severity: 'error',
      });
    }

    const hasErrors = issues.some((issue) => issue.severity === 'error');
    if (hasErrors) {
      return { ok: false, issues };
    }

    const oldByLabel = new Map(this.nodes.map((node) => [node.label, node]));
    const newNodes: GraphNode[] = nodeLabels.map((label, index) => {
      const old = oldByLabel.get(label);
      if (old) {
        return { ...old, label };
      }
      const position = spawnPosition(index);
      return {
        id: makeId('n'),
        label,
        x: position.x,
        y: position.y,
        fixed: false,
      };
    });
    const byLabel = new Map(newNodes.map((node) => [node.label, node.id]));
    const newEdges: GraphEdge[] = [];
    for (const spec of edgeSpecs) {
      const source = byLabel.get(spec.source);
      const target = byLabel.get(spec.target);
      if (!source || !target) {
        issues.push({
          line: spec.line,
          message: 'Edge endpoint could not be resolved.',
          severity: 'error',
        });
        continue;
      }
      newEdges.push({
        id: makeId('e'),
        source,
        target,
        label: spec.label,
      });
    }

    if (issues.some((issue) => issue.severity === 'error')) {
      return { ok: false, issues };
    }

    this.nodes = newNodes;
    this.edges = newEdges;
    return { ok: true, issues };
  }

  renumber(mode: IndexMode): void {
    this.settings.indexMode = mode;
    if (mode === 'custom') {
      return;
    }
    const offset = mode === '1' ? 1 : 0;
    const mapping = new Map<string, string>();
    this.nodes.forEach((node, index) => {
      mapping.set(node.label, (index + offset).toString());
    });
    this.nodes.forEach((node) => {
      node.label = mapping.get(node.label) || node.label;
    });
  }

  setAllFixed(value: boolean): void {
    this.nodes.forEach((node) => {
      node.fixed = value;
    });
  }

  arrangeTree(): void {
    const byId = new Map(this.nodes.map((node) => [node.id, node]));
    const adjacency = new Map<string, string[]>();
    this.nodes.forEach((node) => adjacency.set(node.id, []));
    for (const edge of this.edges) {
      if (edge.source === edge.target) {
        continue;
      }
      adjacency.get(edge.source)?.push(edge.target);
      adjacency.get(edge.target)?.push(edge.source);
    }

    const depths = new Map<string, number>();
    const queue: string[] = [];
    const roots: string[] = [];
    const ordered = [...this.nodes].sort((a, b) => {
      const degreeA = adjacency.get(a.id)?.length || 0;
      const degreeB = adjacency.get(b.id)?.length || 0;
      return degreeB - degreeA;
    });
    for (const root of ordered) {
      if (depths.has(root.id)) {
        continue;
      }
      roots.push(root.id);
      depths.set(root.id, 0);
      queue.push(root.id);
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) {
          continue;
        }
        const currentDepth = depths.get(current) || 0;
        for (const neighbor of adjacency.get(current) || []) {
          if (!depths.has(neighbor)) {
            depths.set(neighbor, currentDepth + 1);
            queue.push(neighbor);
          }
        }
      }
    }

    const groups = new Map<number, GraphNode[]>();
    for (const node of this.nodes) {
      const depth = depths.get(node.id) || 0;
      if (!groups.has(depth)) {
        groups.set(depth, []);
      }
      groups.get(depth)?.push(node);
    }
    const maxDepth = Math.max(1, ...Array.from(groups.keys()));
    for (const [depth, groupNodes] of groups) {
      const y = 80 + (depth / maxDepth) * (VIEW_HEIGHT - 160);
      groupNodes.forEach((node, index) => {
        node.x = 110 + ((index + 1) / (groupNodes.length + 1)) * (VIEW_WIDTH - 220);
        node.y = y;
        node.fixed = true;
      });
    }

    if (roots.length > 1) {
      const componentWidth = (VIEW_WIDTH - 220) / roots.length;
      let componentIndex = 0;
      const visited = new Set<string>();
      for (const rootId of roots) {
        if (visited.has(rootId)) {
          continue;
        }
        const component = new Set<string>();
        const componentQueue = [rootId];
        component.add(rootId);
        while (componentQueue.length > 0) {
          const current = componentQueue.shift();
          if (!current) {
            continue;
          }
          for (const neighbor of adjacency.get(current) || []) {
            if (!component.has(neighbor)) {
              component.add(neighbor);
              componentQueue.push(neighbor);
            }
          }
        }
        const shift = 110 + componentWidth * (componentIndex + 0.5) - VIEW_WIDTH / 2;
        for (const id of component) {
          const node = byId.get(id);
          if (node) {
            node.x = clamp(node.x + shift * 0.35, 40, VIEW_WIDTH - 40);
          }
        }
        component.forEach((id) => visited.add(id));
        componentIndex += 1;
      }
    }
  }
}
