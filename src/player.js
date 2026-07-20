import * as THREE from 'three';
import { TUNE } from './config.js';
import { beamTex } from './world.js';

export class Player {
  constructor(camera, scene, colliders, ground, audio) {
    this.camera = camera;
    this.colliders = colliders;
    this.ground = ground;
    this.audio = audio;

    this.pos = new THREE.Vector3(0, 0, 77.5);     // end of the jetty
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;                            // facing the shore... wait, shore is -z from the dock
    this.pitch = 0;
    this.bobPhase = 0;
    this.bobAmp = 0;
    this.stamina = TUNE.staminaMax;
    this.exhausted = false;
    this.composure = TUNE.composureMax;
    this.maxBonus = 0;          // quest rewards raise the ceiling
    this.regenBonus = 1;
    this.iframes = 0;
    this.surface = 'wood';
    this.frozen = true;          // no control during intro/cutscenes
    this.dead = false;
    // optional floor override: fn(x,z,curY)->y|null. Lets a room sit below the
    // walkable terrain (the cellar) without a second heightfield.
    this.floorOverride = null;

    this.flashOn = false;
    this.flashCharge = 1;
    this.flashBurstT = 0;

    // flashlight rig (lags behind the view for weight)
    // decay 2 = physical falloff: a strong pool up close that the fog swallows
    // by ~18m instead of a searchlight reaching the treeline
    this.lightYaw = this.yaw; this.lightPitch = 0;
    this.spot = new THREE.SpotLight(0xfff2dc, 0, 23, 0.5, 0.62, 2.0);
    this.spot.castShadow = true;
    this.spot.shadow.mapSize.set(1024, 1024);
    this.spot.shadow.camera.near = 0.4;
    this.spot.shadow.camera.far = 23;
    this.spot.shadow.bias = -0.004;
    this.spotTarget = new THREE.Object3D();
    scene.add(this.spot, this.spotTarget);
    this.spot.target = this.spotTarget;

    // visible beam: fog scattering faked with an additive gradient cone.
    // BackSide = only the far interior wall renders → one soft layer, no tube.
    const beamGeo = new THREE.ConeGeometry(1.6, 9.5, 20, 6, true);
    beamGeo.translate(0, -4.75, 0);           // apex at the lamp
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
      map: beamTex(), transparent: true, opacity: 0.11,
      blending: THREE.AdditiveBlending, depthWrite: false,
      side: THREE.BackSide, fog: false,
    }));
    this.beam.renderOrder = 40;
    this.beam.visible = false;
    scene.add(this.beam);
    this._beamDown = new THREE.Vector3(0, -1, 0);

    // tiny warm hand glow so the flashlight body zone isn't pure void
    this.handGlow = new THREE.PointLight(0xffd9b0, 0, 2.6, 2);
    scene.add(this.handGlow);

    // camera-flash burst
    this.burst = new THREE.PointLight(0xffffff, 0, 26, 1.2);
    scene.add(this.burst);

    this._camEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  look(dx, dy) {
    if (this.frozen || this.dead) return;
    this.yaw -= dx * 0.0023;
    this.pitch -= dy * 0.0023;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  // ---- checkpoint save/restore ----
  serialize() {
    return {
      x: this.pos.x, y: this.pos.y, z: this.pos.z, yaw: this.yaw, pitch: this.pitch,
      composure: this.composure, stamina: this.stamina,
      maxBonus: this.maxBonus, regenBonus: this.regenBonus,
      flashOn: this.flashOn, flashCharge: this.flashCharge,
    };
  }
  restore(d) {
    if (!d) return;
    if (typeof d.x === 'number') this.pos.set(d.x, d.y ?? this.pos.y, d.z ?? this.pos.z);
    this.vel.set(0, 0, 0);
    if (typeof d.yaw === 'number') this.yaw = d.yaw;
    if (typeof d.pitch === 'number') this.pitch = Math.max(-1.45, Math.min(1.45, d.pitch));
    this.lightYaw = this.yaw; this.lightPitch = this.pitch;
    if (typeof d.composure === 'number') this.composure = d.composure;
    if (typeof d.stamina === 'number') this.stamina = d.stamina;
    if (typeof d.maxBonus === 'number') this.maxBonus = d.maxBonus;
    if (typeof d.regenBonus === 'number') this.regenBonus = d.regenBonus;
    if (typeof d.flashOn === 'boolean') this.flashOn = d.flashOn;
    if (typeof d.flashCharge === 'number') this.flashCharge = d.flashCharge;
  }

  camDir(out = new THREE.Vector3()) {
    return out.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
  }

  toggleFlashlight() {
    if (this.dead) return;
    this.flashOn = !this.flashOn;
    this.audio.switchClick();
  }

  tryFlash() {
    if (this.flashCharge < 1 || this.dead || this.frozen) return false;
    this.flashCharge = 0;
    this.flashBurstT = 1;
    this.audio.flash();
    return true;
  }

  hit(dmg, fromPos) {
    if (this.iframes > 0 || this.dead) return false;
    this.composure -= dmg;
    this.iframes = 1.5;
    this._regenWait = TUNE.regenDelay;
    const push = new THREE.Vector3(this.pos.x - fromPos.x, 0, this.pos.z - fromPos.z).normalize().multiplyScalar(6.5);
    this.vel.add(push);
    this.audio.hitSting();
    return true;
  }

  fearDrain(dt, amount) {
    if (this.dead) return;
    this.composure -= amount * dt;
    this._regenWait = TUNE.regenDelay;
  }

  update(dt, input) {
    const T = TUNE;
    const maxComposure = T.composureMax + this.maxBonus;
    this.iframes = Math.max(0, this.iframes - dt);
    this._regenWait = Math.max(0, (this._regenWait ?? 0) - dt);
    if (this._regenWait <= 0 && !this.dead) {
      this.composure = Math.min(maxComposure, this.composure + T.regenRate * this.regenBonus * dt);
    }
    this.composure = Math.max(0, Math.min(maxComposure, this.composure));

    // flash recharge
    const wasCharged = this.flashCharge >= 1;
    this.flashCharge = Math.min(1, this.flashCharge + dt / T.flashRecharge);
    if (!wasCharged && this.flashCharge >= 1) this.audio.rechargeDone();
    this.flashBurstT = Math.max(0, this.flashBurstT - dt * 5);

    // ---- movement
    let mx = 0, mz = 0;
    if (!this.frozen && !this.dead) {
      if (input.f) mz -= 1;
      if (input.b) mz += 1;
      if (input.l) mx -= 1;
      if (input.r) mx += 1;
    }
    const moving = (mx !== 0 || mz !== 0);
    let wantRun = input.run && moving && mz < 0.5;
    if (this.exhausted) wantRun = false;
    if (wantRun) {
      this.stamina -= dt;
      if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; }
    } else {
      this.stamina = Math.min(T.staminaMax, this.stamina + dt * 0.75);
      if (this.exhausted && this.stamina > T.staminaMax * 0.35) this.exhausted = false;
    }
    const speed = wantRun ? T.runSpeed : T.walkSpeed;

    if (moving) {
      const inv = 1 / Math.hypot(mx, mz);
      mx *= inv; mz *= inv;
      // camera basis: forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const wx = mx * cos + mz * sin;
      const wz = mz * cos - mx * sin;
      this.vel.x += wx * speed * 11 * dt;
      this.vel.z += wz * speed * 11 * dt;
    }
    // friction + clamp
    const fr = Math.max(0, 1 - 9.5 * dt);
    this.vel.x *= fr; this.vel.z *= fr;
    const vl = Math.hypot(this.vel.x, this.vel.z);
    const vMax = speed * 1.25;
    if (vl > vMax) { this.vel.x *= vMax / vl; this.vel.z *= vMax / vl; }

    // integrate with water rejection
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    if (this.ground(nx, nz) < -0.18) {
      if (this.ground(nx, this.pos.z) >= -0.18) nz = this.pos.z;
      else if (this.ground(this.pos.x, nz) >= -0.18) nx = this.pos.x;
      else { nx = this.pos.x; nz = this.pos.z; }
    }
    // pass the body's vertical extent (feet..head) so house colliders one storey
    // up don't block us when we're down in the cellar
    const solved = this.colliders.resolve(nx, nz, 0.38, this.pos.y, this.pos.y + 1.7);
    this.pos.x = solved.x; this.pos.z = solved.z;
    const oy = this.floorOverride ? this.floorOverride(this.pos.x, this.pos.z, this.pos.y) : null;
    const gy = oy != null ? oy : this.ground(this.pos.x, this.pos.z);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 11);

    // ---- head bob + footsteps
    const speedNow = Math.hypot(this.vel.x, this.vel.z);
    const targetAmp = Math.min(1, speedNow / T.runSpeed);
    this.bobAmp += (targetAmp - this.bobAmp) * Math.min(1, dt * 6);
    const prevPhase = this.bobPhase;
    this.bobPhase += speedNow * dt * 1.55;
    if (Math.floor(prevPhase / Math.PI) !== Math.floor(this.bobPhase / Math.PI) && speedNow > 0.6) {
      this.audio.footstep(this.surface);
    }
    const bobY = Math.sin(this.bobPhase * 2) * 0.042 * this.bobAmp;
    const bobX = Math.cos(this.bobPhase) * 0.03 * this.bobAmp;

    // low-composure sway
    const fear = 1 - this.composure / T.composureMax;
    const swayR = Math.sin(this.bobPhase * 0.7) * 0.004 + fear * Math.sin(performance.now() * 0.0021) * 0.012;

    // ---- camera
    const eye = this.pos.y + T.eyeHeight + bobY;
    this._camEuler.set(this.pitch, this.yaw, swayR + bobX * 0.14);
    this.camera.quaternion.setFromEuler(this._camEuler);
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.camera.position.set(this.pos.x + bobX * 0.32 * right.x, eye, this.pos.z + bobX * 0.32 * right.z);

    // ---- flashlight follows with lag
    const lagRate = Math.min(1, dt * 8.5);
    let dyaw = this.yaw - this.lightYaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    this.lightYaw += dyaw * lagRate;
    this.lightPitch += (this.pitch - this.lightPitch) * lagRate;
    const ld = new THREE.Vector3(
      -Math.sin(this.lightYaw) * Math.cos(this.lightPitch),
      Math.sin(this.lightPitch),
      -Math.cos(this.lightYaw) * Math.cos(this.lightPitch)
    );
    this.spot.position.set(
      this.camera.position.x + right.x * 0.22,
      eye - 0.18,
      this.camera.position.z + right.z * 0.22
    );
    this.spotTarget.position.copy(this.spot.position).addScaledVector(ld, 12);
    this.spot.intensity = this.flashOn ? 115 : 0;
    this.handGlow.position.copy(this.spot.position);
    this.handGlow.intensity = this.flashOn ? 1.3 : 0;

    // the visible cone follows the lamp
    this.beam.visible = this.flashOn;
    if (this.flashOn) {
      this.beam.position.copy(this.spot.position);
      this.beam.quaternion.setFromUnitVectors(this._beamDown, ld);
      this.beam.material.opacity = 0.082 + Math.sin(performance.now() * 0.0021) * 0.012;
    }

    // camera-flash burst light
    this.burst.position.copy(this.camera.position);
    this.burst.intensity = this.flashBurstT > 0 ? 58 * this.flashBurstT : 0;
  }
}
