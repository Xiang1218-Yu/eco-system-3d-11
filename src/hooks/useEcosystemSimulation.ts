import { useEffect, useRef } from 'react';
import { useEcosystemStore, HISTORY_SAMPLE_INTERVAL } from '@/store/useEcosystemStore';
import { simulateStep } from '@/utils/ecosystemSimulator';

export function useEcosystemSimulation() {
  const frameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const isRunningRef = useRef<boolean>(true);
  const lastSampleTimeRef = useRef<number>(-HISTORY_SAMPLE_INTERVAL);

  const batchUpdateOrganisms = useEcosystemStore((s) => s.batchUpdateOrganisms);
  const batchRemoveOrganisms = useEcosystemStore((s) => s.batchRemoveOrganisms);
  const addOrganism = useEcosystemStore((s) => s.addOrganism);
  const incrementTime = useEcosystemStore((s) => s.incrementTime);
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

        const state = useEcosystemStore.getState();
        // 重置后历史被清空，采样基线随当前时间重新对齐
        if (state.populationHistory.length === 0) {
          lastSampleTimeRef.current = state.simulationTime - HISTORY_SAMPLE_INTERVAL;
        }
        if (state.simulationTime - lastSampleTimeRef.current >= HISTORY_SAMPLE_INTERVAL) {
          lastSampleTimeRef.current = state.simulationTime;
          state.recordPopulationSample();
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
  }, [batchUpdateOrganisms, batchRemoveOrganisms, addOrganism, incrementTime]);
}
