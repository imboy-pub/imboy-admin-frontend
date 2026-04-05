import fs from 'node:fs'
import path from 'node:path'
import { test } from '@playwright/test'

export type ReportTargetType = 'group' | 'channel' | 'user'
export type ReportMutationResult = 'reject' | 'violation'

type ScenarioManifest = {
  version?: number
  scenarios?: Record<string, unknown>
}

type ReportResolveFixture = {
  scenarioId: string
  reportId: string
  targetId?: string
  expectedResult: ReportMutationResult
}

type ReportBatchFixture = {
  scenarioId: string
  reportIds: string[]
  targetId?: string
  expectedResult: ReportMutationResult
}

type ChannelGovernanceFixture = {
  scenarioId: string
  channelId: string
  pinMessageId?: string
  deleteMessageId?: string
}

const REPORT_RESOLVE_SCENARIO_ID = 'adm_e2e_02_report_center_resolve'
const REPORT_BATCH_SCENARIO_ID = 'adm_e2e_03_report_center_batch'
const CHANNEL_GOVERNANCE_SCENARIO_ID = 'adm_e2e_05_channel_message_govern'

let cachedManifestPath: string | null | undefined
let cachedManifest: ScenarioManifest | null | undefined

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value && value.length > 0 ? value : undefined
}

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? value as Record<string, unknown>
    : {}
}

function normalizeId(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value))
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }

  return undefined
}

function normalizeIdList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.map((item) => normalizeId(item)).filter((item): item is string => Boolean(item)))
    )
  }

  if (typeof value === 'string') {
    return Array.from(
      new Set(
        value
          .split(',')
          .map((item) => normalizeId(item))
          .filter((item): item is string => Boolean(item))
      )
    )
  }

  return []
}

function normalizeExpectedResult(value: unknown): ReportMutationResult {
  if (typeof value === 'number') {
    return value === 2 ? 'violation' : 'reject'
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (
      normalized === '2' ||
      normalized === 'violation' ||
      normalized === 'confirm_violation' ||
      normalized === 'confirm-violation'
    ) {
      return 'violation'
    }
  }

  return 'reject'
}

function resolveManifestPath(): string | null {
  if (cachedManifestPath !== undefined) {
    return cachedManifestPath
  }

  const rawPath = readEnv('IMBOY_TEST_SCENARIO_MANIFEST') || readEnv('IMBOY_ADMIN_E2E_SCENARIO_MANIFEST')
  if (!rawPath) {
    cachedManifestPath = null
    return cachedManifestPath
  }

  cachedManifestPath = path.isAbsolute(rawPath)
    ? rawPath
    : path.resolve(process.cwd(), rawPath)
  return cachedManifestPath
}

function loadManifest(): ScenarioManifest | null {
  if (cachedManifest !== undefined) {
    return cachedManifest
  }

  const manifestPath = resolveManifestPath()
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    cachedManifest = null
    return cachedManifest
  }

  const raw = fs.readFileSync(manifestPath, 'utf8')
  cachedManifest = JSON.parse(raw) as ScenarioManifest
  return cachedManifest
}

function requireScenarioRecord(scenarioId: string): Record<string, unknown> {
  const manifest = loadManifest()
  test.skip(
    !manifest,
    `需要提供 IMBOY_TEST_SCENARIO_MANIFEST，并在其中准备场景 ${scenarioId} 的固定数据`
  )

  const scenarios = toRecord(manifest?.scenarios)
  const scenario = toRecord(scenarios[scenarioId])
  test.skip(
    Object.keys(scenario).length === 0,
    `场景清单缺少 ${scenarioId} 配置`
  )
  return scenario
}

export function requireReportResolveFixture(targetType: ReportTargetType): ReportResolveFixture {
  const scenario = requireScenarioRecord(REPORT_RESOLVE_SCENARIO_ID)
  const targetConfig = toRecord(scenario[targetType])
  const reportId = normalizeId(targetConfig.reportId)

  test.skip(
    !reportId,
    `场景 ${REPORT_RESOLVE_SCENARIO_ID} 缺少 ${targetType}.reportId`
  )

  return {
    scenarioId: REPORT_RESOLVE_SCENARIO_ID,
    reportId: reportId as string,
    targetId: normalizeId(targetConfig.targetId),
    expectedResult: normalizeExpectedResult(targetConfig.expectedResult),
  }
}

export function requireReportBatchFixture(targetType: ReportTargetType): ReportBatchFixture {
  const scenario = requireScenarioRecord(REPORT_BATCH_SCENARIO_ID)
  const targetConfig = toRecord(scenario[targetType])
  const reportIds = normalizeIdList(targetConfig.reportIds)

  test.skip(
    reportIds.length === 0,
    `场景 ${REPORT_BATCH_SCENARIO_ID} 缺少 ${targetType}.reportIds`
  )

  return {
    scenarioId: REPORT_BATCH_SCENARIO_ID,
    reportIds,
    targetId: normalizeId(targetConfig.targetId),
    expectedResult: normalizeExpectedResult(targetConfig.expectedResult),
  }
}

export function requireChannelGovernanceFixture(): ChannelGovernanceFixture {
  const scenario = requireScenarioRecord(CHANNEL_GOVERNANCE_SCENARIO_ID)
  const channelId = normalizeId(scenario.channelId) || readEnv('IMBOY_ADMIN_E2E_CHANNEL_ID')
  const pinMessageId = normalizeId(scenario.pinMessageId)
  const deleteMessageId = normalizeId(scenario.deleteMessageId)

  test.skip(
    !channelId,
    `场景 ${CHANNEL_GOVERNANCE_SCENARIO_ID} 缺少 channelId，且未提供 IMBOY_ADMIN_E2E_CHANNEL_ID`
  )

  return {
    scenarioId: CHANNEL_GOVERNANCE_SCENARIO_ID,
    channelId: channelId as string,
    pinMessageId,
    deleteMessageId,
  }
}
