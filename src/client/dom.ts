// Export Functions
export function requireElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) { throw new Error(`Missing #${id} in the page`); }
  return el as T;
}

// Landing screen
export const landing = requireElement<HTMLElement>('landing');
export const passphraseInput = requireElement<HTMLInputElement>('director-passphrase');
export const btnJoinAdmin = requireElement<HTMLButtonElement>('btn-join-admin');
export const btnJoinViewer = requireElement<HTMLButtonElement>('btn-join-viewer');
export const adminHint = requireElement<HTMLParagraphElement>('admin-hint');
export const viewerHint = requireElement<HTMLParagraphElement>('viewer-hint');

// Session screen
export const session = requireElement<HTMLElement>('session');
export const roleBadge = requireElement<HTMLElement>('role-badge');
export const directorStatus = requireElement<HTMLElement>('director-status');
export const btnFullscreen = requireElement<HTMLButtonElement>('btn-fullscreen');
export const stage = requireElement<HTMLDivElement>('stage');
export const bobbleEl = requireElement<HTMLDivElement>('bobble');
export const controls = requireElement<HTMLElement>('controls');

// Admin control dock
export const btnToggleRun = requireElement<HTMLButtonElement>('btn-toggle-run');
export const btnReset = requireElement<HTMLButtonElement>('btn-reset');
export const shapeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.shape-btn'));
export const sizeSlider = requireElement<HTMLInputElement>('size-slider');
export const speedSlider = requireElement<HTMLInputElement>('speed-slider');
export const rangeSlider = requireElement<HTMLInputElement>('range-slider');
export const bobbleColorInput = requireElement<HTMLInputElement>('bobble-color');
export const backgroundColorInput = requireElement<HTMLInputElement>('background-color');
export const btnSaveSettings = requireElement<HTMLButtonElement>('btn-save-settings');
export const btnLoadSettings = requireElement<HTMLButtonElement>('btn-load-settings');
