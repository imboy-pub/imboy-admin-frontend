# Report Backend Go Skeleton (Gin + GORM)

本文档给出 IMBoy 举报中心后端最小可落地实现骨架，目标是尽快打通：

1. APP 端提交举报
2. 管理后台统一举报列表/单条处理/批量处理
3. 兼容前端“统一接口优先 + 分对象接口回退”

## 1. Required Routes

统一路由（优先实现）：

- `POST /adm/report/create`
- `GET /adm/report/list`
- `GET /adm/report/detail/:id`
- `POST /adm/report/resolve`
- `POST /adm/report/batch_resolve`

分对象回退路由（建议做兼容）：

- `GET /adm/group/report/list`
- `POST /adm/group/report/resolve`
- `POST /adm/group/report/batch_resolve`
- `GET /adm/channel/report/list`
- `POST /adm/channel/report/resolve`
- `POST /adm/channel/report/batch_resolve`
- `GET /adm/user/report/list`
- `POST /adm/user/report/resolve`
- `POST /adm/user/report/batch_resolve`

## 2. Domain Constants

```go
package report

type TargetType string

const (
    TargetMoment  TargetType = "moment"
    TargetGroup   TargetType = "group"
    TargetChannel TargetType = "channel"
    TargetUser    TargetType = "user"
)

const (
    StatusPending  = 0 // 待处理
    StatusRejected = 1 // 已驳回
    StatusViolate  = 2 // 违规确认
)
```

## 3. DB Schema (MySQL Example)

```sql
CREATE TABLE `report_ticket` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `target_type` VARCHAR(16) NOT NULL,
  `target_id` BIGINT NOT NULL,
  `reporter_uid` BIGINT NOT NULL,
  `reason` VARCHAR(64) NOT NULL DEFAULT '',
  `description` VARCHAR(512) NOT NULL DEFAULT '',
  `status` TINYINT NOT NULL DEFAULT 0,
  `handled_by` BIGINT NOT NULL DEFAULT 0,
  `handled_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_target_status` (`target_type`,`target_id`,`status`),
  KEY `idx_status_created` (`status`,`created_at`),
  KEY `idx_reporter_created` (`reporter_uid`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `report_action_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `report_id` BIGINT UNSIGNED NOT NULL,
  `operator_uid` BIGINT NOT NULL,
  `result` TINYINT NOT NULL,
  `note` VARCHAR(512) NOT NULL DEFAULT '',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_report_created` (`report_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 4. DTO / Envelope

保持前端已约定的 envelope 结构：

```go
type ApiResp struct {
    Code    int         `json:"code"`
    Msg     string      `json:"msg"`
    Payload interface{} `json:"payload,omitempty"`
}

func Ok(c *gin.Context, payload interface{}) {
    c.JSON(http.StatusOK, ApiResp{Code: 0, Msg: "ok", Payload: payload})
}

func Fail(c *gin.Context, code int, msg string) {
    c.JSON(http.StatusOK, ApiResp{Code: code, Msg: msg})
}
```

## 5. Request / Response Structs

```go
type CreateReportReq struct {
    TargetType  string `json:"target_type" binding:"required,oneof=moment group channel user"`
    TargetID    int64  `json:"target_id" binding:"required,gt=0"`
    Reason      string `json:"reason" binding:"required,max=64"`
    Description string `json:"description" binding:"max=512"`
}

type ListReportReq struct {
    Page       int    `form:"page"`
    Size       int    `form:"size"`
    Status     int    `form:"status"`
    TargetType string `form:"target_type"`
    TargetID   int64  `form:"target_id"`
    ReporterUID int64 `form:"reporter_uid"`
    Keyword    string `form:"keyword"`
}

type ResolveReportReq struct {
    ReportID   int64  `json:"report_id" binding:"required,gt=0"`
    TargetType string `json:"target_type"` // 统一接口可选，分对象接口可忽略
    Result     int    `json:"result" binding:"required,oneof=1 2"`
    Note       string `json:"note" binding:"max=512"`
}

type BatchResolveReq struct {
    ReportIDs  []int64 `json:"report_ids" binding:"required,min=1,max=500,dive,gt=0"`
    TargetType string  `json:"target_type"`
    Result     int     `json:"result" binding:"required,oneof=1 2"`
    Note       string  `json:"note" binding:"max=512"`
}

type BatchResolveResp struct {
    SuccessCount int     `json:"success_count"`
    FailedCount  int     `json:"failed_count"`
    FailedIDs    []int64 `json:"failed_ids"`
}
```

## 6. Router Registration (Gin)

```go
func RegisterReportRoutes(rg *gin.RouterGroup, h *ReportHandler) {
    adm := rg.Group("/adm")
    {
        adm.POST("/report/create", h.Create)
        adm.GET("/report/list", h.List)
        adm.GET("/report/detail/:id", h.Detail)
        adm.POST("/report/resolve", h.Resolve)
        adm.POST("/report/batch_resolve", h.BatchResolve)

        // fallback routes
        adm.GET("/group/report/list", h.ListGroup)
        adm.POST("/group/report/resolve", h.ResolveGroup)
        adm.POST("/group/report/batch_resolve", h.BatchResolveGroup)

        adm.GET("/channel/report/list", h.ListChannel)
        adm.POST("/channel/report/resolve", h.ResolveChannel)
        adm.POST("/channel/report/batch_resolve", h.BatchResolveChannel)

        adm.GET("/user/report/list", h.ListUser)
        adm.POST("/user/report/resolve", h.ResolveUser)
        adm.POST("/user/report/batch_resolve", h.BatchResolveUser)
    }
}
```

