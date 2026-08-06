/**
 * Agents Tab（F13）：列表 / 新建编辑 / 复制 / 启停 / 绑定 Skill / 测试运行。
 */
import { useEffect, useState } from 'react'
import { Bot, Copy, Loader2, Pencil, Plus, Trash2, Zap } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldLabel, SelectField, TextArea, TextInput } from '@/components/ui/form'
import { cn } from '@/core/utils/cn'
import {
  errorMessage,
  formatDate,
  useAgents,
  useBindSkill,
  useCreateAgent,
  useDeleteAgent,
  useDuplicateAgent,
  useRuntimes,
  useSkills,
  useTestAgent,
  useUnbindSkill,
  useUpdateAgent,
  type AgentProfile,
  type AgentTestResult,
} from '@/features/agents/api'
import { AGENT_STATUS_LABELS, agentTone } from '@/features/agents/status'
import { StatusChip } from '@/features/agents/components/StatusChip'

interface AgentDraft {
  name: string
  description: string
  runtime_profile_id: string
  default_model: string
  instructions: string
  enabled: boolean
}

const EMPTY_DRAFT: AgentDraft = {
  name: '',
  description: '',
  runtime_profile_id: '',
  default_model: '',
  instructions: '',
  enabled: true,
}

function AgentFormDialog({
  open,
  onClose,
  editing,
  onSubmit,
  submitting,
  runtimeOptions,
}: {
  open: boolean
  onClose: () => void
  editing: AgentProfile | null
  onSubmit: (draft: AgentDraft) => void
  submitting: boolean
  runtimeOptions: { id: string; name: string; enabled: boolean }[]
}) {
  const [draft, setDraft] = useState<AgentDraft>(EMPTY_DRAFT)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setDraft({
        name: editing.name,
        description: editing.description,
        runtime_profile_id: editing.runtime_profile_id,
        default_model: editing.default_model ?? '',
        instructions: editing.instructions,
        enabled: editing.enabled,
      })
    } else {
      const first = runtimeOptions.find((r) => r.enabled) ?? runtimeOptions[0]
      setDraft({ ...EMPTY_DRAFT, runtime_profile_id: first?.id ?? '' })
    }
  }, [open, editing, runtimeOptions])

  const set = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const canSubmit = draft.name.trim().length > 0 && draft.runtime_profile_id.length > 0

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `编辑 Agent：${editing.name}` : '新建 Agent'}
      className="max-w-lg"
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <FieldLabel>名称 *</FieldLabel>
          <TextInput value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="例如 画布助手" />
        </label>
        <label className="flex flex-col gap-1">
          <FieldLabel>描述</FieldLabel>
          <TextInput
            value={draft.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="职责简述"
          />
        </label>
        <label className="flex flex-col gap-1">
          <FieldLabel>Runtime *</FieldLabel>
          <SelectField
            value={draft.runtime_profile_id}
            onChange={(e) => set('runtime_profile_id', e.target.value)}
          >
            {runtimeOptions.length === 0 && <option value="">请先创建 Runtime</option>}
            {runtimeOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {!r.enabled ? '（已停用）' : ''}
              </option>
            ))}
          </SelectField>
        </label>
        <label className="flex flex-col gap-1">
          <FieldLabel>默认模型</FieldLabel>
          <TextInput
            value={draft.default_model}
            onChange={(e) => set('default_model', e.target.value)}
            placeholder="可选，覆盖 Runtime 默认"
          />
        </label>
        <label className="flex flex-col gap-1">
          <FieldLabel>Instructions</FieldLabel>
          <TextArea
            rows={4}
            value={draft.instructions}
            onChange={(e) => set('instructions', e.target.value)}
            placeholder="角色说明、默认行为、禁止事项"
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-text-muted">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          启用
        </label>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" size="sm" disabled={!canSubmit || submitting} onClick={() => onSubmit(draft)}>
            {submitting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            保存
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function BindSkillDialog({
  open,
  onClose,
  agent,
  skills,
  onBind,
  submitting,
}: {
  open: boolean
  onClose: () => void
  agent: AgentProfile | null
  skills: { id: string; name: string; enabled: boolean; skill_key: string }[]
  onBind: (skillId: string) => void
  submitting: boolean
}) {
  const bound = new Set(agent?.skill_bindings.map((b) => b.skill_id) ?? [])
  const available = skills.filter((s) => s.enabled && !bound.has(s.id))
  const [skillId, setSkillId] = useState('')

  useEffect(() => {
    if (!open) return
    setSkillId(available[0]?.id ?? '')
  }, [open, agent, skills]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onClose={onClose} title={agent ? `绑定 Skill：${agent.name}` : '绑定 Skill'}>
      <div className="flex flex-col gap-3">
        {available.length === 0 ? (
          <p className="text-xs text-text-faint">没有可绑定的 Skill（需先导入并启用，且未绑定）。</p>
        ) : (
          <label className="flex flex-col gap-1">
            <FieldLabel>选择 Skill</FieldLabel>
            <SelectField value={skillId} onChange={(e) => setSkillId(e.target.value)}>
              {available.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}（{s.skill_key}）
                </option>
              ))}
            </SelectField>
          </label>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!skillId || submitting || available.length === 0}
            onClick={() => onBind(skillId)}
          >
            {submitting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            绑定
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function TestAgentDialog({
  open,
  onClose,
  agent,
  onTest,
  submitting,
  result,
}: {
  open: boolean
  onClose: () => void
  agent: AgentProfile | null
  onTest: (message: string, skillId?: string) => void
  submitting: boolean
  result: AgentTestResult | null
}) {
  const [message, setMessage] = useState('你好，请简短自我介绍。')
  const [skillId, setSkillId] = useState('')

  useEffect(() => {
    if (!open) return
    setMessage('你好，请简短自我介绍。')
    setSkillId('')
  }, [open, agent])

  return (
    <Dialog open={open} onClose={onClose} title={agent ? `测试运行：${agent.name}` : '测试运行'} className="max-w-lg">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <FieldLabel>测试消息</FieldLabel>
          <TextArea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        {agent && agent.skill_bindings.length > 0 && (
          <label className="flex flex-col gap-1">
            <FieldLabel>可选 Skill</FieldLabel>
            <SelectField value={skillId} onChange={(e) => setSkillId(e.target.value)}>
              <option value="">不指定</option>
              {agent.skill_bindings.map((b) => (
                <option key={b.id} value={b.skill_id}>
                  {b.skill.name}
                </option>
              ))}
            </SelectField>
          </label>
        )}
        {result && (
          <div
            className={cn(
              'rounded-md border px-3 py-2 text-xs',
              result.ok ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger',
            )}
          >
            <p className="font-medium">{result.ok ? '测试通过' : '测试失败'}</p>
            {result.message && <p className="mt-1 whitespace-pre-wrap text-text">{result.message}</p>}
            <p className="mt-1 text-text-faint">
              Task {result.task.id} · {result.task.status}
            </p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            关闭
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!message.trim() || submitting}
            onClick={() => onTest(message.trim(), skillId || undefined)}
          >
            {submitting ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Zap className="size-3.5" aria-hidden />}
            运行
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

export function AgentsTab() {
  const { data: agents = [], isLoading, error } = useAgents()
  const { data: runtimes = [] } = useRuntimes()
  const { data: skills = [] } = useSkills()
  const createAgent = useCreateAgent()
  const updateAgent = useUpdateAgent()
  const deleteAgent = useDeleteAgent()
  const duplicateAgent = useDuplicateAgent()
  const testAgent = useTestAgent()
  const bindSkill = useBindSkill()
  const unbindSkill = useUnbindSkill()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AgentProfile | null>(null)
  const [bindTarget, setBindTarget] = useState<AgentProfile | null>(null)
  const [testTarget, setTestTarget] = useState<AgentProfile | null>(null)
  const [testResult, setTestResult] = useState<AgentTestResult | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const runtimeOptions = runtimes.map((r) => ({ id: r.id, name: r.name, enabled: r.enabled }))

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const submitDraft = async (draft: AgentDraft) => {
    setActionError(null)
    try {
      if (editing) {
        await updateAgent.mutateAsync({
          id: editing.id,
          payload: {
            base_revision: editing.current_revision,
            name: draft.name.trim(),
            description: draft.description,
            runtime_profile_id: draft.runtime_profile_id,
            default_model: draft.default_model.trim() || null,
            instructions: draft.instructions,
            enabled: draft.enabled,
          },
        })
      } else {
        await createAgent.mutateAsync({
          name: draft.name.trim(),
          description: draft.description,
          runtime_profile_id: draft.runtime_profile_id,
          default_model: draft.default_model.trim() || null,
          instructions: draft.instructions,
          enabled: draft.enabled,
        })
      }
      setFormOpen(false)
    } catch (err) {
      setActionError(errorMessage(err, '保存 Agent 失败'))
    }
  }

  const toggleEnabled = async (agent: AgentProfile) => {
    setActionError(null)
    try {
      await updateAgent.mutateAsync({
        id: agent.id,
        payload: { base_revision: agent.current_revision, enabled: !agent.enabled },
      })
    } catch (err) {
      setActionError(errorMessage(err, '切换启停失败'))
    }
  }

  const remove = async (agent: AgentProfile) => {
    if (!window.confirm(`删除 Agent「${agent.name}」？历史 Task 会保留。`)) return
    setActionError(null)
    try {
      await deleteAgent.mutateAsync(agent.id)
    } catch (err) {
      setActionError(errorMessage(err, '删除失败'))
    }
  }

  const duplicate = async (agent: AgentProfile) => {
    setActionError(null)
    try {
      await duplicateAgent.mutateAsync(agent.id)
    } catch (err) {
      setActionError(errorMessage(err, '复制失败'))
    }
  }

  const onBind = async (skillId: string) => {
    if (!bindTarget) return
    setActionError(null)
    try {
      await bindSkill.mutateAsync({ agentId: bindTarget.id, skillId })
      setBindTarget(null)
    } catch (err) {
      setActionError(errorMessage(err, '绑定失败'))
    }
  }

  const onUnbind = async (agent: AgentProfile, bindingId: string, skillName: string) => {
    if (!window.confirm(`解除绑定 Skill「${skillName}」？`)) return
    setActionError(null)
    try {
      await unbindSkill.mutateAsync({ agentId: agent.id, bindingId })
    } catch (err) {
      setActionError(errorMessage(err, '解绑失败'))
    }
  }

  const onTest = async (message: string, skillId?: string) => {
    if (!testTarget) return
    setActionError(null)
    setTestResult(null)
    try {
      const result = await testAgent.mutateAsync({ id: testTarget.id, message, skill_id: skillId })
      setTestResult(result)
    } catch (err) {
      setActionError(errorMessage(err, '测试运行失败'))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-muted">创建 Agent、绑定 Skill，并测试运行验证 Runtime 闭环。</p>
        <Button size="sm" onClick={openCreate} disabled={runtimes.length === 0}>
          <Plus className="size-3.5" aria-hidden />
          新建
        </Button>
      </div>

      {runtimes.length === 0 && (
        <p className="text-xs text-warning">请先在 Runtimes Tab 创建至少一个 Runtime。</p>
      )}
      {actionError && <p className="text-xs text-danger">{actionError}</p>}
      {error && <p className="text-xs text-danger">{errorMessage(error, '加载 Agent 失败')}</p>}

      {isLoading ? (
        <div className="flex h-24 items-center justify-center text-text-faint">
          <Loader2 className="size-4 animate-spin" aria-hidden />
        </div>
      ) : agents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="暂无 Agent"
          hint="创建 Agent 并绑定 Runtime 与 Skill 后，可在此测试运行。"
          action={
            <Button size="sm" variant="primary" onClick={openCreate} disabled={runtimes.length === 0}>
              新建 Agent
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {agents.map((agent) => {
            const expanded = expandedId === agent.id
            return (
              <li key={agent.id} className="rounded-md border border-border bg-surface px-3 py-2.5">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => setExpandedId(expanded ? null : agent.id)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-text">{agent.name}</span>
                      <StatusChip
                        label={AGENT_STATUS_LABELS[agent.status] ?? agent.status}
                        tone={agentTone(agent.status, agent.enabled)}
                      />
                      {!agent.enabled && <StatusChip label="已停用" tone="neutral" />}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-text-faint">
                      {agent.runtime_profile.name}
                      {agent.default_model ? ` · ${agent.default_model}` : ''}
                      {` · ${agent.skill_bindings.length} 个 Skill`}
                      {agent.description ? ` · ${agent.description}` : ''}
                    </p>
                    <p className="mt-0.5 text-[11px] text-text-faint">更新 {formatDate(agent.updated_at)}</p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={agent.enabled}
                      aria-label={`${agent.enabled ? '停用' : '启用'} ${agent.name}`}
                      className={cn(
                        'relative h-4.5 w-8 rounded-full transition-colors duration-150',
                        agent.enabled ? 'bg-accent' : 'bg-border-strong',
                      )}
                      onClick={() => void toggleEnabled(agent)}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 size-3.5 rounded-full bg-white transition-transform duration-150',
                          agent.enabled ? 'translate-x-4' : 'translate-x-0.5',
                        )}
                      />
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTestResult(null)
                        setTestTarget(agent)
                      }}
                      aria-label={`测试 ${agent.name}`}
                    >
                      <Zap className="size-3.5" aria-hidden />
                      测试
                    </Button>
                    <IconButton label={`复制 ${agent.name}`} size="sm" onClick={() => void duplicate(agent)}>
                      <Copy className="size-3.5" />
                    </IconButton>
                    <IconButton
                      label={`编辑 ${agent.name}`}
                      size="sm"
                      onClick={() => {
                        setEditing(agent)
                        setFormOpen(true)
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </IconButton>
                    <IconButton label={`删除 ${agent.name}`} size="sm" onClick={() => void remove(agent)}>
                      <Trash2 className="size-3.5 text-danger" />
                    </IconButton>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-2 border-t border-border pt-2">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[11px] font-medium text-text-muted">已绑定 Skill</p>
                      <Button size="sm" variant="ghost" onClick={() => setBindTarget(agent)}>
                        <Plus className="size-3.5" aria-hidden />
                        绑定
                      </Button>
                    </div>
                    {agent.skill_bindings.length === 0 ? (
                      <p className="text-[11px] text-text-faint">尚未绑定 Skill。</p>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {agent.skill_bindings.map((b) => (
                          <li
                            key={b.id}
                            className="flex items-center justify-between rounded border border-border/60 bg-bg px-2 py-1.5 text-xs"
                          >
                            <span className="text-text">
                              {b.skill.name}
                              <span className="ml-1 text-text-faint">
                                {b.skill.active_version ? `v${b.skill.active_version}` : ''} · {b.version_constraint}
                              </span>
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void onUnbind(agent, b.id, b.skill.name)}
                            >
                              解绑
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {agent.instructions && (
                      <div className="mt-2">
                        <p className="text-[11px] font-medium text-text-muted">Instructions</p>
                        <p className="mt-0.5 max-h-24 overflow-y-auto whitespace-pre-wrap text-[11px] text-text-faint">
                          {agent.instructions}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <AgentFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        onSubmit={(d) => void submitDraft(d)}
        submitting={createAgent.isPending || updateAgent.isPending}
        runtimeOptions={runtimeOptions}
      />
      <BindSkillDialog
        open={Boolean(bindTarget)}
        onClose={() => setBindTarget(null)}
        agent={bindTarget}
        skills={skills}
        onBind={(id) => void onBind(id)}
        submitting={bindSkill.isPending}
      />
      <TestAgentDialog
        open={Boolean(testTarget)}
        onClose={() => setTestTarget(null)}
        agent={testTarget}
        onTest={(msg, sid) => void onTest(msg, sid)}
        submitting={testAgent.isPending}
        result={testResult}
      />
    </div>
  )
}
