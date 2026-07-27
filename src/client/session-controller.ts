import type { ControlAction, PublicState, Role, ServerMessage } from '../shared/types.js';
import { isBobbleShape } from '../shared/validate.js';
import { hmacSha256Hex, isSecureCryptoAvailable } from './crypto.js';
import { saveTextFile, openTextFile } from './file-io.js';
import { serializeSettings, parseSettingsFile, SETTINGS_FILE_SUGGESTED_NAME } from './settings-file.js';
import type { ServerConnection } from './connection.js';
import type { BobbleRenderer, RenderInput } from './renderer.js';
import {
  landing,
  passphraseInput,
  btnJoinAdmin,
  btnJoinViewer,
  adminHint,
  viewerHint,
  session,
  roleBadge,
  directorStatus,
  stage,
  controls,
  btnToggleRun,
  btnReset,
  shapeButtons,
  sizeSlider,
  speedSlider,
  rangeSlider,
  bobbleColorInput,
  backgroundColorInput,
  btnSaveSettings,
  btnLoadSettings,
  btnFullscreen,
} from './dom.js';

// Types
type JoinedMessage = Extract<ServerMessage, { type: 'joined' }>;


export class SessionController {
  private myRole: Role | null = null;
  private latestState: PublicState | null = null;
  private clockOffset = 0; // serverTime - localTime, sampled on each state message
  private pendingAdminJoin = false;
  private currentNonce: string | null = null;

  constructor(
    private readonly connection: ServerConnection,
    private readonly renderer: BobbleRenderer,
  ) {}

  start(): void {
    this.connection.onOpen(() => this.handleOpen());
    this.connection.onClose(() => this.handleClose());
    this.connection.onMessage((msg) => this.handleServerMessage(msg));

    this.bindLandingControls();
    this.bindAdminControls();
    this.bindSettingsFileControls();
    this.bindFullscreenControl();

    this.connection.connect();
    this.renderer.start(() => this.renderInput());
  }

  private renderInput(): RenderInput {
    return {
      state: this.latestState,
      now: Date.now() + this.clockOffset,
      visible: !session.classList.contains('hidden'),
    };
  }

  // Connection lifecycle

  private handleOpen(): void {
    adminHint.textContent = '';
    viewerHint.textContent = '';
  }

