// Minimal local types for better-sqlite3 13, which ships no TypeScript
// declarations. Only what src/main actually calls is declared; widen this as
// the SQLite milestone needs more (or replace it with a maintained types
// package once one matching v13 is chosen and approved).

declare module "better-sqlite3" {
  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface Statement {
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): RunResult;
  }

  interface DatabaseOptions {
    readonly?: boolean;
    fileMustExist?: boolean;
  }

  interface BackupProgress {
    totalPages: number;
    remainingPages: number;
  }

  class Database {
    constructor(filename: string, options?: DatabaseOptions);
    prepare(sql: string): Statement;
    exec(sql: string): this;
    pragma(source: string, options?: { simple?: boolean }): unknown;
    transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R;
    backup(
      destination: string,
      options?: { progress?: (info: BackupProgress) => number }
    ): Promise<BackupProgress>;
    close(): this;
  }

  export = Database;
}
