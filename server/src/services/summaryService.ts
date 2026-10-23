// 汇总服务：驾驶舱实时统计（P0-1）与全局角标（P0-2）的数据源。
// statusCounts 由「各池各指标最新读数」实时统计，openAlertCount 由未关闭预警计数，
// lastUpdatedAt 取时序表最新 recorded_at —— 全部真实派生，杜绝硬编码。
import type { Database } from "../db/driver.ts";
import type { MetricStatus } from "../../../src/app/data/metrics.ts";
import {
  latestPerMetric,
  mostRecentRecordedAt,
} from "../repositories/waterQualityRepo.ts";
import { listPools } from "../repositories/poolsRepo.ts";
import { countOpen } from "../repositories/alertsRepo.ts";

export interface Summary {
  statusCounts: Record<MetricStatus, number>;
  poolsByStatus: Record<MetricStatus, number>;
  openAlertCount: number;
  lastUpdatedAt: number;
  poolCount: number;
  metricReadingCount: number;
}

const emptyCounts = (): Record<MetricStatus, number> => ({ 正常: 0, 预警: 0, 异常: 0 });

export function getSummary(db: Database, now = Date.now()): Summary {
  const readings = latestPerMetric(db);
  const statusCounts = emptyCounts();
  for (const r of readings) {
    const s = r.status as MetricStatus;
    if (s in statusCounts) statusCounts[s] += 1;
  }

  const pools = listPools(db);
  const poolsByStatus = emptyCounts();
  for (const p of pools) {
    const s = p.status as MetricStatus;
    if (s in poolsByStatus) poolsByStatus[s] += 1;
  }

  return {
    statusCounts,
    poolsByStatus,
    openAlertCount: countOpen(db),
    lastUpdatedAt: mostRecentRecordedAt(db) ?? now,
    poolCount: pools.length,
    metricReadingCount: readings.length,
  };
}
