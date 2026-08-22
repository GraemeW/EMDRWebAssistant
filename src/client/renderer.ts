import type { BobbleShape, PublicState } from '../shared/types.js';
import { computeAt } from '../shared/motion.js';
import { stage, bobbleEl } from './dom.js';

// Interfaces
export interface RenderInput {
  state: PublicState | null;
  now: number;
  visible: boolean;
}

interface PaintedAppearance {
  shape: BobbleShape;
  size: number;
  bobbleColor: string;
}


export class BobbleRenderer {
  // Cached stage geometry — Only recomputed when the stage's own size actually changes
  private stageRect: DOMRect = stage.getBoundingClientRect();
  private lastPainted: PaintedAppearance | null = null;
  private lastDirection: 1 | -1 | null = null;

  constructor() {
    new ResizeObserver(() => { this.stageRect = stage.getBoundingClientRect(); }).observe(stage);
  }

  start(getInput: () => RenderInput, onBounce?: (direction: 1 | -1) => void): void {
    const loop = (): void => {
      const { state, now, visible } = getInput();
      if (state && visible) { this.paint(state, now, onBounce); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // The stage starts out hidden — call this when the session view becomes visible
  refreshStageSize(): void { this.stageRect = stage.getBoundingClientRect(); }

  // Private Methods
  private paint(state: PublicState, now: number, onBounce?: (direction: 1 | -1) => void): void {
    const sample = computeAt(state, now);

    if (onBounce && sample.speed > 0 && this.lastDirection !== null && sample.direction !== this.lastDirection) {
      onBounce(sample.direction);
    }
    this.lastDirection = sample.direction;

    const rect = this.stageRect;

    const x = sample.fraction * rect.width;
    const y = 0.5 * rect.height;
    bobbleEl.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    if (this.lastPainted && this.lastPainted.shape === state.shape && this.lastPainted.size === state.size && this.lastPainted.bobbleColor === state.bobbleColor) { return; }
    
    this.lastPainted = { shape: state.shape, size: state.size, bobbleColor: state.bobbleColor };
    const minDim = Math.min(rect.width, rect.height);
    const diameter = Math.max(14, minDim * (0.04 + state.size * 0.22));

    bobbleEl.classList.remove('shape-circle', 'shape-square', 'shape-triangle');
    bobbleEl.classList.add(`shape-${state.shape}`);

    if (state.shape === 'triangle') {
      bobbleEl.style.width = '0';
      bobbleEl.style.height = '0';
      bobbleEl.style.borderLeft = `${diameter / 2}px solid transparent`;
      bobbleEl.style.borderRight = `${diameter / 2}px solid transparent`;
      bobbleEl.style.borderBottom = `${diameter * 0.87}px solid ${state.bobbleColor}`;
    } else {
      bobbleEl.style.border = 'none';
      bobbleEl.style.width = `${diameter}px`;
      bobbleEl.style.height = `${diameter}px`;
      bobbleEl.style.background = state.bobbleColor;
    }
  }
}
