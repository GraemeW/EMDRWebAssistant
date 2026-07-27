import type { PublicState } from '../shared/types.js';
import { computeAt } from '../shared/motion.js';
import { stage, bobbleEl } from './dom.js';

// Interfaces
export interface RenderInput {
  state: PublicState | null;
  now: number;
  visible: boolean;
}

export class BobbleRenderer {
  start(getInput: () => RenderInput): void {
    const loop = (): void => {
      const { state, now, visible } = getInput();
      if (state && visible) { this.paint(state, now); }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // Private Methods
  private paint(state: PublicState, now: number): void {
    const sample = computeAt(state, now);

    const rect = stage.getBoundingClientRect();
    const minDim = Math.min(rect.width, rect.height);
    const diameter = Math.max(14, minDim * (0.04 + state.size * 0.22));

    const x = sample.fraction * rect.width;
    const y = 0.5 * rect.height;

    bobbleEl.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;

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

      // Old fix for rendering artifacts, no longer required w/ translate approach
      //bobbleEl.style.border = `2px solid ${state.backgroundColor}`; 
    }
  }
}
