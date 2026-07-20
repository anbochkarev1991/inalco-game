// The Night Engine. The lake remembers in tides: the fog comes up in slow
// swells and lets go again, and the whole night is one long swell that never
// fully lets go. This is the clock the rest of the game reads from — Director
// pressure, fog density, whisper/static baseline, sky veil. It replaces the
// old 0→3 pressure staircase with a breathing curve of dread and lull.
//
//   tide  (0..1) — the moment-to-moment intensity: a slow oscillation whose
//                  baseline and amplitude both lift as the night deepens.
//   phase (0..1) — overall progress through the night. Advances only while the
//                  sim runs, so reading a note or pausing does not drain it.

// How long the night takes to reach its deepest (phase 1.0), in seconds of
// live sim time. Kept as a single named constant so the whole pacing retunes
// from one place. c1 (night-arc) tightened this from 20 → 18 min so a normal
// playthrough clearly climbs through the danger peak (phase ≈ 0.5–0.7) AND
// reaches the visible dawn approach (phase ≈ 0.7–1.0) before the boat crosses.
// b3's revisit gates are FRACTIONS of phase (0.30–0.55) so they auto-scale.
export const NIGHT_DURATION = 18 * 60;   // ~18 minutes

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };

export function createNight() {
  let phase = 0;     // 0..1 progress through the night
  let tide = 0;      // 0..1 current dread intensity
  let nt = 0;        // internal sim-time accumulator (dt-driven, pause-safe)

  return {
    get phase() { return phase; },
    get tide() { return tide; },

    // full dark again — for a fresh run
    reset() { phase = 0; tide = 0; nt = 0; },

    // advance the clock one live frame. Drive from the loop's dt (deterministic,
    // never Date.now); `time` is accepted for API symmetry but we keep our own
    // accumulator so the swell stays continuous across pauses.
    update(dt /* , time */) {
      nt += dt;
      phase = clamp01(phase + dt / NIGHT_DURATION);

      // c1 · THE ARC. Danger is no longer a monotonic climb: it RISES through
      // the first half of the night to a broad PEAK across the darkest hours
      // (phase ≈ 0.5–0.7 — the fog's last push), then EASES DOWN toward calm as
      // first light comes (phase → 1). `arc` is that envelope (0 → 1 plateau → ~0.2);
      // baseline + amplitude both ride it. phase itself stays strictly monotonic
      // (b3's revisit gates + a5's tide hysteresis depend on that).
      const rise = smooth(phase / 0.5);                 // 0 → 1 over phase 0..0.5
      const fall = 1 - 0.80 * smooth((phase - 0.7) / 0.3); // holds to 0.7, → 0.2 by phase 1
      const arc = rise * fall;

      const baseline = 0.06 + 0.16 * arc;   // dread floor grows into the peak, relents at dawn
      const amp = 0.14 + 0.34 * arc;        // swings widen at the peak, narrow toward first light

      // two slow swells beating against each other, plus a low wobble — an
      // organic, non-repeating tide rather than a metronome. This moment-to-
      // moment oscillation rides ON TOP of the arc envelope.
      const swell = 0.5 + 0.5 * Math.sin(nt * 0.042 - 1.3);    // ~150 s period
      const drift = 0.5 + 0.5 * Math.sin(nt * 0.0185 + 0.7);   // ~340 s period
      const wobble = 0.5 + 0.5 * (Math.sin(nt * 0.23 + 2.1) * 0.6 + Math.sin(nt * 0.37 + 0.6) * 0.4);
      const swellMix = swell * 0.68 + drift * 0.32;

      tide = clamp01(baseline + amp * swellMix * (0.82 + 0.18 * wobble));
    },

    // debug/verification only (never called from the sim loop): jump the clock
    // to a phase and recompute the tide there, so the night-arc and the sky can
    // be inspected across 0→1 without waiting out real time. Keeps `nt` as-is so
    // the oscillation phase is preserved.
    debugSetPhase(p) {
      phase = clamp01(p);
      this.update(0);
      return { phase, tide };
    },
  };
}
