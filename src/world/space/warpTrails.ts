import * as THREE from 'three';
import { mulberry32 } from '../../core/random';

/** Streaks travel aft along the ship, so every window sees the same flow. */
export class WarpTrails {
  readonly lines: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>;

  constructor() {
    const random = mulberry32(261120);
    const positions = [];
    const tips = [];
    const colors = [];
    for (let i = 0; i < 820; i++) {
      const angle = random() * Math.PI * 2;
      const radius = 28 + 200 * random();
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const z = random() * 800;
      const color = new THREE.Color().setHSL(0.53 + 0.14 * random(), 0.5, 0.62 + 0.24 * random());
      const length = 10 + random() * 37;
      positions.push(x, y, z, x, y, z);
      tips.push(0, length);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aTip', new THREE.Float32BufferAttribute(tips, 1));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.ShaderMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: { uDistance: { value: 0 }, uDrive: { value: 0 } },
      vertexShader: `
        uniform float uDistance, uDrive;
        attribute float aTip;
        varying vec3 vLight;
        void main() {
          float z = mod(position.z + uDistance, 800.0) - 400.0;
          float fade = 1.0 - smoothstep(335.0, 400.0, abs(z));
          vLight = color * mix(0.04, 1.85, step(1.0, aTip)) * uDrive * fade;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, z + aTip * uDrive, 1.0);
        }`,
      fragmentShader: `
        varying vec3 vLight;
        void main() { gl_FragColor = vec4(vLight, 1.0); }`,
    });
    this.lines = new THREE.LineSegments(geometry, material);
    this.lines.frustumCulled = false;
    this.lines.visible = false;
  }

  update(dt: number, drive: number): void {
    this.lines.visible = drive > 0;
    const uniforms = this.lines.material.uniforms;
    uniforms.uDrive!.value = drive;
    uniforms.uDistance!.value = (uniforms.uDistance!.value + dt * drive * 230) % 800;
  }

  dispose(): void {
    this.lines.geometry.dispose();
    this.lines.material.dispose();
  }
}
