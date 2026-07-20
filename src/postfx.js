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

    float bayer(vec2 pix){
      int x = int(mod(pix.x, 4.0)), y = int(mod(pix.y, 4.0));
      int i = y * 4 + x;
      float m[16];
      m[0]=0.0;  m[1]=8.0;  m[2]=2.0;  m[3]=10.0;
      m[4]=12.0; m[5]=4.0;  m[6]=14.0; m[7]=6.0;
      m[8]=3.0;  m[9]=11.0; m[10]=1.0; m[11]=9.0;
      m[12]=15.0;m[13]=7.0; m[14]=13.0;m[15]=5.0;
      for(int k=0;k<16;k++){ if(k==i) return m[k]/16.0; }
      return 0.0;
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

  return {
    composer,
    fx,
    setSize(w, h) {
      composer.setSize(w, h);
      grade.uniforms.uRes.value.set(w, h);
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
