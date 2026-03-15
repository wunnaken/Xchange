"use client";

import { useEffect, useRef } from "react";

export type CandlestickPoint = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const CHART_BG = "#0F1520";
const GRID_COLOR = "rgba(255,255,255,0.06)";
const TEXT_COLOR = "#71717a";
const LINE_UP = "#22c55e";
const LINE_DOWN = "#ef4444";

type CandlestickChartProps = {
  data: CandlestickPoint[];
  showVolume?: boolean;
  height?: number;
  className?: string;
};

type UTCTimestamp = number;
type LinePoint = { time: UTCTimestamp; value: number };

function toLineData(data: CandlestickPoint[]): LinePoint[] {
  return data.map((d) => ({
    time: d.time as UTCTimestamp,
    value: d.close,
  }));
}

export function CandlestickChart({
  data,
  showVolume = false,
  height = 320,
  className = "",
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<{ remove: () => void; resize: (w: number, h: number) => void; timeScale: () => { fitContent: () => void } } | null>(null);
  const lineSeriesRef = useRef<{ setData: (d: LinePoint[]) => void; applyOptions?: (opts: unknown) => void } | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const lineColor = data.length >= 2 && data[data.length - 1].close >= data[0].close ? LINE_UP : LINE_DOWN;

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current || data.length === 0) return;

    cleanupRef.current?.();
    let cancelled = false;
    const container = containerRef.current;

    void import("lightweight-charts").then((mod) => {
      const { createChart, LineSeries } = mod;
      if (cancelled || !containerRef.current) return;

      const w = container.clientWidth || 400;
      const h = height;
      const chart = createChart(container, {
        layout: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lightweight-charts ColorType accepts "solid" at runtime
          background: { type: "solid", color: CHART_BG } as any,
          textColor: TEXT_COLOR,
          fontFamily: "system-ui, sans-serif",
        },
        grid: {
          vertLines: { color: GRID_COLOR },
          horzLines: { color: GRID_COLOR },
        },
        width: w,
        height: h,
        autoSize: true,
        rightPriceScale: {
          borderColor: GRID_COLOR,
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: {
          borderColor: GRID_COLOR,
          timeVisible: true,
          secondsVisible: false,
        },
        crosshair: {
          vertLine: { labelBackgroundColor: "#0F1520" },
          horzLine: { labelBackgroundColor: "#0F1520" },
        },
      });

      const lineSeries = chart.addSeries(LineSeries, {
        color: lineColor,
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: true,
      });
      lineSeriesRef.current = lineSeries as unknown as { setData: (d: LinePoint[]) => void; applyOptions?: (opts: unknown) => void };
      lineSeries.setData(toLineData(data) as never);

      chart.timeScale().fitContent();

      const handleResize = () => {
        if (containerRef.current && chartRef.current) {
          chartRef.current.resize(containerRef.current.clientWidth, height);
        }
      };
      window.addEventListener("resize", handleResize);
      chartRef.current = chart;

      cleanupRef.current = () => {
        window.removeEventListener("resize", handleResize);
        chart.remove();
        chartRef.current = null;
        lineSeriesRef.current = null;
        cleanupRef.current = null;
      };
    });

    return () => {
      cancelled = true;
      cleanupRef.current?.();
    };
  }, [data.length, height, lineColor]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (data.length === 0) return;
    const color = data.length >= 2 && data[data.length - 1].close >= data[0].close ? LINE_UP : LINE_DOWN;
    lineSeriesRef.current?.setData(toLineData(data));
    lineSeriesRef.current?.applyOptions?.({ color });
    chartRef.current?.timeScale().fitContent();
  }, [data]);

  if (data.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ minHeight: `${height}px`, height: `${height}px`, width: "100%", position: "relative" }}
    />
  );
}
