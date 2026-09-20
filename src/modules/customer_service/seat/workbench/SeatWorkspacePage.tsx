/**
 * SEAT-02：Web 坐席工作台页面（/customer-service/workspace）。
 *
 * 结构：
 * - 未认证 → QR 扫码登录门（endReason 可解释文案；401 清会话自动回登录）；
 * - 已认证 → 顶栏（组织/工作区切换 + 连接状态 + 退出）+ 三栏工作台
 *   （列表 | 会话 | 详情）；窄屏（<md）列表/会话分屏导航，1280/1440 不溢出；
 * - 六态（A06）：loading/error/empty/offline/retry/permission denied 全覆盖；
 * - aria-live 区域播报 claim 冲突/接单结果/写入口收回（A05 可达性）；
 * - 全部读取是权威刷新（react-query），SSE 只触发失效（A02 无重复渲染）。
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LogOut, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeatQrLoginPanel } from "./seatQrLoginPanel";
import { SeatQueuePanel } from "./queuePanel";
import { SeatSessionView } from "./sessionView";
import { SeatDetailPanel } from "./detailPanel";
import {
  SeatErrorState,
  SeatLoadingState,
  SeatOfflineBanner,
  SeatPermissionDeniedState,
  seatFailureMessage,
} from "./states";
import {
  SeatWorkbenchProvider,
  type SeatWorkbenchGateway,
  isSeatUnauthorized,
  seatFailureKind,
  useSeatClaim,
  useSeatClose,
  useSeatContexts,
  useSeatEventStream,
  useSeatMessages,
  useSeatScopeSelection,
  useSeatSend,
  useSeatSessionDetail,
  useSeatSessionViews,
  useSeatTransfer,
  useSeatTransferTargets,
  useSeatWorkbenchGateway,
} from "./workbenchHooks";
import { establishSeatSession, useSeatAuthStore } from "../seatAuthStore";
import { QrLoginSession, type QrLoginEndReason } from "../qrLoginSession";
import type { SeatSessionEndReason } from "../types";
import type { SeatSessionSummary } from "./contract";
import type { SeatViewStatus } from "./workbenchHooks";

const END_REASON_NOTICE: Record<
  SeatSessionEndReason | QrLoginEndReason,
  string
> = {
  expired: "登录二维码已过期，请重新扫码",
  cancelled: "登录已被取消，请重新扫码",
  unauthorized: "登录状态已失效，请重新扫码",
  forbidden: "当前账号没有坐席权限（未分配或已停用）",
  logout: "已退出坐席工作台",
};

/** DF-12：aria-live 播报区常驻外壳——撤权等状态播报不随复核换页（拒权/
 * 错误态）被卸载；notice 为 null 时区域仍挂载，保证后续播报可达。 */
function SeatShell({
  notice,
  children,
}: {
  notice: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div
        role="status"
        aria-live="polite"
        className="sr-only"
        data-testid="seat-live-region"
      >
        {notice}
      </div>
      {children}
    </div>
  );
}

/** 登录门 + 工作台外壳（Provider 内消费 gateway；gateway 可注入供测试）。 */
export function SeatWorkspacePage({
  gateway,
}: {
  gateway?: SeatWorkbenchGateway;
}) {
  return (
    <SeatWorkbenchProvider gateway={gateway}>
      <SeatWorkspaceInner />
    </SeatWorkbenchProvider>
  );
}

