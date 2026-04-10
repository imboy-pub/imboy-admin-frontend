/**
 * TSID 实体 ID。
 *
 * 后端 TSID 为 64 位 BIGINT，最大值 2^63-1 (19 位十进制)，
 * 超出 JavaScript Number.MAX_SAFE_INTEGER (2^53-1)。
 * 统一用 string 传输，避免 JSON 解析精度丢失。
 */
export type EntityId = string
