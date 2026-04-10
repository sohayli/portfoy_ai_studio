import { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Layers } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';

interface TreemapProps {
  data: {
    name: string;
    value: number;
    color: string;
    percentage: number;
  }[];
}

export function Treemap({ data }: TreemapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || data.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = 400;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const root = d3.hierarchy({ children: data } as any)
      .sum((d: any) => d.value)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    d3.treemap()
      .size([width, height])
      .padding(2)
      .round(true)(root);

    const leaf = svg.selectAll("g")
      .data(root.leaves())
      .join("g")
      .attr("transform", (d: any) => `translate(${d.x0},${d.y0})`);

    leaf.append("rect")
      .attr("width", (d: any) => d.x1 - d.x0)
      .attr("height", (d: any) => d.y1 - d.y0)
      .attr("fill", (d: any) => d.data.color)
      .attr("rx", 4)
      .attr("opacity", 0.9)
      .on("mouseenter", function() { d3.select(this).attr("opacity", 1); })
      .on("mouseleave", function() { d3.select(this).attr("opacity", 0.9); });

    leaf.append("text")
      .attr("x", 5)
      .attr("y", 15)
      .attr("fill", "white")
      .attr("font-size", "12px")
      .attr("font-weight", "bold")
      .text((d: any) => (d.x1 - d.x0 > 40 && d.y1 - d.y0 > 20) ? (d.data as any).name : "");

    leaf.append("text")
      .attr("x", 5)
      .attr("y", 30)
      .attr("fill", "white")
      .attr("font-size", "10px")
      .attr("opacity", 0.9)
      .text((d: any) => (d.x1 - d.x0 > 60 && d.y1 - d.y0 > 40) ? formatCurrency((d.data as any).value) : "");

    leaf.append("text")
      .attr("x", 5)
      .attr("y", 45)
      .attr("fill", "white")
      .attr("font-size", "10px")
      .attr("font-weight", "bold")
      .text((d: any) => {
        if (d.x1 - d.x0 > 60 && d.y1 - d.y0 > 55) {
          const p = (d.data as any).percentage;
          return `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`;
        }
        return "";
      });

  }, [data]);

  return (
    <div ref={containerRef} className="w-full bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 transition-colors">
      <div className="flex items-center gap-2 mb-4">
        <Layers className="w-4 h-4 text-indigo-600" />
        <h3 className="font-bold text-slate-900 dark:text-white">Asset Allocation</h3>
      </div>
      {data.length > 0 ? (
        <svg ref={svgRef} width="100%" height="400" className="rounded-lg overflow-hidden" />
      ) : (
        <div className="h-[400px] flex items-center justify-center text-slate-400 italic">
          No data to visualize
        </div>
      )}
    </div>
  );
}
