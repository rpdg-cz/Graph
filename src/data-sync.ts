import { formatToken, tokenizeDataLine, type GraphModel } from './model.js';
import type { GraphEdge, GraphNode, GraphSnapshot } from './types.js';

interface LineMap {
  nodeLines: Map<string, number[]>;
  edgeLines: Map<string, number>;
}

function addNodeLine(map: Map<string, number[]>, nodeId: string, line: number): void {
  if (!map.has(nodeId)) {
    map.set(nodeId, []);
  }
  map.get(nodeId)?.push(line);
}

function buildLineMap(lines: string[], snapshot: GraphSnapshot): LineMap {
  const nodeLines = new Map<string, number[]>();
  const edgeLines = new Map<string, number>();
  const nodeByLabel = new Map(snapshot.nodes.map((node) => [node.label, node]));
  const usedEdges = new Set<string>();

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index].trim();
    if (raw.length === 0 || raw.startsWith('#')) {
      continue;
    }
    const parsed = tokenizeDataLine(raw);
    if (parsed.error || parsed.tokens.length === 0 || parsed.tokens.length > 3) {
      continue;
    }
    if (parsed.tokens.length === 1) {
      const node = nodeByLabel.get(parsed.tokens[0]);
      if (node) {
        addNodeLine(nodeLines, node.id, index);
      }
      continue;
    }
    const source = parsed.tokens[0];
    const target = parsed.tokens[1];
    const label = parsed.tokens.length === 3 ? parsed.tokens[2] : '';
    const candidates = snapshot.edges.filter((edge) => {
      if (usedEdges.has(edge.id)) {
        return false;
      }
      const sourceNode = snapshot.nodes.find((node) => node.id === edge.source);
      const targetNode = snapshot.nodes.find((node) => node.id === edge.target);
      if (!sourceNode || !targetNode) {
        return false;
      }
      return sourceNode.label === source && targetNode.label === target;
    });
    const exact = candidates.find((edge) => edge.label === label);
    const chosen = exact || (parsed.tokens.length === 2 ? candidates.find((edge) => edge.label.length === 0) : undefined);
    if (chosen) {
      usedEdges.add(chosen.id);
      edgeLines.set(chosen.id, index);
    }
  }

  return { nodeLines, edgeLines };
}

function edgeText(edge: GraphEdge, nodes: Map<string, GraphNode>): string {
  const source = nodes.get(edge.source);
  const target = nodes.get(edge.target);
  if (!source || !target) {
    return '';
  }
  let line = formatToken(source.label) + ' ' + formatToken(target.label);
  if (edge.label.length > 0) {
    line += ' ' + formatToken(edge.label);
  }
  return line;
}

function offsetForLineColumn(lines: string[], line: number, column: number): number {
  let offset = 0;
  for (let index = 0; index < line && index < lines.length; index += 1) {
    offset += lines[index].length + 1;
  }
  if (lines.length === 0) {
    return 0;
  }
  return offset + Math.min(column, lines[Math.min(line, lines.length - 1)].length);
}

function lineColumnForOffset(value: string, offset: number): { line: number; column: number } {
  const safeOffset = Math.max(0, Math.min(offset, value.length));
  const before = value.slice(0, safeOffset);
  const parts = before.split('\n');
  return { line: parts.length - 1, column: parts[parts.length - 1].length };
}

export class GraphDataSync {
  private editor: HTMLTextAreaElement;
  private model: GraphModel;

  constructor(editor: HTMLTextAreaElement, model: GraphModel) {
    this.editor = editor;
    this.model = model;
  }

  replaceAllFromModel(): void {
    const value = this.model.serializeData();
    if (this.editor.value !== value) {
      const selection = this.editor.selectionStart;
      this.editor.value = value;
      const next = Math.min(selection, value.length);
      this.editor.setSelectionRange(next, next);
    }
  }

