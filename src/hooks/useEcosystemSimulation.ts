import { useEffect, useRef } from 'react';
import { useEcosystemStore, POPULATION_SAMPLE_INTERVAL } from '@/store/useEcosystemStore';
import { simulateStep } from '@/utils/ecosystemSimulator';

export function useEcosystemSimulation() {
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const isRunningRef = useRef<boolean>(true);

  const batchUpdateOrganisms = useEcosystemStore((s) => s.batchUpdateOrganisms);
  const batchRemoveOrganisms = useEcosystemStore((s) => s.batchRemoveOrganisms);
  const addOrganism = useEcosystemStore((s) => s.addOrganism);
  const incrementTime = useEcosystemStore((s) => s.incrementTime);
  const recordPopulationSample = useEcosystemStore((s) => s.recordPopulationSample);
  const isRunning = useEcosystemStore((s) => s.isRunning);

  useEffect(() => {
    isRunningRef.current = isRunning;
  }, [isRunning]);

  useEffect(() => {
    const tick = (time: number) => {
      if (isRunningRef.current && time - lastTimeRef.current > 60) {
        lastTimeRef.current = time;

        const organisms = useEcosystemStore.getState().organisms;
        const { updates, toRemove, toAdd } = simulateStep(organisms);

        if (updates.length > 0) {
          batchUpdateOrganisms(updates);
        }
        if (toRemove.length > 0) {
          batchRemoveOrganisms(toRemove);
        }
        toAdd.forEach(({ speciesId, position }) => {
          addOrganism(speciesId, position);
        });

        incrementTime();

        const simTime = useEcosystemStore.getState().simulationTime;
        if (simTime % POPULATION_SAMPLE_INTERVAL === 0) {
          recordPopulationSample();
        }
      }

      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [batchUpdateOrganisms, batchRemoveOrganisms, addOrganism, incrementTime, recordPopulationSample]);
}
