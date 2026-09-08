'use client';

import { Canvas } from '@react-three/fiber';
import { Environment, Float, Sphere, MeshDistortMaterial, ContactShadows } from '@react-three/drei';
import { Suspense } from 'react';

export function Hero3DScene() {
  return (
    <div className="pointer-events-none absolute inset-y-6 right-[-12%] z-0 w-[72%] max-lg:inset-x-0 max-lg:bottom-[-14rem] max-lg:top-auto max-lg:h-[30rem] max-lg:w-full">
      <div className="absolute left-1/2 top-1/2 h-[78%] w-[76%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(251,146,60,0.25)_0%,rgba(254,215,170,0.18)_44%,transparent_72%)] blur-2xl" />
      <div className="absolute left-1/2 top-1/2 h-[68%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-orange-200/60 bg-white/20 shadow-[0_45px_100px_-55px_rgba(194,65,12,0.65)] backdrop-blur-[2px]" />
      <Canvas camera={{ position: [0, 0, 8], fov: 42 }} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={1.35} />
        <directionalLight position={[8, 10, 8]} intensity={3.2} color="#fff7ed" />
        <spotLight position={[-8, 2, 7]} intensity={2.2} color="#fb923c" />
        <pointLight position={[4, -3, 5]} intensity={1.8} color="#f97316" />

        <Suspense fallback={null}>
          <Float speed={1.7} rotationIntensity={1.15} floatIntensity={1.5}>
            <Sphere args={[1.65, 96, 96]} position={[0.65, 0.25, 0]} castShadow>
              <MeshDistortMaterial
                color="#f97316"
                attach="material"
                distort={0.34}
                speed={1.35}
                roughness={0.08}
                metalness={0.62}
                clearcoat={1}
                clearcoatRoughness={0.06}
              />
            </Sphere>
          </Float>

          <Float speed={1.15} rotationIntensity={1.7} floatIntensity={1.25}>
            <Sphere args={[0.92, 72, 72]} position={[-1.7, -1.35, 1.15]} castShadow>
              <MeshDistortMaterial
                color="#94a3b8"
                attach="material"
                distort={0.22}
                speed={2.1}
                roughness={0.12}
                metalness={0.78}
                clearcoat={1}
              />
            </Sphere>
          </Float>

          <Float speed={1.9} rotationIntensity={1} floatIntensity={1.25}>
            <Sphere args={[0.58, 48, 48]} position={[-1.25, 2.05, 0.2]} castShadow>
              <MeshDistortMaterial
                color="#14b8a6"
                attach="material"
                distort={0.28}
                speed={2}
                roughness={0.12}
                metalness={0.42}
                clearcoat={0.8}
              />
            </Sphere>
          </Float>

          <Environment preset="city" />
          <ContactShadows
            position={[0, -3, 0]}
            opacity={0.32}
            scale={16}
            blur={2.5}
            far={5}
            color="#9a3412"
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
