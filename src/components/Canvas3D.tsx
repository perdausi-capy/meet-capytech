'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function Canvas3D() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    camera.position.set(0, -6, 12);
    camera.lookAt(0, 2, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // 2. Animated Plane Geometry (Displacement Wave Mesh)
    const planeGeo = new THREE.PlaneGeometry(36, 24, 48, 32);
    const posAttr = planeGeo.getAttribute('position') as THREE.BufferAttribute | undefined;
    const attrCount = posAttr ? posAttr.count : 0;
    const initialZ = new Float32Array(attrCount);

    if (posAttr) {
      for (let i = 0; i < attrCount; i++) {
        initialZ[i] = (Math.random() - 0.5) * 0.4;
      }
    }

    const isDark = () => document.documentElement.classList.contains('dark');

    const getThemeColors = () => {
      const dark = isDark();
      return {
        meshColor: dark ? 0x2563eb : 0xdbeafe,
        wireframeColor: dark ? 0x1d4ed8 : 0x93c5fd,
        particleColor: dark ? 0x60a5fa : 0x2563eb,
      };
    };

    const colors = getThemeColors();

    const planeMat = new THREE.MeshBasicMaterial({
      color: colors.wireframeColor,
      wireframe: true,
      transparent: true,
      opacity: isDark() ? 0.25 : 0.4,
    });

    const planeMesh = new THREE.Mesh(planeGeo, planeMat);
    planeMesh.rotation.x = -Math.PI / 2.8;
    scene.add(planeMesh);

    // 3. Ambient Particle Point Cloud Grid
    const particleCount = 200;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      particlePositions[i] = (Math.random() - 0.5) * 32;
      particlePositions[i + 1] = (Math.random() - 0.5) * 20;
      particlePositions[i + 2] = (Math.random() - 0.5) * 10;
    }

    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: colors.particleColor,
      size: 0.12,
      transparent: true,
      opacity: 0.6,
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // 4. Subtle Cursor Parallax Response
    const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
    const onMouseMove = (e: MouseEvent) => {
      mouse.targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.targetY = -(e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMouseMove);

    // 5. Theme Observer
    const observer = new MutationObserver(() => {
      const c = getThemeColors();
      planeMat.color.setHex(c.wireframeColor);
      planeMat.opacity = isDark() ? 0.25 : 0.4;
      particleMat.color.setHex(c.particleColor);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    // 6. Resize Listener
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // 7. Animation Loop using performance.now() (eliminates THREE.Clock warning)
    let animationFrameId: number;
    const startTime = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      const elapsedTime = (performance.now() - startTime) / 1000;

      // Smooth mouse interpolation
      mouse.x += (mouse.targetX - mouse.x) * 0.05;
      mouse.y += (mouse.targetY - mouse.y) * 0.05;

      camera.position.x = mouse.x * 1.5;
      camera.position.y = -6 + mouse.y * 1.0;
      camera.lookAt(0, 2, 0);

      // Animate Wave Plane Displacement
      const positions = planeGeo.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (positions) {
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i);
          const y = positions.getY(i);
          const offsetZ = initialZ[i] ?? 0;

          // Sine wave ripple calculation
          const z =
            Math.sin(x * 0.35 + elapsedTime * 1.2) * 0.45 +
            Math.cos(y * 0.4 + elapsedTime * 1.0) * 0.35 +
            offsetZ;

          positions.setZ(i, z);
        }
        positions.needsUpdate = true;
      }

      // Slow particle rotation
      particles.rotation.y = elapsedTime * 0.03;
      particles.rotation.z = elapsedTime * 0.015;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      observer.disconnect();

      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      planeGeo.dispose();
      planeMat.dispose();
      particleGeo.dispose();
      particleMat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none opacity-80"
    />
  );
}
