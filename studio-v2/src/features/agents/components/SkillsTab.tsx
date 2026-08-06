/**
 * Skills Tab（F13）：列表 / discover / import（ZIP+path）/ 启停 / 版本 / 校验 / 测试。
 */
import { useEffect, useRef, useState } from 'react'
import { FileCode2, FolderSearch, Loader2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldLabel, TextInput } from '@/components/ui/form'
import { cn } from '@/core/utils/cn'
import {
  errorMessage,
  formatDate,
  formatValidationResult,
  useActivateSkillVersion,
  useDisableSkill,
  useDiscoverSkills,
  useEnableSkill,
  useImportSkill,
  useSkillDetail,
  useSkills,
  useTestSkill,
  useValidateSkill,
  type SkillSummary,
} from '@/features/agents/api'
import { SKILL_STATUS_LABELS, skillTone } from '@/features/agents/status'
import { StatusChip } from '@/features/agents/components/StatusChip'

function ImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean
  onClose: () => void
  onImported: () => void
}) {
  const importSkill = useImportSkill()
  const fileRef = useRef<HTMLInputElement>(null)
  const [path, setPath] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [activate, setActivate] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setPath('')
    setFile(null)
    setActivate(true)
    setError(null)
    setSuccess(null)
    if (fileRef.current) fileRef.current.value = ''
  }, [open])

  const submit = async () => {
    setError(null)
    setSuccess(null)
    if (!file && !path.trim()) {
      setError('请选择 ZIP 文件或填写服务器本地目录 path')
      return
    }
    try {
      const result = await importSkill.mutateAsync({
        file: file ?? undefined,
        path: path.trim() || undefined,
        activate,
      })
      setSuccess(`已导入 ${result.skill.name} v${result.version}`)
      onImported()
    } catch (err) {
      setError(errorMessage(err, '导入失败'))
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="导入 Skill">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <FieldLabel>ZIP 包</FieldLabel>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            className="text-xs text-text-muted file:mr-2 file:rounded-md file:border-0 file:bg-surface-raised file:px-2 file:py-1 file:text-xs file:text-text"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <FieldLabel>或服务器本地目录 path</FieldLabel>
          <TextInput
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="例如 data/studio-v2/skills/samples/demo"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} />
          导入后激活该版本
        </label>
        {error && <p className="text-xs text-danger">{error}</p>}
        {success && <p className="text-xs text-success">{success}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
          <Button variant="primary" size="sm" disabled={importSkill.isPending} onClick={() => void submit()}>
            {importSkill.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Upload className="size-3.5" aria-hidden />}
            导入
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function SkillDetailPanel({ skill, onClose }: { skill: SkillSummary; onClose: () => void }) {
  const { data: detail, isLoading } = useSkillDetail(skill.id)
  const activate = useActivateSkillVersion()
  const validate = useValidateSkill()
  const test = useTestSkill()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const onValidate = async () => {
    setErr(null)
    setMsg(null)
    try {
      const res = await validate.mutateAsync(skill.id)
      if (res.ok) setMsg('校验通过')
      else setMsg(`校验失败：${(res.issues ?? []).map((i) => i.message || i.code).join('；') || '未知问题'}`)
    } catch (e) {
      setErr(errorMessage(e, '校验失败'))
    }
  }

  const onTest = async () => {
    setErr(null)
    setMsg(null)
    try {
      const res = await test.mutateAsync(skill.id)
      const preview = res.instructions_preview
      setMsg(
        res.ok
          ? `测试摘要 OK${preview ? `：${preview.slice(0, 200)}${preview.length > 200 ? '…' : ''}` : ''}`
          : `测试未通过：${res.message ?? '未知'}`,
      )
    } catch (e) {
      setErr(errorMessage(e, '测试失败'))
    }
  }

  const onActivate = async (versionId: string) => {
    setErr(null)
    try {
      await activate.mutateAsync({ skillId: skill.id, versionId })
      setMsg('版本已激活')
    } catch (e) {
      setErr(errorMessage(e, '激活失败'))
    }
  }

  return (
    <Dialog open onClose={onClose} title={`${skill.name} 详情`} className="max-w-lg">
      <div className="flex flex-col gap-3">
        <div className="text-xs text-text-faint">
          <p>
            key: {skill.skill_key}
            {skill.category ? ` · ${skill.category}` : ''}
          </p>
          {skill.description && <p className="mt-1 text-text-muted">{skill.description}</p>}
        </div>

        {isLoading ? (
          <div className="flex h-12 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-text-faint" aria-hidden />
          </div>
        ) : (
          <div>
            <p className="mb-1 text-[11px] font-medium text-text-muted">版本</p>
            {(detail?.versions ?? []).length === 0 ? (
              <p className="text-[11px] text-text-faint">无版本记录</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {(detail?.versions ?? []).map((v) => {
                  const active = v.active || detail?.active_version === v.version
                  const validationError = formatValidationResult(v.validation_result)
                  return (
                    <li
                      key={v.id}
                      className="flex flex-col gap-1 rounded border border-border/60 bg-bg px-2 py-1.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-text">
                          v{v.version}
                          <span className="ml-1 text-text-faint">
                            {v.validation_status}
                            {active ? ' · 当前' : ''}
                            {v.installed_at ? ` · ${formatDate(v.installed_at)}` : ''}
                          </span>
                        </span>
                        {!active && (
                          <Button size="sm" variant="ghost" disabled={activate.isPending} onClick={() => void onActivate(v.id)}>
                            激活
                          </Button>
                        )}
                      </div>
                      {validationError && <p className="text-[11px] text-danger">{validationError}</p>}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        {msg && <p className="text-xs text-text">{msg}</p>}
        {err && <p className="text-xs text-danger">{err}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" disabled={validate.isPending} onClick={() => void onValidate()}>
            {validate.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            校验
          </Button>
          <Button size="sm" variant="ghost" disabled={test.isPending} onClick={() => void onTest()}>
            {test.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            测试
          </Button>
          <Button size="sm" variant="primary" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

export function SkillsTab() {
  const { data: skills = [], isLoading, error } = useSkills()
  const discover = useDiscoverSkills()
  const enableSkill = useEnableSkill()
  const disableSkill = useDisableSkill()

  const [importOpen, setImportOpen] = useState(false)
  const [detail, setDetail] = useState<SkillSummary | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  const onDiscover = async () => {
    setActionError(null)
    setBanner(null)
    try {
      const res = await discover.mutateAsync()
      const errPart = res.errors.length > 0 ? `，${res.errors.length} 个错误` : ''
      setBanner(`扫描完成：发现 ${res.count} 个 Skill${errPart}`)
    } catch (err) {
      setActionError(errorMessage(err, '扫描失败'))
    }
  }

  const toggle = async (skill: SkillSummary) => {
    setActionError(null)
    try {
      if (skill.enabled) await disableSkill.mutateAsync(skill.id)
      else await enableSkill.mutateAsync(skill.id)
    } catch (err) {
      setActionError(errorMessage(err, '切换启停失败'))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-text-muted">扫描内置目录、导入 ZIP/本地包，管理版本与启停。</p>
        <div className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="ghost" disabled={discover.isPending} onClick={() => void onDiscover()}>
            {discover.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <FolderSearch className="size-3.5" aria-hidden />
            )}
            扫描
          </Button>
          <Button size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="size-3.5" aria-hidden />
            导入
          </Button>
        </div>
      </div>

      {banner && <p className="text-xs text-text-muted">{banner}</p>}
      {actionError && <p className="text-xs text-danger">{actionError}</p>}
      {error && <p className="text-xs text-danger">{errorMessage(error, '加载 Skill 失败')}</p>}

      {isLoading ? (
        <div className="flex h-24 items-center justify-center text-text-faint">
          <Loader2 className="size-4 animate-spin" aria-hidden />
        </div>
      ) : skills.length === 0 ? (
        <EmptyState
          icon={FileCode2}
          title="暂无 Skill"
          hint="点击「扫描」索引已安装目录，或「导入」ZIP / 本地路径。"
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => void onDiscover()}>
                扫描
              </Button>
              <Button size="sm" variant="primary" onClick={() => setImportOpen(true)}>
                导入
              </Button>
            </div>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {skills.map((skill) => (
            <li key={skill.id} className="flex items-start gap-3 rounded-md border border-border bg-surface px-3 py-2.5">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetail(skill)}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-text">{skill.name}</span>
                  <StatusChip
                    label={SKILL_STATUS_LABELS[skill.status] ?? skill.status}
                    tone={skillTone(skill.status, skill.enabled)}
                  />
                  {!skill.enabled && <StatusChip label="已停用" tone="neutral" />}
                  {skill.active_version && <StatusChip label={`v${skill.active_version}`} tone="accent" />}
                </div>
                <p className="mt-0.5 truncate text-xs text-text-faint">
                  {skill.skill_key}
                  {skill.category ? ` · ${skill.category}` : ''}
                  {` · 绑定 ${skill.binding_count}`}
                  {skill.source_types && skill.source_types.length > 0
                    ? ` · ${skill.source_types.join('/')}`
                    : ''}
                </p>
                {skill.description && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-text-faint">{skill.description}</p>
                )}
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  role="switch"
                  aria-checked={skill.enabled}
                  aria-label={`${skill.enabled ? '停用' : '启用'} ${skill.name}`}
                  className={cn(
                    'relative h-4.5 w-8 rounded-full transition-colors duration-150',
                    skill.enabled ? 'bg-accent' : 'bg-border-strong',
                  )}
                  onClick={() => void toggle(skill)}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 size-3.5 rounded-full bg-white transition-transform duration-150',
                      skill.enabled ? 'translate-x-4' : 'translate-x-0.5',
                    )}
                  />
                </button>
                <Button size="sm" variant="ghost" onClick={() => setDetail(skill)}>
                  详情
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={() => setBanner('导入成功')} />
      {detail && <SkillDetailPanel skill={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}
