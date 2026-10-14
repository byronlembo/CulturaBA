import postgres, { type Sql, type TransactionSql } from 'postgres';

export type Db = Sql;
export type Tx = TransactionSql;
/** Cualquier cosa sobre la que se pueda ejecutar SQL: conexión, pool o transacción. */
export type Queryable = Sql | TransactionSql;

export function createSql(url: string, options: { max?: number } = {}): Sql {
  return postgres(url, {
    max: options.max ?? 2,
    // Compatible con el transaction pooler de Supabase (sin prepared statements).
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
    transform: { undefined: null },
  });
}
