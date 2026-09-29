import { useEffect } from 'react';
import * as THREE from 'three';
import { Aquarium3D } from '@/components/Aquarium3D/Aquarium';
import { SpeciesToolbar } from '@/components/UI/SpeciesToolbar';
import { EcosystemStats } from '@/components/UI/EcosystemStats';
import { FoodWebPanel } from '@/components/UI/FoodWebPanel';
import { SpeciesInfoCard } from '@/components/UI/SpeciesInfoCard';
import { ControlButtons } from '@/components/UI/ControlButtons';
import { EvolutionChart } from '@/components/UI/EvolutionChart';
import { useEcosystemSimulation } from '@/hooks/useEcosystemSimulation';
import { useEcosystemStore, AQUARIUM_BOUNDS } from '@/store/useEcosystemStore';

export function MainPage() {
  useEcosystemSimulation();

  const selectedSpeciesId = useEcosystemStore((s) => s.selectedSpeciesId);
  const addOrganism = useEcosystemStore((s) => s.addOrganism);
  const setSelectedSpecies = useEcosystemStore((s) => s.setSelectedSpecies);

  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      canvas.style.cursor = selectedSpeciesId ? 'crosshair' : 'grab';
      canvas.style.cursor = selectedSpeciesId ? 'crosshair' : '-webkit-grab';
    }
    return () => {
      if (canvas) {
        canvas.style.cursor = 'default';
      }
    };
  }, [selectedSpeciesId]);

  const handleAquariumClick = (point: THREE.Vector3) => {
    if (!selectedSpeciesId) return;

    const clampedPoint = new THREE.Vector3(
      THREE.MathUtils.clamp(point.x, AQUARIUM_BOUNDS.minX + 0.3, AQUARIUM_BOUNDS.maxX - 0.3),
      THREE.MathUtils.clamp(point.y, AQUARIUM_BOUNDS.minY + 0.2, AQUARIUM_BOUNDS.maxY - 0.2),
      THREE.MathUtils.clamp(point.z, AQUARIUM_BOUNDS.minZ + 0.3, AQUARIUM_BOUNDS.maxZ - 0.3),
    );

    addOrganism(selectedSpeciesId, clampedPoint);
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gradient-to-b from-[#0A1628] via-[#0d1f3d] to-[#1E3A5F]">
      <div className="absolute inset-0 opacity-30">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              radial-gradient(circle at 20% 30%, rgba(34, 211, 238, 0.15) 0%, transparent 50%),
              radial-gradient(circle at 80% 70%, rgba(74, 222, 128, 0.1) 0%, transparent 50%),
              radial-gradient(circle at 50% 50%, rgba(244, 114, 182, 0.08) 0%, transparent 60%)
            `,
          }}
        />
      </div>

      <div className="relative w-full h-full">
        <Aquarium3D onAquariumClick={handleAquariumClick} />
      </div>

      <ControlButtons />
      <SpeciesToolbar />
      <EcosystemStats />
      <EvolutionChart />
      <FoodWebPanel />
      <SpeciesInfoCard />

      {selectedSpeciesId && (
        <div className="absolute inset-0 pointer-events-none z-5">
          <div className="absolute inset-0 bg-cyan-500/5 animate-pulse" />
        </div>
      )}
    </div>
  );
}
