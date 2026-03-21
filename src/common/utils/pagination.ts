import { PaginatedResponse } from "../dto/pagination.dto";

/**
 * Converts a list of items to a paginated response.
 * Centralizes the pagination response structure to avoid duplication.
 *
 * @example
 * const [items, total] = await this.repo.findAndCount({ take: limit, skip: offset });
 * return toPaginatedResponse(items, total, limit, offset, this.toResponseDto);
 */
export function toPaginatedResponse<T, R>(
  items: T[],
  total: number,
  limit: number,
  offset: number,
  mapper: (item: T) => R,
): PaginatedResponse<R> {
  return {
    data: items.map(mapper),
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  };
}

/**
 * Simple version without mapping for when entity === response.
 */
export function toPaginatedResponseRaw<T>(
  items: T[],
  total: number,
  limit: number,
  offset: number,
): PaginatedResponse<T> {
  return {
    data: items,
    total,
    limit,
    offset,
    hasMore: offset + items.length < total,
  };
}