function SeatWorkspaceInner() {
  const status = useSeatAuthStore((state) => state.status);
  const endReason = useSeatAuthStore((state) => state.endReason);
  const clearSession = useSeatAuthStore((state) => state.clearSession);
  const { api, fetchImpl } = useSeatWorkbenchGateway();

  const contextsQuery = useSeatContexts();
  const scope = useSeatScopeSelection(contextsQuery.data);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [viewStatus, setViewStatus] = useState<SeatViewStatus>("queued");
  const [pane, setPane] = useState<"list" | "conversation">("list");

  const views = useSeatSessionViews(scope.organizationId, scope.workspaceId);
  const stream = useSeatEventStream(scope.organizationId, scope.workspaceId);
  const detailQuery = useSeatSessionDetail(
    scope.organizationId,
    selectedSessionId,
  );
  const detail = detailQuery.data ?? null;

  const conversationId = detail?.conversationId ?? null;
  const messagesQuery = useSeatMessages(scope.organizationId, conversationId);
  const send = useSeatSend(scope.organizationId, conversationId);
  const claim = useSeatClaim(scope.organizationId);
  const transfer = useSeatTransfer(scope.organizationId, selectedSessionId);
  const close = useSeatClose(scope.organizationId, selectedSessionId);
  const transferTargetsQuery = useSeatTransferTargets(
    scope.organizationId,
    scope.canWrite &&
      !stream.writeRevoked &&
      detail !== null &&
      detail.status !== "closed",
  );

  // aria-live 播报是派生值（事件驱动的状态变化本身即文案来源，A05）。
  const liveNotice =
    claim.conflict !== null
      ? "该会话已被其他坐席接单，列表已刷新"
      : stream.writeRevoked
        ? "坐席已暂停或离岗，写入口已收回"
        : null;

  // 401 → 清会话回登录（任何权威读取撞 401 都收敛到登录门）。
  useEffect(() => {
    const errors = [
      contextsQuery.error,
      views.queued.error,
      detailQuery.error,
      messagesQuery.error,
      send.error,
      claim.error,
      transfer.error,
      close.error,
    ];
    if (
      errors.some(
        (error) =>
          error !== null && error !== undefined && isSeatUnauthorized(error),
      )
    ) {
      clearSession("unauthorized");
    }
  }, [
    contextsQuery.error,
    views.queued.error,
    detailQuery.error,
    messagesQuery.error,
    send.error,
    claim.error,
    transfer.error,
    close.error,
    clearSession,
  ]);

  const contextsState = contextsQuery.status;
  const contextsFailure = seatFailureKind(contextsQuery.error);

  const handleClaim = (session: SeatSessionSummary) => {
    claim.mutate({ sessionId: session.id, expectedVersion: session.version });
  };

  const writeClosedReason = useMemo(() => {
    if (stream.writeRevoked) return "坐席已暂停或离岗，回复与操作已收回";
    if (!scope.canWrite) return "当前组织未开通会话写权限";
    if (detail === null) return null;
    if (detail.status === "queued") return "接单后可回复";
    if (detail.status === "closed") return "会话已结束";
    if (
      scope.myIdentityId !== null &&
      detail.businessIdentityId !== null &&
      detail.businessIdentityId !== scope.myIdentityId
    ) {
      return "该会话由其他坐席处理中";
    }
    return null;
  }, [stream.writeRevoked, scope.canWrite, scope.myIdentityId, detail]);

  const canWriteNow = writeClosedReason === null;

  if (status !== "authenticated") {
    return (
      <SeatShell notice={liveNotice}>
        <SeatQrLoginPanel
          createSession={(callbacks) =>
            new QrLoginSession({ client: api.client, fetchImpl, callbacks })
          }
          onConfirmed={(token) => {
            establishSeatSession(token, null);
          }}
          onEnded={() => {
            /* endReason 已入 store；页面据此显示可解释文案。 */
          }}
          notice={endReason !== null ? END_REASON_NOTICE[endReason] : null}
        />
      </SeatShell>
    );
  }

  if (contextsState === "pending") {
    return (
      <SeatShell notice={liveNotice}>
        <div className="flex min-h-screen items-center justify-center bg-background">
          <SeatLoadingState
            message="加载坐席上下文…"
            testId="seat-contexts-loading"
          />
        </div>
      </SeatShell>
    );
  }

  if (contextsFailure === "forbidden") {
    return (
      <SeatShell notice={liveNotice}>
        <div className="flex min-h-screen items-center justify-center bg-background">
          <SeatPermissionDeniedState
            message="当前账号没有可用坐席上下文（未分配或坐席已停用）"
            testId="seat-permission-denied"
          />
        </div>
      </SeatShell>
    );
  }

  if (contextsFailure !== null) {
    return (
      <SeatShell notice={liveNotice}>
        <div className="flex min-h-screen items-center justify-center bg-background">
          <SeatErrorState
            message={seatFailureMessage(contextsFailure) ?? "加载失败"}
            onRetry={() => void contextsQuery.refetch()}
            testId="seat-contexts-error"
          />
        </div>
      </SeatShell>
    );
  }

  if (scope.context === null || scope.workspaceId === null) {
    return (
      <SeatShell notice={liveNotice}>
        <div className="flex min-h-screen items-center justify-center bg-background">
          <SeatPermissionDeniedState
            message="没有已启用的坐席上下文，请联系管理员开通"
            testId="seat-contexts-empty"
          />
        </div>
      </SeatShell>
    );
  }

  return (
    <SeatShell notice={liveNotice}>
      <div
        className="flex h-screen flex-col bg-background text-foreground"
        data-testid="seat-workspace"
      >
        {stream.status === "offline" && (
          <SeatOfflineBanner onRetry={stream.retry} />
        )}
        <header className="flex items-center gap-3 border-b border-border px-4 py-2">
          <h1 className="text-sm font-semibold">坐席工作台</h1>
          <div className="ml-2 flex items-center gap-2">
            <label className="sr-only" htmlFor="seat-org-select">
              选择组织
            </label>
            <select
              id="seat-org-select"
              data-testid="seat-org-select"
              className="max-w-[10rem] rounded border border-border bg-background px-2 py-1 text-sm"
              value={scope.organizationId ?? ""}
              onChange={(event) => {
                scope.selectOrganization(event.target.value);
                setSelectedSessionId(null);
              }}
            >
              {(contextsQuery.data ?? []).map((ctx) => (
                <option key={ctx.organizationId} value={ctx.organizationId}>
                  {ctx.organizationName}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="seat-ws-select">
              选择工作区
            </label>
            <select
              id="seat-ws-select"
              data-testid="seat-ws-select"
              className="max-w-[10rem] rounded border border-border bg-background px-2 py-1 text-sm"
              value={scope.workspaceId ?? ""}
              onChange={(event) => {
                scope.selectWorkspace(event.target.value);
                setSelectedSessionId(null);
              }}
            >
              {(scope.context?.workspaces ?? []).map((ws) => (
                <option key={ws.id} value={ws.id}>
                  {ws.name}
                </option>
              ))}
            </select>
          </div>
          <span
            className="ml-auto flex items-center gap-1 text-xs text-muted-foreground"
            data-testid="seat-connection-status"
          >
            <Radio
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${stream.status === "online" ? "text-emerald-600" : "text-muted-foreground"}`}
            />
            {stream.status === "online"
              ? "实时连接正常"
              : stream.status === "offline"
                ? "连接断开"
                : stream.status === "reconnecting"
                  ? "重连中…"
                  : "连接中…"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => clearSession("logout")}
            data-testid="seat-logout"
          >
            <LogOut aria-hidden="true" className="mr-1 h-3.5 w-3.5" />
            退出
          </Button>
        </header>

        {/* 窄屏分屏导航 */}
        <nav
          aria-label="面板切换"
          className="flex border-b border-border md:hidden"
        >
          {(["list", "conversation"] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={pane === key}
              data-testid={`seat-pane-${key}`}
              onClick={() => setPane(key)}
              className={`flex-1 px-3 py-2 text-sm ${pane === key ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
            >
              {key === "list" ? "会话列表" : "对话"}
            </button>
          ))}
        </nav>

        <main className="grid min-h-0 flex-1 md:grid-cols-[17rem_minmax(0,1fr)_17rem]">
          <div
            className={`${pane === "list" ? "flex" : "hidden"} min-h-0 flex-col md:flex`}
            data-testid="seat-pane-list"
          >
            <SeatQueuePanel
              viewStatus={viewStatus}
              onViewStatusChange={setViewStatus}
              counts={views.counts}
              views={views}
              selectedSessionId={selectedSessionId}
              onSelectSession={(session) => {
                setSelectedSessionId(session.id);
                setPane("conversation");
              }}
              onClaim={handleClaim}
              claimPendingSessionId={
                claim.isPending ? (claim.variables?.sessionId ?? null) : null
              }
              claimDisabled={!scope.canWrite || stream.writeRevoked}
              claimDisabledReason={writeClosedReason ?? "当前不可接单"}
            />
          </div>
          <div
            className={`${pane === "conversation" ? "flex" : "hidden"} min-h-0 flex-col md:flex`}
            data-testid="seat-pane-conversation"
          >
            <SeatSessionView
              orgId={scope.organizationId ?? ""}
              detail={detail}
              messages={messagesQuery.data ?? []}
              messagesLoading={messagesQuery.isLoading}
              messagesError={messagesQuery.error}
              onRetryMessages={() => void messagesQuery.refetch()}
              canWrite={canWriteNow}
              writeClosedReason={writeClosedReason}
              onSend={send.send}
              onRetrySend={send.retry}
              sendError={send.error}
              sending={send.sending}
            />
          </div>
          <div
            className="hidden min-h-0 md:flex"
            data-testid="seat-pane-detail"
          >
            <SeatDetailPanel
              detail={detail}
              detailLoading={detailQuery.isLoading}
              detailError={detailQuery.error}
              onRetryDetail={() => void detailQuery.refetch()}
              canWrite={canWriteNow}
              writeClosedReason={writeClosedReason}
              transferTargets={transferTargetsQuery.data ?? null}
              transferTargetsLoading={transferTargetsQuery.isLoading}
              onTransfer={(toIdentityId, expectedVersion) => {
                transfer.mutate({ toIdentityId, expectedVersion });
              }}
              transferConflict={transfer.conflict}
              transferPending={transfer.isPending}
              onClose={(expectedVersion) => {
                close.mutate({ expectedVersion });
              }}
              closeConflict={close.conflict}
              closePending={close.isPending}
            />
          </div>
        </main>
      </div>
    </SeatShell>
  );
}
