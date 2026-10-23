// 数据库驱动适配层：全项目唯一直接依赖 node:sqlite 的地方。
// 对外暴露稳定接口（openDb / prepare / run / get / all / exec / close），
// 日后若要替换为 better-sqlite3 / libSQL，只需改本文件，仓储层零改动。
//
// 选用 node:sqlite 的原因：Node ≥22.5 内建（≥23.4 免 flag），零原生编译，
// 保证「clone 即低摩擦运行」（否决需 node-gyp 的 better-sqlite3）。

import { DatabaseSync } from "node:sqlite";

// node:sqlite 支持的绑定值类型（不支持 boolean，故此处排除）。
export type SqlParam = string | number | bigint | Uint8Array | null;

// 查询返回的行：列名 → 值。
export type Row = Record<string, SqlParam>;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface PreparedStatement {
  run(...params: SqlParam[]): RunResult;
  get(...params: SqlParam[]): Row | undefined;
  all(...params: SqlParam[]): Row[];
}

export interface Database {
  prepare(sql: string): PreparedStatement;
  exec(sql: string): void;
  close(): void;
}

// 打开（或创建）数据库文件；filename 传 ":memory:" 可用于测试。
export function openDb(filename: string): Database {
  const db = new DatabaseSync(filename);
  return {
    prepare(sql: string): PreparedStatement {
      const stmt = db.prepare(sql);
      return {
        run(...params: SqlParam[]): RunResult {
          const result = stmt.run(...params);
          return {
            changes: Number(result.changes),
            lastInsertRowid: Number(result.lastInsertRowid),
          };
        },
        get(...params: SqlParam[]): Row | undefined {
          return stmt.get(...params) as unknown as Row | undefined;
        },
        all(...params: SqlParam[]): Row[] {
          return stmt.all(...params) as unknown as Row[];
        },
      };
    },
    exec(sql: string): void {
      db.exec(sql);
    },
    close(): void {
      db.close();
    },
  };
}