  private handleClose(): void {
    if (!session.classList.contains('hidden')) { directorStatus.textContent = 'Connection lost — reconnecting…'; }
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'joined':
        this.handleJoined(msg);
        return;
      case 'state':
        this.latestState = msg.state;
        this.clockOffset = msg.state.serverTime - Date.now();
        this.applyStateToUI(msg.state);
        return;
      case 'pong':
        return;
      case 'challenge':
        this.currentNonce = msg.nonce;
        return;
      case 'kicked':
        this.leaveSession(msg.reason);
        return;
      default: {
        const exhaustive: never = msg;
        return exhaustive;
      }
    }
  }

  private handleJoined(msg: JoinedMessage): void {
    if (this.pendingAdminJoin) {
      this.pendingAdminJoin = false;
      if (msg.role === 'admin') {
        this.enterSession('admin');
      } else {
        adminHint.textContent = msg.error ?? 'Could not join as director.';
        if (msg.role === 'viewer') { this.enterSession('viewer'); }
      }
    } else if (msg.role === 'viewer') {
      this.enterSession('viewer');
    }
  }

  private enterSession(role: Role): void {
    this.myRole = role;
    landing.classList.add('hidden');
    session.classList.remove('hidden');
    roleBadge.textContent = role === 'admin' ? 'director' : 'viewer';
    roleBadge.classList.toggle('is-admin', role === 'admin');
    controls.classList.toggle('hidden', role !== 'admin');
    this.renderer.refreshStageSize();
  }

  // Landing screen

  private leaveSession(reason: string): void {
    this.myRole = null;
    session.classList.add('hidden');
    landing.classList.remove('hidden');
    adminHint.textContent = reason;
  }

  private bindLandingControls(): void {
    btnJoinAdmin.addEventListener('click', () => { void this.attemptAdminJoin(); });
    passphraseInput.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') { btnJoinAdmin.click(); }});
    btnJoinViewer.addEventListener('click', () => { this.connection.send({ type: 'join', role: 'viewer' }); });
  }

  private async attemptAdminJoin(): Promise<void> {
    const passphrase = passphraseInput.value;
    if (!passphrase) {
      adminHint.textContent = 'Enter the director passphrase first.';
      return;
    }
    if (!isSecureCryptoAvailable()) {
      adminHint.textContent = 'Your browser blocked secure login on this page (needs HTTPS).';
      return;
    }
    if (!this.currentNonce) {
      adminHint.textContent = 'Still connecting — try again in a moment.';
      return;
    }

    const digest = await hmacSha256Hex(passphrase, this.currentNonce);
    this.pendingAdminJoin = true;
    adminHint.textContent = '';
    this.connection.send({ type: 'join', role: 'admin', digest });
  }

  // Header
  private bindFullscreenControl(): void {
    btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    document.addEventListener('fullscreenchange', () => this.updateFullscreenLabel());
    this.updateFullscreenLabel();
  }

  private updateFullscreenLabel(): void {
    const label = document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen';
    btnFullscreen.setAttribute('aria-label', label);
    btnFullscreen.title = label;
  }

  // Admin control dock

  private sendControl(action: ControlAction): void {
    if (this.myRole !== 'admin') { return; }
    this.connection.send({ type: 'control', ...action });
  }

  private bindAdminControls(): void {
    btnToggleRun.addEventListener('click', () => this.sendControl({ action: 'toggleRunning' }));
    btnReset.addEventListener('click', () => this.sendControl({ action: 'reset' }));

    shapeButtons.forEach((btn) => {
      const shape = btn.dataset.shape;
      if (!isBobbleShape(shape)) {
        console.warn(`Shape button has an unrecognized data-shape value: ${String(shape)}`);
        return;
      }
      btn.addEventListener('click', () => this.sendControl({ action: 'setShape', value: shape }));
    });

    sizeSlider.addEventListener('input', () => this.sendControl({ action: 'setSize', value: Number(sizeSlider.value) }),);
    speedSlider.addEventListener('input', () => this.sendControl({ action: 'setSpeed', value: Number(speedSlider.value) }),);
    rangeSlider.addEventListener('input', () => this.sendControl({ action: 'setRange', value: Number(rangeSlider.value) }),);
    bobbleColorInput.addEventListener('input', () => this.sendControl({ action: 'setBobbleColor', value: bobbleColorInput.value }),);
    backgroundColorInput.addEventListener('input', () => this.sendControl({ action: 'setBackgroundColor', value: backgroundColorInput.value }),);
  }

  private bindSettingsFileControls(): void { 
    btnSaveSettings.addEventListener('click', () => { void this.saveSettingsFile(); });
    btnLoadSettings.addEventListener('click', () => { openTextFile('application/json,.json', (text) => this.handleLoadedSettingsFile(text)); });
  }

  private async saveSettingsFile(): Promise<void> {
    if (!this.latestState) { return; }
    const { shape, bobbleColor, backgroundColor, size, speed, range } = this.latestState;
    const json = serializeSettings({ shape, bobbleColor, backgroundColor, size, speed, range });
    try {
      await saveTextFile(SETTINGS_FILE_SUGGESTED_NAME, json, 'application/json');
    } catch (err) {
      console.error('Failed to save settings file', err);
      alert('Could not save the settings file.');
    }
  }

  private handleLoadedSettingsFile(text: string): void {
    const settings = parseSettingsFile(text);
    if (!settings) {
      alert("Invalid settings file.");
      return;
    }
    this.sendControl({ action: 'loadSettings', value: settings });
  }

  // Reflect server state into the UI

  private applyStateToUI(s: PublicState): void {
    stage.style.background = s.backgroundColor;

    if (s.adminOnline) {
      const n = s.viewerCount;
      directorStatus.textContent = `Director online · ${n > 0 ? 'Viewer connected' : 'No viewer'}`;
    } else {
      directorStatus.textContent = 'No director connected — controls are idle';
    }

    if (this.myRole === 'admin') {
      btnToggleRun.textContent = s.running ? 'Pause' : 'Resume';
      shapeButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.shape === s.shape));
      if (document.activeElement !== sizeSlider) sizeSlider.value = String(s.size);
      if (document.activeElement !== speedSlider) speedSlider.value = String(s.speed);
      if (document.activeElement !== rangeSlider) rangeSlider.value = String(s.range);
      if (document.activeElement !== bobbleColorInput) bobbleColorInput.value = s.bobbleColor;
      if (document.activeElement !== backgroundColorInput) backgroundColorInput.value = s.backgroundColor;
    }
  }
}