  applyModelChange(before: GraphSnapshot, after: GraphSnapshot): void {
    const originalValue = this.editor.value;
    const hadTrailingNewline = originalValue.endsWith('\n');
    const hadFocus = document.activeElement === this.editor;
    const selectionStart = this.editor.selectionStart;
    const selectionEnd = this.editor.selectionEnd;
    const cursor = lineColumnForOffset(originalValue, selectionStart);
    const selectionEndPosition = lineColumnForOffset(originalValue, selectionEnd);
    const originalLines = originalValue.split('\n');
    if (hadTrailingNewline) {
      originalLines.pop();
    }

    const map = buildLineMap(originalLines, before);
    const beforeNodes = new Map(before.nodes.map((node) => [node.id, node]));
    const afterNodes = new Map(after.nodes.map((node) => [node.id, node]));
    const beforeEdges = new Map(before.edges.map((edge) => [edge.id, edge]));
    const afterEdges = new Map(after.edges.map((edge) => [edge.id, edge]));
    const removedLines = new Set<number>();
    const replacements = new Map<number, string>();
    const appended: string[] = [];

    for (const node of before.nodes) {
      if (!afterNodes.has(node.id)) {
        for (const line of map.nodeLines.get(node.id) || []) {
          removedLines.add(line);
        }
      }
    }
    for (const edge of before.edges) {
      if (!afterEdges.has(edge.id)) {
        const line = map.edgeLines.get(edge.id);
        if (line !== undefined) {
          removedLines.add(line);
        }
      }
    }

    const changedNodeIds = new Set<string>();
    for (const node of after.nodes) {
      const old = beforeNodes.get(node.id);
      if (!old) {
        appended.push(formatToken(node.label));
        continue;
      }
      if (old.label !== node.label) {
        changedNodeIds.add(node.id);
        for (const line of map.nodeLines.get(node.id) || []) {
          replacements.set(line, formatToken(node.label));
        }
      }
    }

    const changedEdgeIds = new Set<string>();
    for (const edge of after.edges) {
      const old = beforeEdges.get(edge.id);
      if (!old) {
        const text = edgeText(edge, afterNodes);
        if (text.length > 0) {
          appended.push(text);
        }
        continue;
      }
      if (old.label !== edge.label || old.source !== edge.source || old.target !== edge.target) {
        changedEdgeIds.add(edge.id);
      }
    }

    for (const edge of before.edges) {
      if (!afterEdges.has(edge.id)) {
        continue;
      }
      if (changedEdgeIds.has(edge.id) || changedNodeIds.has(edge.source) || changedNodeIds.has(edge.target)) {
        const line = map.edgeLines.get(edge.id);
        const current = afterEdges.get(edge.id);
        if (line !== undefined && current) {
          replacements.set(line, edgeText(current, afterNodes));
        }
      }
    }

    const newLines: string[] = [];
    const lineMapping = new Map<number, number>();
    for (let index = 0; index < originalLines.length; index += 1) {
      if (removedLines.has(index)) {
        continue;
      }
      lineMapping.set(index, newLines.length);
      newLines.push(replacements.get(index) ?? originalLines[index]);
    }

    for (const line of appended) {
      newLines.push(line);
    }

    let nextValue = newLines.join('\n');
    if (hadTrailingNewline && !nextValue.endsWith('\n')) {
      nextValue += '\n';
    }
    if (nextValue === originalValue) {
      return;
    }

    const mapCursorLine = (line: number): number => {
      const direct = lineMapping.get(line);
      if (direct !== undefined) {
        return direct;
      }
      for (let index = line + 1; index < originalLines.length; index += 1) {
        const next = lineMapping.get(index);
        if (next !== undefined) {
          return next;
        }
      }
      return Math.max(0, newLines.length - 1);
    };

    const nextCursorLine = mapCursorLine(cursor.line);
    const nextEndLine = mapCursorLine(selectionEndPosition.line);
    const nextCursor = offsetForLineColumn(newLines, nextCursorLine, cursor.column);
    const nextEnd = offsetForLineColumn(newLines, nextEndLine, selectionEndPosition.column);
    this.editor.value = nextValue;
    if (hadFocus) {
      this.editor.setSelectionRange(nextCursor, nextEnd);
    }
  }
}
