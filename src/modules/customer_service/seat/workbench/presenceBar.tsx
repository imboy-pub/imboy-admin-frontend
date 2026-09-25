/**
 * CS-WEB-05（CS-RUNTIME-03）：坐席 presence 状态条。
 *
 * 诚实原则：状态是**服务端派生事实**（heartbeat/presence 返回），本组件
 * 只展示；查询失败（401/403/网络）时显示「状态不可用」——绝不用本地乐观
 * 状态顶替（断网时不得显示 online）。手动 away/clear 经 mutation 回填。
 *
 * 可访问性：文本 + 图标 + aria-pressed 双通道（不只靠颜色）；SR 文案含
 * 「运行状态」前缀。
 */
import { Coffee, CircleDot, Gauge, CircleSlash, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SeatPresence, SeatPresenceStatus } from "./workbenchApi";

const STATUS_META: Record<
  SeatPresenceStatus,
  { label: string; icon: typeof CircleDot; className: string }
> = {
  online: { label: "在线", icon: CircleDot, className: "text-emerald-600" },
  away: { label: "离开", icon: Coffee, className: "text-amber-600" },
  busy: { label: "忙碌", icon: Gauge, className: "text-orange-600" },
  offline: { label: "离线", icon: CircleSlash, className: "text-muted-foreground" },
};

export function SeatPresenceBar({
  presence,
  isLoading,
  error,
  onSetManualStatus,
  manualPending,
}: {
  presence: SeatPresence | undefined;
  isLoading: boolean;
  error: unknown;
  onSetManualStatus: (_manual: "away" | null) => void;
  manualPending: boolean;
}) {
  if (error !== null && error !== undefined) {
    // 降级：无服务端事实就不显示运行态（诚实原则）。
    return (
      <span
        className="flex items-center gap-1 text-xs text-muted-foreground"
        data-testid="seat-presence-unavailable"
      >
        <CircleSlash aria-hidden="true" className="h-3.5 w-3.5" />
        状态不可用
      </span>
    );
  }
  if (isLoading || presence === undefined) {
    return (
      <span
        className="flex items-center gap-1 text-xs text-muted-foreground"
        data-testid="seat-presence-loading"
      >
        <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
        状态加载中…
      </span>
    );
  }
  const meta = STATUS_META[presence.status];
  const Icon = meta.icon;
  return (
    <span className="flex items-center gap-1" data-testid="seat-presence-bar">
      <span
        className={`flex items-center gap-1 text-xs font-medium ${meta.className}`}
        data-testid={`seat-presence-status-${presence.status}`}
      >
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        {meta.label}
        <span className="sr-only">
          （运行状态：{meta.label}
          {presence.activeCount}/{presence.maxConcurrent} 会话）
        </span>
      </span>
      {presence.manualStatus === "away" ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={manualPending}
          aria-pressed="true"
          data-testid="seat-presence-resume"
          onClick={() => onSetManualStatus(null)}
        >
          恢复自动
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={manualPending}
          aria-pressed="false"
          data-testid="seat-presence-away"
          onClick={() => onSetManualStatus("away")}
        >
          设为离开
        </Button>
      )}
    </span>
  );
}
