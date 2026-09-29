import { useMemo, useState } from 'react';
import { GlassCard } from '@/components/common/GlassCard';
import { useEcosystemStore } from '@/store/useEcosystemStore';
import { SPECIES, TROPHIC_LEVEL_COLORS, TROPHIC_LEVEL_LABELS } from '@/data/species';
import type { PopulationSample, TrophicLevel } from '@/types/ecosystem';
import { ChevronDown, ChevronUp, LineChart } from 'lucide-react';

type Dimension = 'species' | 'trophic';

const LEVEL_ORDER: TrophicLevel[] = ['producer', 'herbivore', 'carnivore', 'decomposer'];

const VIEW_W = 340;
const VIEW_H = 200;
const PAD = { top: 14, right: 16, bottom: 26, left: 40 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;
const PLOT_LEFT = PAD.left;
const PLOT_BOTTOM = VIEW_H - PAD.bottom;

interface SeriesDef {
  id: string;
  label: string;
  color: string;
  emoji?: string;
}

function formatTime(t: number) {
  const safe = Number.isFinite(t) ? Math.max(0, Math.floor(t)) : 0;
  const mins = Math.floor(safe / 100);
  const secs = safe % 100;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/** 将数量上限取整为 1/2/5 × 10^n 的友好刻度；入参保证 >= 1 */
function niceCeil(rawMax: number) {
  if (!Number.isFinite(rawMax) || rawMax <= 0) return { yMax: 1, step: 1 };
  const rough = rawMax / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / pow;
  const step = norm <= 1 ? pow : norm <= 2 ? 2 * pow : norm <= 5 ? 5 * pow : 10 * pow;
  const yMax = Math.max(step, Math.ceil(rawMax / step) * step);
  return { yMax, step };
}

export function EvolutionChart() {
  const history = useEcosystemStore((s) => s.populationHistory);
  const [dimension, setDimension] = useState<Dimension>('species');
  const [hiddenSpecies, setHiddenSpecies] = useState<string[]>([]);
  const [hiddenTrophic, setHiddenTrophic] = useState<string[]>([]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  const hidden = dimension === 'species' ? hiddenSpecies : hiddenTrophic;

  const toggleHidden = (id: string) => {
    setHoverIdx(null);
    if (dimension === 'species') {
      setHiddenSpecies((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setHiddenTrophic((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }
  };

  const switchDimension = (dim: Dimension) => {
    setDimension(dim);
    setHoverIdx(null);
  };

  const getValue = (sample: PopulationSample, id: string): number => {
    const v = dimension === 'species' ? sample.species[id] : sample.trophic[id as TrophicLevel];
    return Number.isFinite(v) ? v ?? 0 : 0;
  };

  // 只展示在历史中曾出现过的系列（灭绝后保留曲线，并在图例中标记）
  const allSeries = useMemo<SeriesDef[]>(() => {
    if (dimension === 'species') {
      return SPECIES.filter((sp) => history.some((s) => (s.species[sp.id] || 0) > 0)).map((sp) => ({
        id: sp.id,
        label: sp.name,
        color: sp.color,
        emoji: sp.emoji,
      }));
    }
    return LEVEL_ORDER.filter((level) => history.some((s) => (s.trophic[level] || 0) > 0)).map(
      (level) => ({
        id: level,
        label: TROPHIC_LEVEL_LABELS[level],
        color: TROPHIC_LEVEL_COLORS[level],
      }),
    );
  }, [dimension, history]);

  const visibleSeries = allSeries.filter((s) => !hidden.includes(s.id));
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const hasData = history.length > 0 && visibleSeries.length > 0;

  const { yMax, yTicks } = useMemo(() => {
    if (!hasData) return { yMax: 0, step: 0, yTicks: [] as number[] };
    let maxV = 0;
    history.forEach((sample) => {
      visibleSeries.forEach((s) => {
        maxV = Math.max(maxV, getValue(sample, s.id));
      });
    });
    const nice = niceCeil(Math.max(1, maxV));
    const ticks: number[] = [];
    for (let v = 0; v <= nice.yMax && Number.isFinite(v); v += nice.step) {
      ticks.push(Number(v.toFixed(6)));
    }
    return { ...nice, yTicks: ticks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, visibleSeries, dimension]);

  const n = history.length;
  const xFor = (i: number) => {
    if (n <= 1) return PLOT_LEFT + PLOT_W / 2;
    const ratio = i / (n - 1);
    return PLOT_LEFT + ratio * PLOT_W;
  };
  const yFor = (v: number) => {
    if (!Number.isFinite(v) || yMax <= 0) return PLOT_BOTTOM;
    const ratio = Math.min(1, Math.max(0, v / yMax));
    return PLOT_BOTTOM - ratio * PLOT_H;
  };

  // X 轴时间标签：最多取 4 个均匀采样点
  const xLabelIdx = useMemo(() => {
    if (n === 0) return [] as number[];
    if (n === 1) return [0];
    const count = Math.min(4, n);
    const idxs = new Set<number>();
    for (let k = 0; k < count; k++) {
      idxs.add(Math.round((k * (n - 1)) / (count - 1)));
    }
    return [...idxs].sort((a, b) => a - b);
  }, [n]);

  const handleMouseMove = (e: React.MouseEvent<SVGRectElement>) => {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = VIEW_W / rect.width;
    const x = (e.clientX - rect.left) * scaleX;
    if (x < PLOT_LEFT || x > PLOT_LEFT + PLOT_W) {
      setHoverIdx(null);
      return;
    }
    const ratio = n <= 1 ? 0.5 : (x - PLOT_LEFT) / PLOT_W;
    const idx =
      n <= 1 ? 0 : Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1))));
    setHoverIdx(idx);
  };

  const hoverSample = hoverIdx !== null ? history[hoverIdx] : null;
  const tooltipRows = hoverSample
    ? visibleSeries
        .map((s) => ({ ...s, value: getValue(hoverSample, s.id) }))
        .sort((a, b) => b.value - a.value)
    : [];
  const TIP_W = 128;
  const TIP_H = 18 + tooltipRows.length * 13 + 6;
  const tipX = hoverIdx !== null && xFor(hoverIdx) > VIEW_W / 2 ? xFor(hoverIdx) - TIP_W - 6 : (hoverIdx !== null ? xFor(hoverIdx) + 6 : 0);
  const tipY = 6;

  return (
    <div className="absolute top-20 right-4 z-30 w-[360px]">
      <GlassCard className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-bold text-base flex items-center gap-2">
            <LineChart size={18} className="text-cyan-400" />
            种群演化
          </h3>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1 rounded-lg hover:bg-white/10 text-white/70 transition-colors"
            title={collapsed ? '展开图表' : '收起图表'}
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        </div>

        {!collapsed && (
          <>
            <div className="flex gap-1 mb-2 p-0.5 bg-white/5 rounded-lg w-fit">
              {(
                [
                  { key: 'species', label: '按物种' },
                  { key: 'trophic', label: '按营养级' },
                ] as { key: Dimension; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => switchDimension(tab.key)}
                  className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                    dimension === tab.key
                      ? 'bg-cyan-500/40 text-cyan-100'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {history.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center text-white/40 text-xs gap-1"
                style={{ height: VIEW_H }}
              >
                <LineChart size={28} className="opacity-50" />
                <span>暂无演化数据</span>
                <span>模拟运行后将按采样间隔自动记录</span>
              </div>
            ) : allSeries.length === 0 ? (
              <div
                className="flex items-center justify-center text-white/40 text-xs"
                style={{ height: VIEW_H }}
              >
                当前维度没有可展示的种群
              </div>
            ) : visibleSeries.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center text-white/40 text-xs gap-2"
                style={{ height: VIEW_H }}
              >
                <span>所有曲线已隐藏</span>
                <span>点击下方图例可重新显示</span>
              </div>
            ) : (
              <svg
                viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
                width="100%"
                className="block"
                role="img"
                aria-label="种群数量演化折线图"
              >
                {/* 网格线与 Y 轴刻度 */}
                {yTicks.map((tick) => (
                  <g key={`tick-${tick}`}>
                    <line
                      x1={PLOT_LEFT}
                      y1={yFor(tick)}
                      x2={PLOT_LEFT + PLOT_W}
                      y2={yFor(tick)}
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth={1}
                    />
                    <text
                      x={PLOT_LEFT - 6}
                      y={yFor(tick)}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize={9}
                      fill="rgba(255,255,255,0.5)"
                    >
                      {tick}
                    </text>
                  </g>
                ))}

                {/* X 轴 */}
                <line
                  x1={PLOT_LEFT}
                  y1={PLOT_BOTTOM}
                  x2={PLOT_LEFT + PLOT_W}
                  y2={PLOT_BOTTOM}
                  stroke="rgba(255,255,255,0.25)"
                  strokeWidth={1}
                />
                {xLabelIdx.map((idx) => (
                  <text
                    key={`xlabel-${idx}`}
                    x={xFor(idx)}
                    y={PLOT_BOTTOM + 14}
                    textAnchor="middle"
                    fontSize={9}
                    fill="rgba(255,255,255,0.5)"
                  >
                    {formatTime(history[idx].time)}
                  </text>
                ))}

                {/* 折线 */}
                {visibleSeries.map((s) => {
                  const pts = history.map((sample, i) => {
                    const x = xFor(i);
                    const y = yFor(getValue(sample, s.id));
                    return Number.isFinite(x) && Number.isFinite(y) ? `${x},${y}` : null;
                  });
                  const validPts = pts.filter((p): p is string => p !== null);
                  if (validPts.length === 0) return null;
                  const isExtinct = getValue(latest as PopulationSample, s.id) === 0;
                  return (
                    <g key={s.id}>
                      {validPts.length > 1 && (
                        <polyline
                          points={validPts.join(' ')}
                          fill="none"
                          stroke={s.color}
                          strokeWidth={1.8}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          opacity={isExtinct ? 0.45 : 0.95}
                          strokeDasharray={isExtinct ? '4 3' : undefined}
                        />
                      )}
                      {/* 只有一个采样点时绘制圆点，避免空线 */}
                      {validPts.length === 1 &&
                        (() => {
                          const [px, py] = validPts[0].split(',').map(Number);
                          if (!Number.isFinite(px) || !Number.isFinite(py)) return null;
                          return <circle cx={px} cy={py} r={3} fill={s.color} />;
                        })()}
                      {/* 末端点 */}
                      {validPts.length > 1 &&
                        (() => {
                          const last = validPts[validPts.length - 1].split(',').map(Number);
                          if (!Number.isFinite(last[0]) || !Number.isFinite(last[1])) return null;
                          return (
                            <circle
                              cx={last[0]}
                              cy={last[1]}
                              r={2.5}
                              fill={s.color}
                              opacity={isExtinct ? 0.5 : 1}
                            />
                          );
                        })()}
                    </g>
                  );
                })}

                {/* 悬停辅助线与数据点 */}
                {hoverSample && hoverIdx !== null && (
                  <g>
                    <line
                      x1={xFor(hoverIdx)}
                      y1={PAD.top}
                      x2={xFor(hoverIdx)}
                      y2={PLOT_BOTTOM}
                      stroke="rgba(255,255,255,0.35)"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                    {tooltipRows.map((row) => {
                      const cy = yFor(row.value);
                      if (!Number.isFinite(cy)) return null;
                      return (
                        <circle
                          key={`hover-${row.id}`}
                          cx={xFor(hoverIdx)}
                          cy={cy}
                          r={3.2}
                          fill={row.color}
                          stroke="#0A1628"
                          strokeWidth={1}
                        />
                      );
                    })}
                    <g pointerEvents="none">
                      <rect
                        x={Math.max(4, Math.min(VIEW_W - TIP_W - 4, tipX))}
                        y={tipY}
                        width={TIP_W}
                        height={TIP_H}
                        rx={6}
                        fill="rgba(10,22,40,0.92)"
                        stroke="rgba(255,255,255,0.2)"
                      />
                      <text
                        x={Math.max(4, Math.min(VIEW_W - TIP_W - 4, tipX)) + 8}
                        y={tipY + 13}
                        fontSize={9.5}
                        fill="rgba(255,255,255,0.6)"
                      >
                        {formatTime(hoverSample.time)}
                      </text>
                      {tooltipRows.map((row, i) => {
                        const tx = Math.max(4, Math.min(VIEW_W - TIP_W - 4, tipX)) + 8;
                        const ty = tipY + 26 + i * 13;
                        return (
                          <g key={`tip-${row.id}`}>
                            <circle cx={tx + 3} cy={ty - 3} r={3} fill={row.color} />
                            <text x={tx + 11} y={ty} fontSize={10} fill="rgba(255,255,255,0.85)">
                              {row.emoji ? `${row.emoji} ` : ''}
                              {row.label}
                            </text>
                            <text
                              x={tx + TIP_W - 16}
                              y={ty}
                              fontSize={10}
                              textAnchor="end"
                              fill={row.color}
                              fontWeight="bold"
                            >
                              {row.value}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  </g>
                )}

                {/* 悬停捕获层 */}
                <rect
                  x={PLOT_LEFT}
                  y={0}
                  width={PLOT_W}
                  height={VIEW_H}
                  fill="transparent"
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => setHoverIdx(null)}
                />
              </svg>
            )}

            {/* 图例（点击显隐） */}
            {allSeries.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {allSeries.map((s) => {
                  const isHidden = hidden.includes(s.id);
                  const currentCount = latest ? getValue(latest, s.id) : 0;
                  const extinct = currentCount === 0;
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleHidden(s.id)}
                      title={isHidden ? '点击显示' : '点击隐藏'}
                      className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border transition-all ${
                        isHidden ? 'opacity-40' : 'opacity-100'
                      }`}
                      style={{
                        borderColor: s.color + '80',
                        color: isHidden ? 'rgba(255,255,255,0.5)' : s.color,
                        backgroundColor: isHidden ? 'transparent' : s.color + '22',
                      }}
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.emoji && <span>{s.emoji}</span>}
                      <span className={isHidden ? 'line-through' : undefined}>{s.label}</span>
                      <span className="text-white/70 font-mono">{currentCount}</span>
                      {extinct && !isHidden && (
                        <span className="text-red-300/90">灭绝</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </GlassCard>
    </div>
  );
}
