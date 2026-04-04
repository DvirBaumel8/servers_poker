import type { ValueTransformer } from "typeorm";

/** TypeORM column transformer for NOT NULL bigint columns. DB stores string; TypeScript uses bigint.
 * Handles null gracefully for LEFT JOIN empty rows (TypeORM applies transformer before discarding null rows). */
export const bigIntTransformer: ValueTransformer = {
  to: (value: bigint): string => value.toString(),
  from: (value: string | null): bigint => (value == null ? 0n : BigInt(value)),
};

/** TypeORM column transformer for nullable bigint columns. */
export const bigIntNullableTransformer: ValueTransformer = {
  to: (value: bigint | null | undefined): string | null =>
    value == null ? null : value.toString(),
  from: (value: string | null | undefined): bigint | null =>
    value == null ? null : BigInt(value),
};
