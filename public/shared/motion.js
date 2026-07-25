// Ported from BobbleMover.cs. This module has zero Node- or DOM-specific
// APIs, so it's compiled once for the server (CommonJS) and once for the
// browser (ES modules) from this single source — no duplicated logic to
// keep in sync between the two.
export const MIN_FRACTIONAL_SPEED = 0.005;
export const MAX_FRACTIONAL_SPEED = 0.05;
export const TIME_OFFSET_FACTOR = 50.0;
/** Seconds to ramp fully between 0 and target speed on play/pause — matches BobbleMover.cs's _speedRampTime. */
export const RAMP_DURATION = 1.5;
export function clamp01(v) {
    return Math.min(1, Math.max(0, v));
}
export function speedToFractionPerSecond(relativeSpeed) {
    const f = MIN_FRACTIONAL_SPEED + (MAX_FRACTIONAL_SPEED - MIN_FRACTIONAL_SPEED) * relativeSpeed;
    return f * TIME_OFFSET_FACTOR;
}
/** Rough stand-in for BobbleMover's spriteToScreenFraction margin, so the bobble doesn't clip past the viewport edge. */
function spriteMargin(size) {
    return 0.03 + size * 0.05;
}
export function getBounds(range, size) {
    const margin = spriteMargin(size) / 2;
    const lower = clamp01(0.5 - range / 2) + margin;
    const upper = clamp01(0.5 + range / 2) - margin;
    return upper > lower ? { lower, upper } : { lower: 0.5, upper: 0.5 };
}
/**
 * Given the session's params and an anchor (a frozen fraction/direction/speed
 * at some past timestamp), return where the bobble is — and how fast it's
 * moving — at `now`. Speed eases linearly from the anchor's speed toward the
 * target (full speed if running, 0 if paused) over RAMP_DURATION seconds and
 * then holds, mirroring Unity's ReconcileSpeed/SetSpeedRamp. Distance
 * traveled is the closed-form time-integral of that speed profile, so this
 * needs no per-frame simulation loop on the server.
 */
export function computeAt(s, now) {
    const { lower, upper } = getBounds(s.range, s.size);
    const range = upper - lower;
    if (range <= 0)
        return { fraction: lower, direction: 1, speed: 0 };
    const dt = Math.max(0, (now - s.anchor.t) / 1000);
    const fullSpeed = speedToFractionPerSecond(s.speed);
    const target = s.running ? fullSpeed : 0;
    const s0 = s.anchor.speed;
    const rampRate = fullSpeed / RAMP_DURATION; // magnitude
    let distance;
    let speedNow;
    if (rampRate === 0 || Math.abs(target - s0) < 1e-9) {
        speedNow = target;
        distance = target * dt;
    }
    else {
        const signedRate = target > s0 ? rampRate : -rampRate;
        const dtRamp = Math.abs(target - s0) / rampRate;
        if (dt <= dtRamp) {
            speedNow = s0 + signedRate * dt;
            distance = s0 * dt + 0.5 * signedRate * dt * dt;
        }
        else {
            const distanceDuringRamp = s0 * dtRamp + 0.5 * signedRate * dtRamp * dtRamp;
            speedNow = target;
            distance = distanceDuringRamp + target * (dt - dtRamp);
        }
    }
    // Unfold the anchor's position onto a 0..range ramp assuming "forward"
    // travel, walk it forward by distance covered, then fold back via reflection.
    const anchorOffset = s.anchor.fraction - lower;
    const u0 = s.anchor.direction === 1 ? anchorOffset : range - anchorOffset;
    const period = 2 * range;
    let u = (u0 + distance) % period;
    if (u < 0)
        u += period;
    return u <= range
        ? { fraction: lower + u, direction: 1, speed: speedNow }
        : { fraction: lower + (period - u), direction: -1, speed: speedNow };
}
//# sourceMappingURL=motion.js.map