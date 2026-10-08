'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

type Three = typeof import('three');

interface Palette {
  base: string;
  a: string;
  b: string;
  c: string;
  dot: string;
  dotOpacity: number;
  intensity: number;
}

const PALETTES: Record<'light' | 'dark', Palette> = {
  light: {
    base: '#f5f7fb',
    a: '#c4d5ff',
    b: '#ddd3ff',
    c: '#b9e6fe',
    dot: '#2563eb',
    dotOpacity: 0.32,
    intensity: 1,
  },
  dark: {
    base: '#060912',
    a: '#1d3a8f',
    b: '#3a1d7a',
    c: '#0b4a6f',
    dot: '#93c5fd',
    dotOpacity: 0.6,
    intensity: 0.9,
  },
};

const VERTEX_BG = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Domain-warped simplex noise: soft, slowly flowing bands of colour.
const FRAGMENT_BG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uMouse;
  uniform vec2 uRes;
  uniform vec3 uBase;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  uniform float uIntensity;

  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  float noise(vec2 p) {
    const float K1 = 0.366025404;
    const float K2 = 0.211324865;
    vec2 i = floor(p + (p.x + p.y) * K1);
    vec2 a = p - i + (i.x + i.y) * K2;
    float m = step(a.y, a.x);
    vec2 o = vec2(m, 1.0 - m);
    vec2 b = a - o + K2;
    vec2 c = a - 1.0 + 2.0 * K2;
    vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
    vec3 n = h * h * h * h * vec3(dot(a, hash(i)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
    return dot(n, vec3(70.0));
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      v += amp * noise(p);
      p *= 2.0;
      amp *= 0.5;
    }
    return v;
  }
  void main() {
    vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    float t = uTime * 0.045;
    vec2 m = (uMouse - 0.5) * 0.3;

    vec2 q = vec2(fbm(p * 1.1 + t), fbm(p * 1.1 - t + 3.1));
    vec2 r = vec2(
      fbm(p * 1.5 + q * 1.6 + m + vec2(1.7, 9.2) + t * 0.7),
      fbm(p * 1.5 + q * 1.6 - m + vec2(8.3, 2.8) - t * 0.6)
    );
    float f = fbm(p * 1.3 + r * 1.7);

    vec3 col = uBase;
    col = mix(col, uA, smoothstep(-0.25, 0.85, r.x) * uIntensity);
    col = mix(col, uB, smoothstep(-0.1, 0.95, r.y) * 0.75 * uIntensity);
    col = mix(col, uC, smoothstep(0.15, 1.0, f) * 0.6 * uIntensity);

    float vignette = smoothstep(1.25, 0.15, length(p * vec2(0.75, 1.0)));
    col = mix(uBase, col, 0.5 + 0.5 * vignette);

    float grain = fract(sin(dot(vUv * uRes, vec2(12.9898, 78.233)) + uTime) * 43758.5453);
    col += (grain - 0.5) * 0.012;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const VERTEX_DOTS = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vFade;
  void main() {
    vec3 pos = position;
    pos.y += sin(uTime * 0.25 + aPhase) * 0.35;
    pos.x += cos(uTime * 0.18 + aPhase * 1.3) * 0.25;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixelRatio * (9.0 / -mv.z);
    vFade = smoothstep(-16.0, -6.0, mv.z);
  }
`;

const FRAGMENT_DOTS = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying float vFade;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float alpha = smoothstep(0.5, 0.0, d) * uOpacity * vFade;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

function currentTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function mountScene(THREE: Three, host: HTMLDivElement): () => void {
  let renderer: InstanceType<Three['WebGLRenderer']>;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: false,
      powerPreference: 'low-power',
    });
  } catch {
    return () => {}; // No WebGL: the CSS backdrop stays.
  }

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 10;

  const palette = PALETTES[currentTheme()];
  const colors = {
    base: new THREE.Color(palette.base),
    a: new THREE.Color(palette.a),
    b: new THREE.Color(palette.b),
    c: new THREE.Color(palette.c),
    dot: new THREE.Color(palette.dot),
  };

  const bgUniforms = {
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uRes: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uBase: { value: colors.base },
    uA: { value: colors.a },
    uB: { value: colors.b },
    uC: { value: colors.c },
    uIntensity: { value: palette.intensity },
  };
  const bgGeometry = new THREE.PlaneGeometry(2, 2);
  const bgMaterial = new THREE.ShaderMaterial({
    vertexShader: VERTEX_BG,
    fragmentShader: FRAGMENT_BG,
    uniforms: bgUniforms,
    depthTest: false,
    depthWrite: false,
  });
  const bg = new THREE.Mesh(bgGeometry, bgMaterial);
  bg.frustumCulled = false;
  bg.renderOrder = -1;
  scene.add(bg);

  const COUNT = 900;
  const positions = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const phases = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 30;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 18;
    positions[i * 3 + 2] = -Math.random() * 10 + 2;
    sizes[i] = 2 + Math.random() * 6;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const dotGeometry = new THREE.BufferGeometry();
  dotGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  dotGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  dotGeometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const dotUniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: pixelRatio },
    uColor: { value: colors.dot },
    uOpacity: { value: palette.dotOpacity },
  };
  const dotMaterial = new THREE.ShaderMaterial({
    vertexShader: VERTEX_DOTS,
    fragmentShader: FRAGMENT_DOTS,
    uniforms: dotUniforms,
    transparent: true,
    depthWrite: false,
    blending: currentTheme() === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const dots = new THREE.Points(dotGeometry, dotMaterial);
  scene.add(dots);

  // Pointer parallax, eased each frame.
  const pointer = { x: 0.5, y: 0.5 };
  const eased = { x: 0.5, y: 0.5 };
  const onPointer = (e: PointerEvent) => {
    pointer.x = e.clientX / window.innerWidth;
    pointer.y = 1 - e.clientY / window.innerHeight;
  };
  window.addEventListener('pointermove', onPointer, { passive: true });

  const onResize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    bgUniforms.uRes.value.set(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  // Cross-fade colours when the theme toggles.
  const applyTheme = () => {
    const theme = currentTheme();
    const next = PALETTES[theme];
    for (const key of ['base', 'a', 'b', 'c', 'dot'] as const) {
      const target = new THREE.Color(next[key]);
      gsap.to(colors[key], {
        r: target.r,
        g: target.g,
        b: target.b,
        duration: 0.8,
        ease: 'power2.out',
      });
    }
    gsap.to(dotUniforms.uOpacity, { value: next.dotOpacity, duration: 0.8 });
    gsap.to(bgUniforms.uIntensity, { value: next.intensity, duration: 0.8 });
    dotMaterial.blending = theme === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending;
    dotMaterial.needsUpdate = true;
  };
  const observer = new MutationObserver(applyTheme);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  const clock = new THREE.Clock();
  let frame = 0;
  const render = () => {
    frame = requestAnimationFrame(render);
    if (document.hidden) return;
    const t = clock.getElapsedTime();
    eased.x += (pointer.x - eased.x) * 0.04;
    eased.y += (pointer.y - eased.y) * 0.04;
    bgUniforms.uTime.value = t;
    bgUniforms.uMouse.value.set(eased.x, eased.y);
    dotUniforms.uTime.value = t;
    dots.rotation.y = (eased.x - 0.5) * 0.25;
    dots.rotation.x = (eased.y - 0.5) * -0.12;
    renderer.render(scene, camera);
  };
  render();
  gsap.to(host, { opacity: 1, duration: 1.8, ease: 'power2.out' });

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', onPointer);
    window.removeEventListener('resize', onResize);
    observer.disconnect();
    gsap.killTweensOf([colors.base, colors.a, colors.b, colors.c, colors.dot, host]);
    bgGeometry.dispose();
    bgMaterial.dispose();
    dotGeometry.dispose();
    dotMaterial.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

/**
 * Full-screen backdrop. Everyone gets the CSS gradient; capable desktops (≥1024px, no reduced
 * motion, more than two CPU cores) also get a WebGL scene, loaded on demand so three.js never
 * reaches phones.
 */
export function AuroraBackground() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const capable = window.matchMedia(
      '(min-width: 1024px) and (prefers-reduced-motion: no-preference)',
    ).matches;
    if (!capable || (navigator.hardwareConcurrency ?? 4) <= 2) return;

    let disposed = false;
    let cleanup = () => {};
    import('three').then((THREE) => {
      if (!disposed) cleanup = mountScene(THREE, host);
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="guest-backdrop absolute inset-0" />
      <div ref={hostRef} className="absolute inset-0 opacity-0" />
    </div>
  );
}
