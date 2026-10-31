'use client';

import { useId, useState } from 'react';
import type { AssistantInsightsTotals } from '@huspee/sdk';
import { Badge, Card } from '@huspee/web-ui/components/ui';
import { useT } from '@huspee/web-ui/i18n';
import { assistantMessages } from '../../messages';

interface DailyData extends AssistantInsightsTotals {
  date: string;
}

export function TrendChart({ daily }: { daily: DailyData[] }) {
  const t = useT(assistantMessages);
  const chartId = useId();
  const [activeTab, setActiveTab] = useState<'conversations' | 'conversions'>('conversations');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (daily.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-gray-500">{t('noTrendData')}</p>
      </Card>
    );
  }

  // Calculate max values for scale
  const maxConv = Math.max(1, ...daily.map((d) => d.conversations));
  const maxConversions = Math.max(1, ...daily.map((d) => Math.max(d.orders_placed, d.handoffs)));
  const maxVal = activeTab === 'conversations' ? maxConv : maxConversions;

  // Chart dimensions
  const svgWidth = 800;
  const svgHeight = 220;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;
  const plotWidth = svgWidth - paddingLeft - paddingRight;
  const plotHeight = svgHeight - paddingTop - paddingBottom;

  const barCount = daily.length;
  const slotWidth = plotWidth / barCount;
  const barWidth = Math.min(36, Math.max(8, slotWidth * 0.65));

  // Y-axis ticks
  const yTicks = [0, Math.ceil(maxVal * 0.5), maxVal];

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-900">{t('trendTitle')}</h2>
            <Badge tone="neutral">{t('verifiedLogsBadge')}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-gray-500">{t('trendDesc')}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Toggle metric */}
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('conversations')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                activeTab === 'conversations'
                  ? 'bg-white text-gray-900 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('metricConversations')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('conversions')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                activeTab === 'conversions'
                  ? 'bg-white text-gray-900 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('metricOrders')} & {t('metricHandoffs')}
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
        {activeTab === 'conversations' ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-xs bg-indigo-500" />
              <span>{t('metricVoice')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-xs bg-sky-400" />
              <span>{t('metricText')}</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-xs bg-emerald-500" />
              <span>{t('metricOrders')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-xs bg-amber-500" />
              <span>{t('metricHandoffs')}</span>
            </div>
          </>
        )}
      </div>

      {/* Hover info tooltip box */}
      <div className="h-8">
        {hoveredIdx !== null && daily[hoveredIdx] ? (
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-700 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
            <span className="font-semibold text-gray-900">{daily[hoveredIdx].date}:</span>
            <span>
              {t('metricConversations')}: <strong>{daily[hoveredIdx].conversations}</strong>
            </span>
            <span>
              ({t('metricVoice')}: {daily[hoveredIdx].voice}, {t('metricText')}: {daily[hoveredIdx].text})
            </span>
            <span>
              {t('metricOrders')}: <strong>{daily[hoveredIdx].orders_placed}</strong>
            </span>
            <span>
              {t('metricHandoffs')}: <strong>{daily[hoveredIdx].handoffs}</strong>
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-400 italic">{t('trendHoverHint')}</span>
        )}
      </div>

      {/* Chart Canvas */}
      <div className="w-full overflow-x-auto">
        <svg
          role="img"
          aria-label={t('trendTitle')}
          aria-describedby={chartId}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="min-w-[500px] w-full select-none"
        >
          <desc id={chartId}>{t('trendDesc')}</desc>

          {/* Grid lines and Y-axis labels */}
          {yTicks.map((val) => {
            const y = paddingTop + plotHeight - (val / maxVal) * plotHeight;
            return (
              <g key={val}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={svgWidth - paddingRight}
                  y2={y}
                  stroke="#e5e7eb"
                  strokeDasharray="3 3"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="10"
                  fill="#9ca3af"
                  fontFamily="sans-serif"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Baseline */}
          <line
            x1={paddingLeft}
            y1={paddingTop + plotHeight}
            x2={svgWidth - paddingRight}
            y2={paddingTop + plotHeight}
            stroke="#9ca3af"
          />

          {/* Bars */}
          {daily.map((day, idx) => {
            const xCenter = paddingLeft + idx * slotWidth + slotWidth / 2;
            const x = xCenter - barWidth / 2;
            const isHovered = hoveredIdx === idx;

            // Date label
            const labelParts = day.date.split('-');
            const shortDate = labelParts.length === 3 ? `${labelParts[2]}/${labelParts[1]}` : day.date;
            const showLabel = barCount <= 14 || idx % Math.ceil(barCount / 14) === 0;

            if (activeTab === 'conversations') {
              // Stacked voice + text
              const voiceHeight = (day.voice / maxVal) * plotHeight;
              const textHeight = (day.text / maxVal) * plotHeight;
              const totalHeight = voiceHeight + textHeight;
              const topY = paddingTop + plotHeight - totalHeight;

              return (
                <g
                  key={day.date}
                  tabIndex={0}
                  role="graphics-symbol"
                  aria-label={`${day.date}: ${day.conversations} conversations (${day.voice} voice, ${day.text} text)`}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onFocus={() => setHoveredIdx(idx)}
                  onBlur={() => setHoveredIdx(null)}
                  className="cursor-pointer focus:outline-hidden"
                >
                  <title>{`${day.date}: ${day.conversations} conversations (${day.voice} voice, ${day.text} text)`}</title>
                  {/* Invisible hit area */}
                  <rect
                    x={xCenter - slotWidth / 2}
                    y={paddingTop}
                    width={slotWidth}
                    height={plotHeight}
                    fill="transparent"
                  />

                  {/* Highlight background on hover */}
                  {isHovered && (
                    <rect
                      x={xCenter - slotWidth / 2}
                      y={paddingTop}
                      width={slotWidth}
                      height={plotHeight}
                      fill="#f3f4f6"
                      opacity="0.6"
                      rx="2"
                    />
                  )}

                  {/* Text bar (bottom segment) */}
                  {textHeight > 0 && (
                    <rect
                      x={x}
                      y={paddingTop + plotHeight - textHeight}
                      width={barWidth}
                      height={textHeight}
                      fill="#38bdf8"
                      rx={voiceHeight > 0 ? '0' : '3'}
                      opacity={isHovered ? 1 : 0.85}
                    />
                  )}

                  {/* Voice bar (top segment) */}
                  {voiceHeight > 0 && (
                    <rect
                      x={x}
                      y={topY}
                      width={barWidth}
                      height={voiceHeight}
                      fill="#6366f1"
                      rx="3"
                      opacity={isHovered ? 1 : 0.9}
                    />
                  )}

                  {/* Zero indicator */}
                  {day.conversations === 0 && (
                    <circle cx={xCenter} cy={paddingTop + plotHeight - 2} r="2" fill="#d1d5db" />
                  )}

                  {/* X-axis label */}
                  {showLabel && (
                    <text
                      x={xCenter}
                      y={paddingTop + plotHeight + 16}
                      textAnchor="middle"
                      fontSize="10"
                      fill={isHovered ? '#111827' : '#6b7280'}
                      fontWeight={isHovered ? 'bold' : 'normal'}
                      fontFamily="sans-serif"
                    >
                      {shortDate}
                    </text>
                  )}
                </g>
              );
            } else {
              // Grouped or stacked orders and handoffs
              const orderHeight = (day.orders_placed / maxVal) * plotHeight;
              const handoffHeight = (day.handoffs / maxVal) * plotHeight;
              const halfBar = barWidth / 2;

              return (
                <g
                  key={day.date}
                  tabIndex={0}
                  role="graphics-symbol"
                  aria-label={`${day.date}: ${day.orders_placed} orders, ${day.handoffs} handoffs`}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  onFocus={() => setHoveredIdx(idx)}
                  onBlur={() => setHoveredIdx(null)}
                  className="cursor-pointer focus:outline-hidden"
                >
                  <title>{`${day.date}: ${day.orders_placed} orders, ${day.handoffs} handoffs`}</title>
                  {/* Invisible hit area */}
                  <rect
                    x={xCenter - slotWidth / 2}
                    y={paddingTop}
                    width={slotWidth}
                    height={plotHeight}
                    fill="transparent"
                  />

                  {isHovered && (
                    <rect
                      x={xCenter - slotWidth / 2}
                      y={paddingTop}
                      width={slotWidth}
                      height={plotHeight}
                      fill="#f3f4f6"
                      opacity="0.6"
                      rx="2"
                    />
                  )}

                  {/* Orders bar */}
                  {orderHeight > 0 ? (
                    <rect
                      x={x}
                      y={paddingTop + plotHeight - orderHeight}
                      width={halfBar - 1}
                      height={orderHeight}
                      fill="#10b981"
                      rx="2"
                    />
                  ) : null}

                  {/* Handoffs bar */}
                  {handoffHeight > 0 ? (
                    <rect
                      x={x + halfBar}
                      y={paddingTop + plotHeight - handoffHeight}
                      width={halfBar - 1}
                      height={handoffHeight}
                      fill="#f59e0b"
                      rx="2"
                    />
                  ) : null}

                  {/* Zero indicator */}
                  {day.orders_placed === 0 && day.handoffs === 0 && (
                    <circle cx={xCenter} cy={paddingTop + plotHeight - 2} r="2" fill="#d1d5db" />
                  )}

                  {/* X-axis label */}
                  {showLabel && (
                    <text
                      x={xCenter}
                      y={paddingTop + plotHeight + 16}
                      textAnchor="middle"
                      fontSize="10"
                      fill={isHovered ? '#111827' : '#6b7280'}
                      fontWeight={isHovered ? 'bold' : 'normal'}
                      fontFamily="sans-serif"
                    >
                      {shortDate}
                    </text>
                  )}
                </g>
              );
            }
          })}
        </svg>
      </div>
    </Card>
  );
}
