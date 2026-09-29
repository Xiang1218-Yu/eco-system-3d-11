import { useMemo, useState } from 'react';
import { LineChart, Eye, EyeOff } from 'lucide-react';
import { GlassCard } from '@/components/common/GlassCard';
import { useEcosystemStore } from '@/store/useEcosystemStore';
import { SPECIES, TROPHIC_LEVEL_COLORS, TROPHIC_LEVEL_LABELS } from '@/data/species';
import type { PopulationSample, TrophicLevel } from '@/types/ecosystem';

type Dimension = 'species' | 'trophic';

const LEVEL_ORDER: TrophicLevel[] = ['producer', 'herbivore', 'carnivore', 'decomposer'];

const VIEW_W = 300;
const VIEW_H = 230;
const PAD = { top: 12, right: 12, bottom: 26, left: 34 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;
const TOOLTIP_W = 136;

interface SeriesDef {
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  emoji?: string;
  getValue: (sample: PopulationSample) => number;
}

function safeNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function niceCeil(value: number): number {
  if (value <= 5) return Math.max(1, Math.ceil(value));
  return Math.ceil(value / 5) * 5;
}

function formatTime(t: number): string {
  const safe = Math.max(0, Math.floor(safeNumber(t)));
  const mins = Math.floor(safe / 100);
  const secs = safe % 100;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function EvolutionChart() {
  const history = useEcosystemStore((s) => s.populationHistory);

  const [dimension, setDimension] = useState<Dimension>('species');
  const [showLegend, setShowLegend] = useState(true);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const allSeries = useMemo<SeriesDef[]>(() => {
    if (dimension === 'species') {
      return SPECIES.filter((sp) => history.some((s) => safeNumber(s.species[sp.id]) > 0)).map(
        (sp) => ({
          id: sp.id,
          label: `${sp.emoji} ${sp.name}`,
          shortLabel: sp.name,
          color: sp.color,
          emoji: sp.emoji,
          getValue: (s) => safeNumber(s.species[sp.id]),
        }),
      );
    }

    return LEVEL_ORDER.filter((level) =>
      history.some((s) => safeNumber(s.trophic[level]) > 0),
    ).map((level) => ({
      id: level,
      label: TROPHIC_LEVEL_LABELS[level],
      shortLabel: TROPHIC_LEVEL_LABELS[level],
      color: TROPHIC_LEVEL_COLORS[level],
      getValue: (s) => safeNumber(s.trophic[level]),
    }));
  }, [dimension, history]);

  const visibleSeries = useMemo(
    () => allSeries.filter((series) => !hidden[series.id]),
    [allSeries, hidden],
  );

  const sampleCount = history.length;

  const { yMax, ticks } = useMemo(() => {
    let max = 0;
    history.forEach((sample) => {
      visibleSeries.forEach((series) => {
        max = Math.max(max, series.getValue(sample));
      });
    });
    const ceil = niceCeil(max);
    const step = Math.max(1, Math.ceil(ceil / 4));
    const tickValues: number[] = [];
    for (let v = 0; v <= ceil; v += step) tickValues.push(v);
    if (tickValues[tickValues.length - 1] !== ceil) tickValues.push(ceil);
    return { yMax: ceil, ticks: tickValues };
  }, [history, visibleSeries]);

  const xForIndex = (index: number): number => {
    if (sampleCount <= 1) return PAD.left;
    const ratio = index / (sampleCount - 1);
    return PAD.left + (Number.isFinite(ratio) ? ratio : 0) * PLOT_W;
  };

  const yForValue = (value: number): number => {
    const safe = safeNumber(value);
    const ratio = yMax > 0 ? safe / yMax : 0;
    return PAD.top + (1 - (Number.isFinite(ratio) ? ratio : 0)) * PLOT_H;
  };

  const buildPath = (series: SeriesDef): string => {
    if (sampleCount === 0) return '';
    const points = history
      .map((sample, i) => {
        const x = xForIndex(i);
        const y = yForValue(series.getValue(sample));
        return Number.isFinite(x) && Number.isFinite(y) ? `${x.toFixed(2)},${y.toFixed(2)}` : null;
      })
      .filter((p): p is string => p !== null);
    if (points.length === 0) return '';
    return `M ${points.join(' L ')}`;
  };

  const handleMove = (event: React.MouseEvent<SVGRectElement>) => {
    if (sampleCount === 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const scale = VIEW_W / rect.width;
    const svgX = (event.clientX - rect.left) * scale;
    const ratio = PLOT_W > 0 ? (svgX - PAD.left) / PLOT_W : 0;
    const rawIndex = sampleCount <= 1 ? 0 : Math.round(ratio * (sampleCount - 1));
    setHoverIndex(Math.max(0, Math.min(sampleCount - 1, Math.trunc(rawIndex))));
  };

  const toggleSeries = (id: string) => {
    setHidden((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const allHidden = allSeries.length > 0 && visibleSeries.length === 0;
  const hoverSample = hoverIndex !== null ? history[hoverIndex] : null;

  const tooltipRows = useMemo(() => {
    if (!hoverSample) return [];
    return visibleSeries
      .map((series) => ({ series, value: series.getValue(hoverSample) }))
      .sort((a, b) => b.value - a.value);
  }, [hoverSample, visibleSeries]);

  const tooltipHeight = 18 + tooltipRows.length * 13 + 8;
  const hoverX = hoverIndex !== null ? xForIndex(hoverIndex) : 0;
  const tooltipX =
    hoverX + 10 + TOOLTIP_W > VIEW_W - PAD.right
      ? Math.max(2, hoverX - 10 - TOOLTIP_W)
      : hoverX + 10;
  const tooltipY = Math.min(
    Math.max(2, PAD.top + PLOT_H / 2 - tooltipHeight / 2),
    Math.max(2, VIEW_H - tooltipHeight - 2),
  );

  return (
    <div className="absolute top-20 right-4 z-30 w-80">
      <GlassCard className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-white font-bold text-sm flex items-center gap-1.5">
            <LineChart size={15} className="text-cyan-400" />
            种群演化
          </h3>
          <div className="flex items-center gap-1">
            <div className="flex rounded-lg bg-white/10 p-0.5 text-[10px]">
              {(
                [
                  { key: 'species', label: '物种' },
                  { key: 'trophic', label: '营养级' },
                ] as { key: Dimension; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setDimension(tab.key)}
                  className={`px-2 py-0.5 rounded-md transition-colors ${
                    dimension === tab.key
                      ? 'bg-cyan-500/70 text-white'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowLegend((v) => !v)}
              className="p-1 rounded-lg hover:bg-white/10 text-white/80 transition-colors"
              title={showLegend ? '隐藏图例' : '显示图例'}
            >
              {showLegend ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          </div>
        </div>

        {sampleCount === 0 ? (
          <div className="w-full flex items-center justify-center text-white/40 text-xs py-16 flex-col gap-2">
            <LineChart size={28} className="opacity-40" />
            <span>放入物种后开始记录演化数据</span>
          </div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              className="w-full h-auto select-none"
              onMouseLeave={() => setHoverIndex(null)}
            >
              {/* 网格线与 Y 轴刻度 */}
              {ticks.map((tick) => {
                const y = yForValue(tick);
                return (
                  <g key={`tick-${tick}`}>
                    <line
                      x1={PAD.left}
                      y1={y}
                      x2={VIEW_W - PAD.right}
                      y2={y}
                      stroke="rgba(255,255,255,0.12)"
                      strokeWidth={tick === 0 ? 1.5 : 0.5}
                    />
                    <text
                      x={PAD.left - 5}
                      y={y}
                      textAnchor="end"
                      dominantBaseline="middle"
                      fontSize={8}
                      fill="rgba(255,255,255,0.5)"
                    >
                      {tick}
                    </text>
                  </g>
                );
              })}

              {/* X 轴起止时间 */}
              <text
                x={PAD.left}
                y={VIEW_H - 8}
                textAnchor="start"
                fontSize={8}
                fill="rgba(255,255,255,0.5)"
              >
                {formatTime(history[0].time)}
              </text>
              <text
                x={VIEW_W - PAD.right}
                y={VIEW_H - 8}
                textAnchor="end"
                fontSize={8}
                fill="rgba(255,255,255,0.5)"
              >
                {formatTime(history[sampleCount - 1].time)}
              </text>

              {/* 数据曲线 */}
              {visibleSeries.map((series) => {
                const path = buildPath(series);
                if (!path) return null;
                const lastValue = series.getValue(history[sampleCount - 1]);
                return (
                  <g key={series.id}>
                    {sampleCount > 1 && (
                      <path
                        d={path}
                        fill="none"
                        stroke={series.color}
                        strokeWidth={1.6}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        opacity={0.9}
                      />
                    )}
                    {/* 单点（历史只有一次采样） */}
                    {sampleCount === 1 && (
                      <circle
                        cx={xForIndex(0)}
                        cy={yForValue(lastValue)}
                        r={3}
                        fill={series.color}
                      />
                    )}
                    {/* 末端当前值圆点 */}
                    <circle
                      cx={xForIndex(sampleCount - 1)}
                      cy={yForValue(lastValue)}
                      r={2.4}
                      fill={series.color}
                      stroke="rgba(10,22,40,0.8)"
                      strokeWidth={0.8}
                    />
                  </g>
                );
              })}

              {allHidden && (
                <text
                  x={PAD.left + PLOT_W / 2}
                  y={PAD.top + PLOT_H / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={10}
                  fill="rgba(255,255,255,0.4)"
                >
                  图例已全部隐藏
                </text>
              )}

              {/* 悬停参考线与数据点 */}
              {hoverSample && hoverIndex !== null && (
                <g pointerEvents="none">
                  <line
                    x1={hoverX}
                    y1={PAD.top}
                    x2={hoverX}
                    y2={PAD.top + PLOT_H}
                    stroke="rgba(255,255,255,0.35)"
                    strokeWidth={0.8}
                    strokeDasharray="3 3"
                  />
                  {tooltipRows.map(({ series, value }) => (
                    <circle
                      key={`hover-${series.id}`}
                      cx={hoverX}
                      cy={yForValue(value)}
                      r={2.8}
                      fill={series.color}
                      stroke="white"
                      strokeWidth={0.8}
                    />
                  ))}
                </g>
              )}

              {/* 悬停提示（纯 SVG） */}
              {hoverSample && tooltipRows.length > 0 && (
                <g
                  transform={`translate(${tooltipX.toFixed(2)}, ${tooltipY.toFixed(2)})`}
                  pointerEvents="none"
                >
                  <rect
                    width={TOOLTIP_W}
                    height={tooltipHeight}
                    rx={6}
                    fill="rgba(10,22,40,0.92)"
                    stroke="rgba(255,255,255,0.25)"
                    strokeWidth={0.6}
                  />
                  <text x={8} y={13} fontSize={9} fontWeight="bold" fill="rgba(255,255,255,0.85)">
                    {formatTime(hoverSample.time)} · 总数 {safeNumber(hoverSample.total)}
                  </text>
                  {tooltipRows.map((row, i) => (
                    <g key={`tip-${row.series.id}`} transform={`translate(8, ${26 + i * 13})`}>
                      <circle cx={3} cy={-3} r={2.6} fill={row.series.color} />
                      <text x={10} y={0} fontSize={8.5} fill="rgba(255,255,255,0.85)">
                        {row.series.shortLabel}
                      </text>
                      <text
                        x={TOOLTIP_W - 16}
                        y={0}
                        textAnchor="end"
                        fontSize={8.5}
                        fontWeight="bold"
                        fill={row.series.color}
                      >
                        {row.value}
                      </text>
                    </g>
                  ))}
                </g>
              )}

              {/* 悬停捕获层 */}
              <rect
                x={PAD.left}
                y={PAD.top}
                width={PLOT_W}
                height={PLOT_H}
                fill="transparent"
                onMouseMove={handleMove}
              />
            </svg>

            {showLegend && (
              <div className="mt-1 flex flex-wrap gap-1">
                {allSeries.map((series) => {
                  const isHidden = !!hidden[series.id];
                  const current =
                    sampleCount > 0 ? series.getValue(history[sampleCount - 1]) : 0;
                  const peak = history.reduce((m, s) => Math.max(m, series.getValue(s)), 0);
                  const extinct = current === 0 && peak > 0;
                  return (
                    <button
                      key={series.id}
                      onClick={() => toggleSeries(series.id)}
                      className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border transition-all ${
                        isHidden
                          ? 'opacity-35 border-white/10 text-white/60 line-through'
                          : 'border-white/15 text-white hover:bg-white/10'
                      }`}
                      title={isHidden ? '点击显示该曲线' : '点击隐藏该曲线'}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: series.color }}
                      />
                      {series.emoji && <span>{series.emoji}</span>}
                      <span>{series.shortLabel}</span>
                      <span className="font-mono font-bold">{current}</span>
                      {extinct && (
                        <span className="text-red-300 no-underline">灭绝</span>
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
