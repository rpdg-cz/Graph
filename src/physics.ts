import type { GraphModel } from './model.js';
import { VIEW_WIDTH, VIEW_HEIGHT } from './types.js';

interface Vector {
  x: number;
  y: number;
}

export class ForceLayout {
  private model: GraphModel;
  private onTick: () => void;
  private frame = 0;
  private idleFrames = 0;
  private lastFrameTime = 0;
  private draggingId: string | null = null;

  constructor(model: GraphModel, onTick: () => void) {
    this.model = model;
    this.onTick = onTick;
  }

  start(): void {
    if (this.frame !== 0) {
      return;
    }
    this.lastFrameTime = 0;
    const loop = (time: number): void => {
      if (this.lastFrameTime === 0 || time - this.lastFrameTime >= 14) {
        this.lastFrameTime = time;
        this.step();
        this.onTick();
      }
      if (this.frame !== 0) {
        this.frame = requestAnimationFrame(loop);
      }
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.frame !== 0) {
      cancelAnimationFrame(this.frame);
    }
    this.frame = 0;
  }

  wake(): void {
    this.idleFrames = 0;
    this.start();
  }

  setDragging(id: string | null): void {
    this.draggingId = id;
    this.wake();
  }

  step(): void {
    const nodes = this.model.nodes;
    if (nodes.length === 0) {
      this.stop();
      return;
    }

    const forces = new Map<string, Vector>();
    for (const node of nodes) {
      forces.set(node.id, { x: 0, y: 0 });
    }

    const indexById = new Map<string, number>();
    nodes.forEach((node, index) => indexById.set(node.id, index));
    const connected = new Set<number>();
    for (const edge of this.model.edges) {
      if (edge.source === edge.target) {
        continue;
      }
      const sourceIndex = indexById.get(edge.source);
      const targetIndex = indexById.get(edge.target);
      if (sourceIndex === undefined || targetIndex === undefined) {
        continue;
      }
      const low = Math.min(sourceIndex, targetIndex);
      const high = Math.max(sourceIndex, targetIndex);
      connected.add(low * nodes.length + high);
    }

    const ideal = this.model.settings.idealEdgeDistance;
    const repulsion = this.model.settings.repulsionDistance;
    const edgeStrength = 15;
    const chargeStrength = 10;

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const first = nodes[i];
        const second = nodes[j];
        let dx = second.x - first.x;
        let dy = second.y - first.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 0.0001) {
          const angle = (i + 1) * 1.7 + (j + 1) * 0.9;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          distance = 1;
        }
        const key = i * nodes.length + j;
        let force = 0;
        if (connected.has(key)) {
          force = edgeStrength * (distance - ideal) / distance;
        } else if (distance < repulsion) {
          force = chargeStrength * (distance - repulsion) / distance;
        }
        if (force === 0) {
          continue;
        }
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        const firstForce = forces.get(first.id);
        const secondForce = forces.get(second.id);
        if (firstForce) {
          firstForce.x += fx;
          firstForce.y += fy;
        }
        if (secondForce) {
          secondForce.x -= fx;
          secondForce.y -= fy;
        }
      }
    }

    const centerX = VIEW_WIDTH / 2;
    const centerY = VIEW_HEIGHT / 2;
    const gravity = 0.007;
    for (const node of nodes) {
      const force = forces.get(node.id);
      if (!force) {
        continue;
      }
      const dx = centerX - node.x;
      const dy = centerY - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 0.0001) {
        force.x += (dx / distance) * distance * gravity;
        force.y += (dy / distance) * distance * gravity;
      }
    }

    const margin = Math.max(52, this.model.settings.nodeRadius + this.model.settings.loopRadius + 26);
    let maxDelta = 0;
    for (const node of nodes) {
      if (node.fixed || node.id === this.draggingId) {
        continue;
      }
      const force = forces.get(node.id);
      if (!force) {
        continue;
      }
      let dx = force.x * 0.38;
      let dy = force.y * 0.38;
      const delta = Math.sqrt(dx * dx + dy * dy);
      if (delta > 18) {
        dx = (dx / delta) * 18;
        dy = (dy / delta) * 18;
      }
      node.x = Math.max(margin, Math.min(VIEW_WIDTH - margin, node.x + dx));
      node.y = Math.max(margin, Math.min(VIEW_HEIGHT - margin, node.y + dy));
      maxDelta = Math.max(maxDelta, Math.sqrt(dx * dx + dy * dy));
    }

    if (maxDelta < 0.06) {
      this.idleFrames += 1;
    } else {
      this.idleFrames = 0;
    }
    if (this.idleFrames > 40) {
      this.stop();
    }
  }
}
