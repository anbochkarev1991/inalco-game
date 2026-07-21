import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Final grade: film grain, Bayer dither, vignette, chromatic aberration,
// visual static (tied to the radio), glitch tears, flash/damage overlays.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGrain: { value: 0.034 },
    uStatic: { value: 0 },
    uGlitch: { value: 0 },
    uFlash: { value: 0 },
    uDamage: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uStatic, uGlitch, uFlash, uDamage;
    uniform vec2 uRes;
    varying vec2 vUv;

    float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }

    // 4x4 ordered Bayer, computed branchlessly (no loop / no branch / no array).
    // Reproduces the exact matrix the old table indexed:
    //    0  8  2 10
    //   12  4 14  6      via the recursive construction
    //    3 11  1  9        D2(x,y) = 2*(x^y) + y   (x,y in {0,1})
    //   15  7 13  5        D4 = 4*D2(xlo,ylo) + D2(xhi,yhi)
    //                        = 8*(xlo^ylo) + 4*ylo + 2*(xhi^yhi) + yhi
    // XOR of two 1-bit values is (a+b) mod 2. Everything stays in ints (values
    // 0..15, exact), so float(d)/16.0 is byte-identical to the old m[i]/16.0
    // lookup — verified over all 16 cells and real gl_FragCoord coords.
    float bayer(vec2 pix){
      int x = int(mod(pix.x, 4.0)), y = int(mod(pix.y, 4.0));
      int xlo = x - (x / 2) * 2, ylo = y - (y / 2) * 2;
      int xhi = x / 2,           yhi = y / 2;
      int exy = (xlo + ylo) - ((xlo + ylo) / 2) * 2;
      int exh = (xhi + yhi) - ((xhi + yhi) / 2) * 2;
      int d = 8 * exy + 4 * ylo + 2 * exh + yhi;
      return float(d) / 16.0;
    }

    void main(){
      vec2 uv = vUv;
      float t = uTime;

      // glitch: horizontal tears
      float tear = step(1.0 - uGlitch*0.16, hash(vec2(floor(uv.y*36.0), floor(t*24.0))));
      uv.x += tear * (hash(vec2(floor(t*24.0), floor(uv.y*36.0))) - 0.5) * 0.12 * uGlitch;

      // chromatic aberration, stronger at edges + with glitch
      vec2 c = uv - 0.5;
      float caAmt = 0.0009 + uGlitch*0.006 + uDamage*0.004;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c*caAmt).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c*caAmt).b;

      // grade: cold filmic
      col = pow(max(col, 0.0), vec3(1.05));
      col *= vec3(0.965, 1.0, 1.045);
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(lum), 0.10);
      col += vec3(0.012, 0.02, 0.028) * (1.0 - lum);   // teal lift in shadows

      // film grain
      float g = hash(uv*uRes*0.6 + fract(t*13.7)*vec2(31.7, 17.3));
      col += (g - 0.5) * uGrain * (1.2 - lum*0.7);

      // visual radio static
      if(uStatic > 0.003){
        float s = hash(floor(uv*uRes*0.5) + floor(t*60.0));
        float rows = step(0.994 - uStatic*0.11, hash(vec2(floor(uv.y*uRes.y*0.5), floor(t*60.0))));
        col = mix(col, vec3(s), uStatic*0.36*max(s*0.7, rows));
      }

      // Bayer dither (kills banding in the fog)
      col += (bayer(gl_FragCoord.xy) - 0.5) / 150.0;

      // vignette
      float v = smoothstep(0.92, 0.28, length(c)*1.18);
      col *= mix(0.64, 1.0, v);

      // damage: red bleeding at edges
      float edge = smoothstep(0.32, 0.78, length(c));
      col = mix(col, vec3(0.42, 0.04, 0.03), edge * uDamage * 0.85);

      // flash to white
      col = mix(col, vec3(1.0, 0.99, 0.94), clamp(uFlash, 0.0, 1.0));

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createPostFX(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const size = renderer.getSize(new THREE.Vector2());
  // bloom is reserved for true emitters (moon, bulbs, the flash) — flashlit
  // props must never sparkle
  const bloom = new UnrealBloomPass(size.clone(), 0.16, 0.4, 0.96);
  composer.addPass(bloom);

  composer.addPass(new OutputPass());

  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uRes.value.copy(size);
  composer.addPass(grade);

  const fx = { staticVis: 0, glitch: 0, flash: 0, damage: 0 };

  // adaptive-quality bloom lever (LE-1). Defaults leave bloom exactly as built
  // (enabled, full internal resolution) — parity with today. `_size` tracks the
  // live composer size so a later setBloom can re-scale relative to it.
  const _size = size.clone();
  let _bloomRes = 1.0;

  return {
    composer,
    fx,
    setSize(w, h) {
      _size.set(w, h);
      composer.setSize(w, h);      // resets every pass (incl. bloom) to full size
      grade.uniforms.uRes.value.set(w, h);
      // re-apply a sub-full bloom resolution that composer.setSize just cleared
      if (_bloomRes !== 1.0) {
        bloom.setSize(Math.max(1, Math.round(w * _bloomRes)), Math.max(1, Math.round(h * _bloomRes)));
      }
    },
    // LE-1 lever: toggle whether UnrealBloom participates (EffectComposer skips a
    // disabled pass — no remove/re-add, no scene-material recompile) and set its
    // internal render resolution. resScale 1.0 = full (today); 0.5 = half res.
    setBloom(enabled, resScale = 1.0) {
      bloom.enabled = enabled !== false;
      _bloomRes = resScale > 0 ? resScale : 1.0;
      // resize the bloom's own render targets; leaves scene materials untouched
      bloom.setSize(Math.max(1, Math.round(_size.x * _bloomRes)), Math.max(1, Math.round(_size.y * _bloomRes)));
    },
    render(dt, time) {
      // decay transient effects
      fx.flash = Math.max(0, fx.flash - dt * 2.6);
      fx.damage = Math.max(0, fx.damage - dt * 0.55);
      fx.glitch = Math.max(0, fx.glitch - dt * 1.8);
      grade.uniforms.uTime.value = time;
      grade.uniforms.uStatic.value = fx.staticVis;
      grade.uniforms.uGlitch.value = fx.glitch;
      grade.uniforms.uFlash.value = fx.flash;
      grade.uniforms.uDamage.value = fx.damage;
      composer.render(dt);
    },
  };
}