## 7. Handler Skeleton

```go
type ReportHandler struct {
    svc ReportService
}

func (h *ReportHandler) List(c *gin.Context) {
    var req ListReportReq
    if err := c.ShouldBindQuery(&req); err != nil {
        Fail(c, 400, "invalid params")
        return
    }
    normalizeListReq(&req) // page/size/status 默认值与边界
    data, err := h.svc.List(c.Request.Context(), req)
    if err != nil {
        Fail(c, 500, err.Error())
        return
    }
    Ok(c, data)
}

func (h *ReportHandler) Resolve(c *gin.Context) {
    var req ResolveReportReq
    if err := c.ShouldBindJSON(&req); err != nil {
        Fail(c, 400, "invalid body")
        return
    }
    operatorUID := CurrentAdminUID(c) // 从会话取管理员 UID
    if err := h.svc.Resolve(c.Request.Context(), req, operatorUID); err != nil {
        Fail(c, 500, err.Error())
        return
    }
    Ok(c, gin.H{})
}

func (h *ReportHandler) BatchResolve(c *gin.Context) {
    var req BatchResolveReq
    if err := c.ShouldBindJSON(&req); err != nil {
        Fail(c, 400, "invalid body")
        return
    }
    operatorUID := CurrentAdminUID(c)
    summary, err := h.svc.BatchResolve(c.Request.Context(), req, operatorUID)
    if err != nil {
        Fail(c, 500, err.Error())
        return
    }
    Ok(c, summary)
}
```

分对象 fallback handler 可以在进入 service 前强制 `req.TargetType`：

- `ListGroup` -> `req.TargetType = "group"`
- `ResolveGroup` -> `req.TargetType = "group"`
- 其它同理

## 8. Service Skeleton

```go
type ReportService interface {
    Create(ctx context.Context, req CreateReportReq, reporterUID int64) error
    List(ctx context.Context, req ListReportReq) (PaginatedReports, error)
    Detail(ctx context.Context, id int64) (ReportTicket, error)
    Resolve(ctx context.Context, req ResolveReportReq, operatorUID int64) error
    BatchResolve(ctx context.Context, req BatchResolveReq, operatorUID int64) (BatchResolveResp, error)
}

func (s *service) BatchResolve(ctx context.Context, req BatchResolveReq, operatorUID int64) (BatchResolveResp, error) {
    out := BatchResolveResp{FailedIDs: make([]int64, 0)}
    for _, id := range dedup(req.ReportIDs) {
        err := s.Resolve(ctx, ResolveReportReq{
            ReportID:   id,
            TargetType: req.TargetType,
            Result:     req.Result,
            Note:       req.Note,
        }, operatorUID)
        if err != nil {
            out.FailedIDs = append(out.FailedIDs, id)
            continue
        }
        out.SuccessCount++
    }
    out.FailedCount = len(out.FailedIDs)
    return out, nil
}
```

生产建议：后续将批量处理优化成事务批量更新 + 并发 worker，避免 N 次单条 SQL。

## 9. Repository Skeleton (GORM)

```go
type ReportTicketModel struct {
    ID         uint64    `gorm:"column:id;primaryKey"`
    TargetType string    `gorm:"column:target_type"`
    TargetID   int64     `gorm:"column:target_id"`
    ReporterUID int64    `gorm:"column:reporter_uid"`
    Reason     string    `gorm:"column:reason"`
    Description string   `gorm:"column:description"`
    Status     int       `gorm:"column:status"`
    HandledBy  int64     `gorm:"column:handled_by"`
    HandledAt  *time.Time `gorm:"column:handled_at"`
    CreatedAt  time.Time `gorm:"column:created_at"`
    UpdatedAt  time.Time `gorm:"column:updated_at"`
}

func (ReportTicketModel) TableName() string { return "report_ticket" }
```

List 查询注意：

1. `status=-1` 表示全部状态，不加 where。
2. `target_type` 必须可控，避免任意字符串注入。
3. `keyword` 仅匹配白名单列（如 `reason`/`description`），禁止拼接 SQL。

## 10. Auth / RBAC

后台处理接口建议要求权限：

- `reports:read`
- `reports:handle`

兼容老权限可暂时映射：

- `moments:report:read` -> `reports:read`
- `moments:report:handle` -> `reports:handle`

## 11. Minimum Smoke

```bash
# list
curl -sS "$BASE/report/list?page=1&size=10&status=-1&target_type=group" -H "Cookie: $COOKIE"

# single resolve
curl -sS -X POST "$BASE/report/resolve" \
  -H 'Content-Type: application/json' -H "Cookie: $COOKIE" \
  -d '{"report_id":1,"target_type":"group","result":1,"note":"probe"}'

# batch resolve
curl -sS -X POST "$BASE/report/batch_resolve" \
  -H 'Content-Type: application/json' -H "Cookie: $COOKIE" \
  -d '{"report_ids":[1,2],"target_type":"group","result":2,"note":"probe"}'
```

## 12. Frontend Alignment Note

当前管理后台前端已实现：

1. `/reports` 统一入口
2. `moment/group/channel/user` 四类工单视图
3. 统一接口优先 + fallback 接口 + 单条回退策略
4. 批量处理结果按 `success_count/failed_count/failed_ids` 消费

后端按本文档落地后即可联调通过。
