import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  createAnnouncement,
  updateAnnouncement,
  type Announcement,
  type AnnouncementType,
  type AnnouncementFormData,
} from '@/services/api/announcements'

const TYPE_OPTIONS: { value: AnnouncementType; label: string; description: string }[] = [
  { value: 'info', label: '通知', description: '普通通知公告' },
  { value: 'warning', label: '警告', description: '重要提醒公告' },
  { value: 'important', label: '重要', description: '强制阅读公告' },
]

type Props = {
  item: Announcement | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function AnnouncementFormDialog({ item, open, onOpenChange, onSuccess }: Props) {
  const isEdit = item !== null
  const [title, setTitle] = useState(item?.title ?? '')
  const [body, setBody] = useState(item?.body ?? '')
  const [type, setType] = useState<AnnouncementType>(item?.type ?? 'info')
  const [pinned, setPinned] = useState(item?.pinned === 1)

  const saveMutation = useMutation({
    mutationFn: (data: AnnouncementFormData) => {
      if (isEdit && item) {
        return updateAnnouncement(item.id, data)
      }
      return createAnnouncement(data)
    },
    onSuccess: () => {
      toast.success(isEdit ? '公告已更新' : '公告已创建')
      onOpenChange(false)
      onSuccess()
    },
    onError: (err: Error) => toast.error(`操作失败: ${err.message}`),
  })

  const handleSubmit = () => {
    if (!title.trim()) {
      toast.error('请输入公告标题')
      return
    }
    if (!body.trim()) {
      toast.error('请输入公告内容')
      return
    }
    saveMutation.mutate({
      title: title.trim(),
      body: body.trim(),
      type,
      pinned: pinned ? 1 : 0,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑公告' : '创建公告'}</DialogTitle>
          <DialogDescription>
            {isEdit ? '修改公告信息后点击更新' : '填写公告信息后点击创建'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 标题 */}
          <div className="space-y-2">
            <Label className="font-medium">公告标题</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="请输入公告标题"
              maxLength={200}
            />
          </div>

          {/* 类型选择 */}
          <div className="space-y-2">
            <Label className="font-medium">公告类型</Label>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${
                    type === opt.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                  }`}
                >
                  <span className="font-medium text-sm">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 置顶开关 */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label className="font-medium">置顶</Label>
              <p className="text-xs text-muted-foreground">置顶的公告将优先显示</p>
            </div>
            <Switch checked={pinned} onCheckedChange={setPinned} />
          </div>

          {/* 内容 */}
          <div className="space-y-2">
            <Label className="font-medium">公告内容</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="请输入公告内容"
              rows={6}
            />
            <p className="text-right text-xs text-muted-foreground">{body.length} 字</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={handleSubmit} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? '保存中...' : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {isEdit ? '更新' : '创建'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
