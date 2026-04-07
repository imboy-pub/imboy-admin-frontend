/**
 * TSID 或 hashids 编码的实体 ID。
 *
 * 后端 TSID 为 64 位 BIGINT，最大值 2^63-1 (19 位十进制)，
 * 超出 JavaScript Number.MAX_SAFE_INTEGER (2^53-1)。
 * 统一用 string 传输，避免 JSON 解析精度丢失。
 *
 * 迁移过渡期:
 * - 新接口: TSID 数字，后端以字符串形式返回
 * - 旧接口: hashids 编码字符串 (如 "522dzx")
 */
export type EntityId = string
