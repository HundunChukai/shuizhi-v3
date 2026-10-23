"use client";

// C6：数据源开关。演示(demo) / 实时(live) 切换 + 当前取数来源 chip。
//  - demo（默认）：后端在时走真实链路（配合 POST /api/demo/scenario + 读 API），不可达则用内置模拟数据。
//  - live：只读 /api/*（数据来自 POST /api/sensor-data），15s 轮询；不可达自动降级到内置模拟。
// source 由调用页传入（该页 latest/summary 的实际取数结果），用于 chip 文案，不在此处自行发请求。
import { useData } from "@/app/components/DataContext";
import type { DataKind } from "@/app/components/useApiData";

export function DataSourceToggle({
  source,
  className = "",
}: {
  source?: DataKind;
  className?: string;
}) {
  const { dataSource, setDataSource } = useData();
  const live = dataSource === "live";

  // chip：live+api=实时数据；demo+api=演示数据(后端链路)；任一模式 api 不可达=内置模拟数据。
  const chip =
    source === "api"
      ? live
        ? { text: "实时数据", cls: "border-emerald-300/30 bg-emerald-300/10 text-emerald-200" }
        : { text: "演示数据 · 后端链路", cls: "border-cyan-300/30 bg-cyan-300/10 text-cyan-200" }
      : { text: "内置模拟数据", cls: "border-white/15 bg-white/[0.05] text-[#d7e2ea]/60" };

  const baseBtn =
    "rounded-lg border px-4 py-2 text-sm font-medium transition-colors";
  const idleBtn = `${baseBtn} border-white/10 bg-white/[0.03] text-[#d7e2ea]/65`;

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDataSource("demo")}
          aria-pressed={!live}
          className={
            !live
              ? `${baseBtn} border-cyan-300/35 bg-cyan-300/10 text-cyan-200`
              : `${idleBtn} hover:border-cyan-300/30 hover:text-cyan-200`
          }
        >
          演示数据源
        </button>
        <button
          type="button"
          onClick={() => setDataSource("live")}
          aria-pressed={live}
          className={
            live
              ? `${baseBtn} border-emerald-300/35 bg-emerald-300/10 text-emerald-200`
              : `${idleBtn} hover:border-emerald-300/30 hover:text-emerald-200`
          }
        >
          实时数据源
        </button>
      </div>
      <span
        className={`rounded-full border px-3 py-1 text-xs font-medium ${chip.cls}`}
      >
        {chip.text}
      </span>
    </div>
  );
}
