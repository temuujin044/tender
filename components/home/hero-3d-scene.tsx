"use client";

import { Canvas } from "@react-three/fiber";
import { Environment, Float, Sphere, MeshDistortMaterial, ContactShadows, Stars } from "@react-three/drei";
import { Suspense } from "react";

export function Hero3DScene() {
  return (
    <div className="absolute inset-0 z-0 bg-[#070b14]">
      <Canvas camera={{ position: [0, 0, 8], fov: 45 }}>
        <color attach="background" args={["#070b14"]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={2} color="#ffffff" />
        <spotLight position={[-10, -10, -5]} intensity={1} color="#d28a45" />

        <Suspense fallback={null}>
          <Stars radius={100} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
          <Float speed={2} rotationIntensity={1.5} floatIntensity={2}>
            <Sphere args={[1.5, 64, 64]} position={[2.5, 0.5, 0]}>
              <MeshDistortMaterial
                color="#d28a45"
                attach="material"
                distort={0.4}
                speed={1.5}
                roughness={0.1}
                metalness={0.9}
                clearcoat={1}
                clearcoatRoughness={0.1}
              />
            </Sphere>
          </Float>

          <Float speed={1.2} rotationIntensity={2} floatIntensity={1.5}>
            <Sphere args={[1, 64, 64]} position={[-2.5, -1, 1]}>
              <MeshDistortMaterial
                color="#e2e8f0"
                attach="material"
                distort={0.2}
                speed={2.5}
                roughness={0.2}
                metalness={1}
                clearcoat={1}
              />
            </Sphere>
          </Float>

          <Float speed={1.8} rotationIntensity={1} floatIntensity={1}>
            <Sphere args={[0.5, 32, 32]} position={[0, 2, -1]}>
              <MeshDistortMaterial
                color="#5eead4"
                attach="material"
                distort={0.3}
                speed={2}
                roughness={0.2}
                metalness={0.8}
              />
            </Sphere>
          </Float>

          <Environment preset="city" />
          <ContactShadows position={[0, -3, 0]} opacity={0.4} scale={20} blur={2} far={4} />
        </Suspense>
      </Canvas>
    </div>
  );
}
