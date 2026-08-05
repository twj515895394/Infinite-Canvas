# Infinite-Canvas Studio V2 Asset、Artifact、Version、Reference 与 Provenance 详细设计

> 文档状态：字段级详细设计基线（Implementation Contract Baseline）  
> 版本：v1.0  
> 日期：2026-08-05  
> 适用仓库：`twj515895394/Infinite-Canvas`  
> 前置文档：  
> - `docs/adr-001-studio-v2-greenfield-frontend-and-additive-backend.md`  
> - `docs/studio-v2-api-v2-p0-contract-and-openapi-design.md`  
> - `docs/studio-v2-agent-skill-runtime-and-management-design.md`  
> - `docs/studio-v2-agent-skill-p0-contract-and-sqlite-design.md`  
> - `docs/studio-v2-react-flow-node-model-and-registry-design.md`

---

## 1. 文档目的

本文将 Studio V2 中的媒体资源、结构化成果、版本、引用、来源追踪和领域写回推进到可直接实现数据库、Pydantic DTO、OpenAPI、前端类型和 Service 的字段级设计。

本文重点解决：

1. Asset 与 Artifact 的职责边界。
2. 图片、视频、音频、文档、工作流和结构化 Agent 输出如何统一管理。
3. 文件内容、逻辑资源、版本、预览和分析结果如何分层。
4. Project、Character、Scene、Shot、Storyboard、Canvas、Agent Task 和 GenerationJob 如何引用资源。
5. 为什么执行时必须固定 Version，而不能只保存一个会变化的 Asset ID。
6. Agent 输出如何先形成 Artifact，再审阅、应用到领域对象并保留来源。
7. GenerationJob 结果如何自动创建 Asset 和 Provenance。
8. 资产删除、回收站、引用检查和物理文件清理如何保证安全。
9. 现有 `asset_library.json`、本地素材、共享目录和输出目录如何作为 Legacy Source Adapter 复用。

---

## 2. 现有能力与问题

当前后端已经具备较完整的文件和素材基础能力：

- 上传、下载、远程 URL 导入。
- 媒体预览和图片格式转换。
- 本地素材目录浏览、移动、重命名、删除、Caption 和分类。
- 共享目录注册、浏览和导入。
- 资产库、分类、条目和工作流条目。
- 图片、视频、ComfyUI、RunningHub、即梦和其他生成结果输出。

现有资产库主要保存在：

```text
data/asset_library.json
```

默认结构以 Library、Category 和 Item 为中心：

```text
Library
└── Category
    └── Item
```

现有模式适合文件库页面，但不足以承载 Studio V2：

1. Item 主要依赖文件路径或 URL，没有稳定 Version ID。
2. 文件内容、逻辑素材身份和分类位置混在一起。
3. 角色、场景、镜头和画布节点难以可靠固定某一版本。
4. 生成结果与输入素材之间缺少标准来源关系。
5. Agent 输出没有统一结构、Schema、版本和应用记录。
6. 删除前无法完整回答“哪些项目对象、任务和历史结果正在使用它”。
7. Caption、标签、OCR、转录和模型分析可能覆盖人工描述。
8. 同一个物理文件可能被重复复制和重复存储。
9. 文件路径变化后，引用容易失效。

Studio V2 不修改现有 `/api/asset-library` Contract，而是在 `/api/v2` 中增加独立资源领域层。

---

## 3. 核心概念和边界

## 3.1 Blob

Blob 是不可变的物理内容对象。

例如：

- 一张 PNG 的原始字节。
- 一个 MP4 文件。
- 一个 JSON Workflow 文件。
- 一个 Markdown Artifact 大文件。
- 一张预览缩略图。

Blob 只回答：

```text
这段内容是什么
存在哪里
大小是多少
校验值是什么
```

Blob 不回答：

```text
它在业务上代表哪个角色或镜头
它是不是当前版本
它属于哪个分类
```

## 3.2 Asset

Asset 是可复用媒体或文件的稳定逻辑身份。

例如：

```text
角色林夏正面参考图
旧车站场景概念图
镜头 S03-08 最终视频
环境音：夜雨
ComfyUI 工作流：角色三视图
```

Asset 具有稳定 ID，可以拥有多个不可变 AssetVersion。

## 3.3 AssetVersion

AssetVersion 表示 Asset 在某一时刻的具体内容。

例如：

```text
林夏正面参考图 v1
林夏正面参考图 v2（修复五官）
林夏正面参考图 v3（换成 4K）
```

AssetVersion 一经创建不可修改。

## 3.4 Artifact

Artifact 是结构化、可审阅、可继续加工的创作成果。

Artifact 通常是文本或 JSON 语义对象，而不是单纯媒体文件。

例如：

```text
剧本分析报告
角色设定文档
场景拆解表
镜头列表
分镜计划
Prompt 包
连续性检查报告
生成计划
工作流参数方案
Agent 执行报告
```

Artifact 同样具有稳定身份和多个不可变 ArtifactVersion。

## 3.5 ArtifactVersion

ArtifactVersion 是 Artifact 的一次具体内容快照。

它必须：

- 固定 Schema Version。
- 固定内容 Checksum。
- 固定来源 Agent Run、用户或导入记录。
- 固定输入 Context Snapshot。
- 创建后不可原地修改。

## 3.6 Resource Link

Resource Link 是两个资源之间的语义关系。

例如：

```text
AssetVersion 描绘 Character
AssetVersion 用作 Shot 参考
ArtifactVersion 应用于 Script
ArtifactVersion 来源于 Agent Run
GenerationJob 使用 AssetVersion
Canvas Node 绑定 Asset
```

## 3.7 Provenance

Provenance 描述资源版本为什么产生、由谁产生、使用了什么输入和执行参数。

它用于：

- 回答来源。
- 复现任务。
- 审计 Agent 和 Tool。
- 查看模型、供应商、Skill 和上下文。
- 构建资源血缘图。

---

## 4. Asset 与 Artifact 的判断规则

使用以下判断：

### 应当是 Asset

- 核心价值是文件内容。
- 需要图片、视频或音频预览。
- 会作为模型参考输入。
- 会被下载、转码、裁剪或代理播放。
- 内容通过 Blob 保存。

### 应当是 Artifact

- 核心价值是结构和语义。
- 需要 Schema 校验。
- 需要 Diff、审阅和应用。
- 会转换为 Project、Script、Shot 等领域对象。
- 需要保留 Agent 来源和 Context Snapshot。

### Artifact 可以引用 Asset

例如角色设定 Artifact 可以包含：

```json
{
  "character_name": "林夏",
  "appearance": {},
  "reference_asset_version_ids": ["avr_1", "avr_2"]
}
```

### Artifact 可以渲染成 Asset

例如镜头表 Artifact 导出为 PDF 后：

- 结构化镜头表仍然是 Artifact。
- 导出的 PDF 是 Asset。
- 两者通过 `rendered_as` Link 连接。

---

## 5. 不可变版本规则

## 5.1 AssetVersion 不可变

创建后禁止修改：

- Blob。
- Checksum。
- MIME。
- Width / Height。
- Duration。
- 来源参数。
- Parent Version。

以下修改创建新 AssetVersion：

- 替换图片内容。
- 裁剪。
- 去背景。
- 放大。
- 压缩或重新编码并作为正式内容。
- 视频重剪。
- 音频降噪。
- Workflow JSON 内容修改。

## 5.2 ArtifactVersion 不可变

以下修改创建新 ArtifactVersion：

- 文本修改。
- JSON 字段修改。
- Schema Version 变化。
- Agent 重新生成。
- 用户应用修改建议。

## 5.3 不创建版本的修改

Asset 的以下信息属于逻辑资源元数据：

- 名称。
- 描述。
- 标签。
- 收藏。
- Review 状态。
- 所属 Collection。

修改这些字段只增加 Asset `revision`，不创建 AssetVersion。

Artifact 的以下信息同理：

- 标题。
- 描述。
- 生命周期状态。
- 标签。

## 5.4 当前版本

Asset 和 Artifact 保存：

```text
current_version_id
```

切换 Current Version 不修改历史版本。

## 5.5 Restore 的语义

Restore 不删除新版本。

恢复旧版本时有两种方式：

```text
activate-existing-version
clone-as-new-version
```

默认 UI 使用 `clone-as-new-version`：

```text
v1 → v2 → v3
恢复 v1
结果：创建 v4，内容与 v1 相同
```

这样历史保持线性和可审计。

---

## 6. Pinned Reference 与 Rolling Reference

引用必须明确版本策略。

```typescript
interface VersionedResourceRef {
  resourceType: string;
  resourceId: string;
  versionPolicy: 'pinned' | 'current';
  versionId?: string;
}
```

## 6.1 Pinned

固定具体 Version：

```json
{
  "resource_type": "asset",
  "resource_id": "ast_1",
  "version_policy": "pinned",
  "version_id": "avr_3"
}
```

必须使用 Pinned 的场景：

- GenerationJob 输入。
- Agent Context Snapshot。
- Agent Run。
- Artifact Provenance。
- 已完成的 Shot / Storyboard 发布版本。
- 历史审计记录。

## 6.2 Current

运行时解析 Asset 当前版本：

```json
{
  "resource_type": "asset",
  "resource_id": "ast_1",
  "version_policy": "current"
}
```

可用于：

- Character 的“默认参考素材”。
- Canvas Node 的实时展示。
- Project Cover。
- 用户明确希望跟随更新的引用。

## 6.3 执行前固定

即使 UI 保存的是 Current Reference，在创建 Agent Task 或 GenerationJob 时，也必须解析为具体 Version ID 并写入 Snapshot。

禁止任务执行过程中继续跟随 Current Version。

---

## 7. 同一 Asset 的新版本还是新 Asset

### 创建新版本

新内容仍代表同一个业务素材：

- 同一角色参考图的修正版。
- 同一镜头视频的重新编码版。
- 同一 Workflow 的参数结构升级。

### 创建新 Asset

新内容需要与原内容同时存在或具有独立用途：

- 同一角色的正面图和侧面图。
- 同一图片生成的四个候选结果。
- 同一镜头的不同创意方案。
- 原图与风格化版本需要并行使用。

新 Asset 使用 `derived_from` Link 记录来源。

### GenerationJob 多结果

一次生成返回四张图片时：

```text
默认创建 4 个 Asset
每个 Asset 创建一个 v1
```

不创建一个 Asset 的四个 Version。

原因：它们是候选方案，不是线性修订历史。

---

## 8. 内容寻址 Blob Store

## 8.1 存储路径

建议：

```text
data/studio-v2/blobs/sha256/{first2}/{next2}/{sha256}
```

临时目录：

```text
data/studio-v2/blob-staging/
data/studio-v2/blob-quarantine/
```

## 8.2 Blob 去重

Blob 以 SHA-256 唯一：

```text
UNIQUE(sha256)
```

相同文件只保存一份物理内容，但可以被多个 AssetVersion 引用。

## 8.3 逻辑资源不自动合并

物理 Blob 去重不等于 Asset 自动合并。

两个不同 Project 导入同一文件：

- 可以共享 Blob。
- 默认创建各自的 Asset。
- 不在用户不知情时合并业务身份。

## 8.4 URL

数据库保存 Storage Locator，不保存对外 `content_url`。

API 读取时动态生成：

```text
content_url
preview_url
poster_url
```

禁止前端依赖服务器绝对文件路径。

## 8.5 Blob 状态

```text
staging
ready
quarantined
missing
corrupt
deleting
deleted
```

---

## 9. 数据库表设计

继续使用：

```text
data/studio-v2/studio.db
```

与 Agent P0 共用 SQLite、Alembic、WAL、Repository 和 Event Outbox。

## 9.1 `storage_blobs`

```sql
CREATE TABLE storage_blobs (
    id TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL UNIQUE,
    size_bytes INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    storage_backend TEXT NOT NULL DEFAULT 'local',
    storage_key TEXT NOT NULL,
    status TEXT NOT NULL,
    original_extension TEXT,
    created_at TEXT NOT NULL,
    last_verified_at TEXT,
    deleted_at TEXT
);

CREATE INDEX idx_storage_blobs_status
ON storage_blobs(status, created_at);
```

`storage_key` 是相对定位信息，不返回给普通前端。

## 9.2 `assets`

```sql
CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    source_type TEXT NOT NULL,
    lifecycle_status TEXT NOT NULL DEFAULT 'active',
    review_status TEXT NOT NULL DEFAULT 'unreviewed',
    current_version_id TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    created_by_type TEXT NOT NULL,
    created_by_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    trashed_at TEXT,
    deleted_at TEXT
);

CREATE INDEX idx_assets_project_kind
ON assets(project_id, kind, lifecycle_status, updated_at DESC);

CREATE INDEX idx_assets_current_version
ON assets(current_version_id);
```

### Asset Kind

P0：

```text
image
video
audio
document
workflow
archive
```

后续可以增加：

```text
font
model-3d
subtitle
lut
project-package
```

### Lifecycle Status

```text
active
archived
trashed
purging
purged
```

### Review Status

```text
unreviewed
in-review
approved
rejected
```

## 9.3 `asset_versions`

```sql
CREATE TABLE asset_versions (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    version_no INTEGER NOT NULL,
    blob_id TEXT NOT NULL,
    parent_version_id TEXT,
    derivation_type TEXT NOT NULL DEFAULT 'original',
    original_filename TEXT,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,
    frame_rate REAL,
    sample_rate INTEGER,
    channels INTEGER,
    page_count INTEGER,
    checksum TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    source_json TEXT NOT NULL DEFAULT '{}',
    provenance_id TEXT,
    created_by_type TEXT NOT NULL,
    created_by_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(asset_id) REFERENCES assets(id),
    FOREIGN KEY(blob_id) REFERENCES storage_blobs(id),
    UNIQUE(asset_id, version_no)
);

CREATE INDEX idx_asset_versions_asset
ON asset_versions(asset_id, version_no DESC);

CREATE INDEX idx_asset_versions_provenance
ON asset_versions(provenance_id);
```

### Derivation Type

```text
original
replacement
crop
resize
upscale
background-remove
transcode
extract-frame
mixdown
workflow-edit
other
```

## 9.4 `asset_derivatives`

预览内容不是正式 AssetVersion。

```sql
CREATE TABLE asset_derivatives (
    id TEXT PRIMARY KEY,
    asset_version_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    blob_id TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY(asset_version_id) REFERENCES asset_versions(id),
    FOREIGN KEY(blob_id) REFERENCES storage_blobs(id),
    UNIQUE(asset_version_id, kind)
);
```

Derivative Kind：

```text
thumbnail
preview
poster
proxy-video
waveform
contact-sheet
transcript-file
ocr-file
```

## 9.5 `asset_annotations`

AI Caption、OCR、转录、Embedding 和审核结果不覆盖 Asset 人工描述。

```sql
CREATE TABLE asset_annotations (
    id TEXT PRIMARY KEY,
    asset_version_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    producer_type TEXT NOT NULL,
    producer_id TEXT,
    model_ref_json TEXT NOT NULL DEFAULT '{}',
    payload_json TEXT NOT NULL DEFAULT '{}',
    payload_blob_id TEXT,
    confidence REAL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(asset_version_id) REFERENCES asset_versions(id)
);

CREATE INDEX idx_asset_annotations_version_kind
ON asset_annotations(asset_version_id, kind, created_at DESC);
```

Annotation Kind：

```text
caption
tags
ocr
transcript
safety
quality
faces
objects
embedding
custom
```

## 9.6 `tags` 与 `asset_tag_links`

```sql
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    color_token TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(project_id, normalized_name)
);

CREATE TABLE asset_tag_links (
    asset_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(asset_id, tag_id)
);
```

AI 建议标签先进入 Annotation，用户确认后再写入正式 Tag Link。

## 9.7 `asset_collections`

Collection 取代旧 Library / Category 的嵌套 JSON。

```sql
CREATE TABLE asset_collections (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    parent_id TEXT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'manual',
    query_json TEXT NOT NULL DEFAULT '{}',
    sort_order INTEGER NOT NULL DEFAULT 0,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE asset_collection_members (
    collection_id TEXT NOT NULL,
    asset_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL,
    PRIMARY KEY(collection_id, asset_id)
);
```

Collection Kind：

```text
manual
smart
system
```

Smart Collection 通过 `query_json` 动态计算，不写成员表。

## 9.8 `artifact_types`

Artifact Type 是可注册、可版本化的 Schema 定义。

```sql
CREATE TABLE artifact_types (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL,
    current_schema_version INTEGER NOT NULL,
    render_hint TEXT NOT NULL DEFAULT 'document',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE artifact_type_versions (
    artifact_type_id TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    json_schema TEXT NOT NULL,
    ui_schema TEXT NOT NULL DEFAULT '{}',
    migration_ref TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY(artifact_type_id, schema_version)
);
```

P0 内置 Artifact Type：

```text
agent-report
generic-document
project-analysis
character-design
scene-breakdown
shot-list
storyboard-plan
prompt-pack
continuity-report
generation-plan
workflow-config
```

## 9.9 `artifacts`

```sql
CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    artifact_type_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    lifecycle_status TEXT NOT NULL DEFAULT 'draft',
    current_version_id TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    created_by_type TEXT NOT NULL,
    created_by_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    trashed_at TEXT,
    deleted_at TEXT
);

CREATE INDEX idx_artifacts_project_type
ON artifacts(project_id, artifact_type_id, lifecycle_status, updated_at DESC);
```

Artifact Lifecycle：

```text
draft
in-review
approved
superseded
archived
trashed
```

## 9.10 `artifact_versions`

```sql
CREATE TABLE artifact_versions (
    id TEXT PRIMARY KEY,
    artifact_id TEXT NOT NULL,
    version_no INTEGER NOT NULL,
    schema_version INTEGER NOT NULL,
    format TEXT NOT NULL,
    content_json TEXT,
    content_text TEXT,
    content_blob_id TEXT,
    summary TEXT NOT NULL DEFAULT '',
    checksum TEXT NOT NULL,
    parent_version_id TEXT,
    provenance_id TEXT,
    created_by_type TEXT NOT NULL,
    created_by_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(artifact_id) REFERENCES artifacts(id),
    UNIQUE(artifact_id, version_no)
);

CREATE INDEX idx_artifact_versions_artifact
ON artifact_versions(artifact_id, version_no DESC);
```

Format：

```text
json
markdown
text
yaml
table
binary-reference
```

约束：

```text
content_json
content_text
content_blob_id
```

必须且只能有一种主要内容来源。

建议：

- 小于 256KB 的 JSON / Text 可内联 SQLite。
- 大内容保存为 Blob。
- API 对前端保持统一 Content DTO。

## 9.11 `resource_links`

统一保存跨领域关系。

```sql
CREATE TABLE resource_links (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_version_id TEXT,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_version_id TEXT,
    relation_type TEXT NOT NULL,
    version_policy TEXT NOT NULL DEFAULT 'pinned',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_by_type TEXT NOT NULL,
    created_by_id TEXT,
    created_at TEXT NOT NULL,
    deleted_at TEXT
);

CREATE INDEX idx_resource_links_source
ON resource_links(source_type, source_id, relation_type);

CREATE INDEX idx_resource_links_target
ON resource_links(target_type, target_id, relation_type);
```

Relation Type 建议：

```text
attached_to
cover_of
depicts
reference_for
uses
input_to
output_of
derived_from
rendered_as
produced_by
applies_to
supersedes
replaces
selected_for
rejected_for
```

跨表多态关系无法全部通过 SQLite FK 保证，必须由 ResourceLinkService 校验目标存在性。

## 9.12 `provenance_records`

```sql
CREATE TABLE provenance_records (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    producer_type TEXT NOT NULL,
    producer_id TEXT,
    agent_session_id TEXT,
    agent_task_id TEXT,
    agent_run_id TEXT,
    generation_job_id TEXT,
    context_snapshot_id TEXT,
    agent_profile_id TEXT,
    agent_profile_revision INTEGER,
    skill_id TEXT,
    skill_version TEXT,
    runtime_profile_id TEXT,
    provider_id TEXT,
    model_id TEXT,
    workflow_id TEXT,
    parameters_json TEXT NOT NULL DEFAULT '{}',
    parameters_checksum TEXT,
    prompt_resource_ref TEXT,
    created_at TEXT NOT NULL
);
```

## 9.13 `provenance_inputs`

```sql
CREATE TABLE provenance_inputs (
    provenance_id TEXT NOT NULL,
    input_order INTEGER NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    version_id TEXT,
    role TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    PRIMARY KEY(provenance_id, input_order)
);
```

Role 示例：

```text
prompt
reference-image
reference-video
project-bible
script
character
scene
shot
canvas-node
artifact
workflow
previous-output
```

## 9.14 `artifact_applications`

Artifact 应用到领域对象必须单独记录。

```sql
CREATE TABLE artifact_applications (
    id TEXT PRIMARY KEY,
    artifact_version_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    status TEXT NOT NULL,
    mode TEXT NOT NULL,
    target_revision_before INTEGER,
    target_revision_after INTEGER,
    diff_json TEXT NOT NULL DEFAULT '{}',
    operations_json TEXT NOT NULL DEFAULT '[]',
    error_json TEXT,
    created_by_type TEXT NOT NULL,
    created_by_id TEXT,
    created_at TEXT NOT NULL,
    applied_at TEXT,
    reverted_at TEXT
);
```

Status：

```text
previewed
pending-approval
applying
applied
failed
reverted
```

## 9.15 `external_resource_mappings`

用于 Legacy 和外部目录映射：

```sql
CREATE TABLE external_resource_mappings (
    id TEXT PRIMARY KEY,
    source_system TEXT NOT NULL,
    external_type TEXT NOT NULL,
    external_id TEXT NOT NULL,
    external_locator TEXT,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    resource_version_id TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(source_system, external_type, external_id)
);
```

---

## 10. Asset Ingest 流程

## 10.1 来源类型

```text
upload
remote-url
local-file
shared-folder-file
legacy-asset-item
generation-output
agent-output
workflow-output
```

## 10.2 异步管线

```text
接收来源
→ 写入 staging
→ 文件大小和路径检查
→ MIME / Magic Number 检查
→ 安全扫描
→ 计算 SHA-256
→ Blob 去重
→ 写入 Blob Store
→ 提取媒体元数据
→ 创建 Asset / AssetVersion
→ 生成 Preview Derivative
→ 可选创建 Annotation Job
→ 写 Resource Link / Provenance
→ 发布 Event
```

## 10.3 失败边界

- Blob 未 Ready 前不能创建可用 AssetVersion。
- 数据库创建失败时，未引用 Blob 进入垃圾清理队列。
- Preview 失败不阻止原 AssetVersion Ready，但状态显示 `preview_degraded`。
- Analyze 失败不影响导入成功。
- 批量导入按 Item 独立成功或失败。

## 10.4 去重策略

分两层：

### 物理去重

始终按 SHA-256 复用 Blob。

### 逻辑去重

请求参数：

```text
dedupe_mode = create-new | reuse-project-asset | reject-duplicate
```

默认：

```text
create-new
```

但同一批次中的完全重复来源自动合并为一次处理。

## 10.5 Ingest Result

每个 Item 返回：

```typescript
interface AssetIngestItemResult {
  sourceIndex: number;
  status: 'succeeded' | 'failed' | 'duplicate';
  assetId?: string;
  assetVersionId?: string;
  reusedBlob?: boolean;
  error?: ApiProblem;
}
```

---

## 11. Asset Version 创建规则

## 11.1 上传新版本

```text
POST /api/v2/assets/{asset_id}/versions
```

必须提供：

- Source。
- `base_revision`。
- Derivation Type。
- Parent Version，可选。

服务端校验：

- Asset Kind 与 MIME 兼容。
- Parent Version 属于同一 Asset。
- Asset 未被 Purged。
- 调用者拥有写权限。

## 11.2 切换当前版本

```text
POST /api/v2/assets/{asset_id}/versions/{version_id}:activate
```

要求 `If-Match` 或 `base_revision`。

## 11.3 生成衍生 Asset

```text
POST /api/v2/asset-versions/{version_id}:derive
```

参数明确：

```text
result_mode = new-version | new-asset
```

---

## 12. Artifact 创建与更新流程

## 12.1 创建 Artifact

```text
POST /api/v2/artifacts
```

请求包含：

- Project。
- Artifact Type。
- Title。
- 初始内容。
- Schema Version。
- 来源信息。

服务端：

```text
加载 Artifact Type Schema
→ 校验内容
→ 规范化 JSON
→ 计算 Checksum
→ 创建 Artifact
→ 创建 ArtifactVersion v1
→ 设置 Current Version
→ 写 Provenance / Links
→ 发布事件
```

## 12.2 新建 ArtifactVersion

```text
POST /api/v2/artifacts/{artifact_id}/versions
```

必须提供：

```text
base_revision
parent_version_id
schema_version
content
```

并进行 Schema Validation。

## 12.3 Agent 输出

Agent Run 产生结构化输出时：

```text
Runtime Structured Output
→ Skill Output Schema 校验
→ Artifact Type Schema 校验
→ Artifact Writer
→ Provenance
→ ArtifactVersion
→ agent.artifact.created
```

Skill Output Schema 可以比 Artifact Type Schema 更严格，但不能产生无法转入目标 Artifact Type 的内容。

## 12.4 输出解析失败

不丢弃 Runtime 原始结果：

- 创建 `agent-report` Artifact 或保存 Message。
- Task 标记为 `failed` 或 `succeeded_with_invalid_output`，具体由 Skill Policy 决定。
- 保存 Validation Issues。
- 允许用户修复后重新验证。

---

## 13. Artifact Review 与 Apply

## 13.1 推荐默认流程

```text
Agent 创建 Artifact
→ 用户预览
→ 显示目标领域 Diff
→ 用户确认
→ Apply Service 执行领域操作
→ 记录 ArtifactApplication
→ Artifact 标记 approved 或保持 draft
```

## 13.2 Dry Run

```text
POST /api/v2/artifacts/{artifact_id}/versions/{version_id}:preview-apply
```

返回：

- 将创建的对象。
- 将更新的字段。
- 将删除或覆盖的内容。
- Revision 冲突。
- 权限要求。
- 可撤销性。

## 13.3 Apply

```text
POST /api/v2/artifacts/{artifact_id}/versions/{version_id}:apply
```

请求：

```json
{
  "target": {
    "type": "project-shot-list",
    "id": "prj_1"
  },
  "mode": "merge",
  "base_revision": 12,
  "preview_application_id": "aap_1"
}
```

Mode：

```text
create
merge
replace
append
```

## 13.4 Apply 原子性

- 单领域聚合内尽量单事务。
- 批量创建 Shot 时，任意关键校验失败则整批回滚。
- 大型异步 Apply 使用 Domain Job，但仍记录最终 Application。
- Apply 成功后创建 `applies_to` Resource Link。

## 13.5 Revert

只有目标领域支持版本或逆向 Operation 时才允许 Revert。

UI 必须展示：

```text
可撤销
部分可撤销
不可撤销
```

---

## 14. Resource Link 规则

## 14.1 Link 与普通字段的边界

以下使用普通字段：

- Asset.current_version_id。
- Artifact.current_version_id。
- AssetVersion.blob_id。

以下使用 Resource Link：

- Character 使用哪些参考图。
- Shot 关联哪些参考视频。
- Artifact 来源哪个 Task。
- Asset 是哪个 Job 的输出。
- Artifact 应用于哪个 Script。
- Asset 描绘哪个 Character。

## 14.2 Link 唯一性

建议唯一约束由 Service 保证：

```text
source + source_version + target + target_version + relation_type
```

## 14.3 删除 Link

删除 Link 是逻辑删除，保留审计记录。

## 14.4 反向查询

API 必须支持：

```text
这个 Asset 被谁使用
这个 Shot 使用了哪些资源
这个 Agent Run 产生了什么
这个 Artifact 应用到了哪里
```

---

## 15. Provenance 规则

## 15.1 GenerationJob 输出

GenerationJob 成功时：

```text
每个输出文件
→ Blob
→ Asset
→ AssetVersion
→ ProvenanceRecord
→ ProvenanceInputs
→ output_of Link
→ Job.result_asset_refs
```

Provenance 固定：

- Provider。
- Model。
- Workflow。
- Attempt。
- Parameters。
- Prompt Resource Ref。
- 输入 AssetVersion。
- Canvas / Node。

## 15.2 Agent 输出

ArtifactVersion 固定：

- Agent Profile Revision。
- Skill Version。
- Runtime Profile。
- Context Snapshot。
- Tool Call。
- 输入资源 Version。

## 15.3 用户编辑

用户在 Artifact Editor 修改内容创建新版本：

```text
producer_type = user
parent_version_id = 原版本
```

仍保留原 Agent Version，不覆盖来源。

## 15.4 参数脱敏

Provenance 不保存：

- API Key。
- Token。
- Cookie。
- 明文 Secret。

敏感参数只保存 Secret Reference ID 或脱敏摘要。

---

## 16. 删除、回收站与垃圾回收

## 16.1 Trash 不破坏引用

将 Asset 或 Artifact 移入回收站：

- 从普通列表隐藏。
- 现有引用仍可解析。
- 历史任务仍能访问固定 Version。
- 可以 Restore。

## 16.2 Purge

物理清理前检查：

- Resource Link。
- Agent Context Snapshot。
- GenerationJob Input / Output。
- Canvas Node Binding。
- Artifact Provenance。
- Domain Entity Reference。

存在 Hard Reference 时返回：

```text
409 ASSET_IN_USE
409 ARTIFACT_IN_USE
```

## 16.3 Hard 与 Soft Reference

Hard：

- 历史 Run Input。
- GenerationJob Input。
- 当前已发布 Shot。
- Artifact Provenance。

Soft：

- 收藏。
- 临时 Canvas 展示。
- 未保存 Composer Attachment。

Purge 不能破坏 Hard Reference。

## 16.4 Blob GC

Blob 只有在以下条件全部成立时才能删除：

- 没有 AssetVersion 引用。
- 没有 ArtifactVersion 引用。
- 没有 Derivative 引用。
- 没有日志或 Snapshot 资源引用。
- 超过保留期限。

GC 必须先标记 `deleting`，删除成功后标记 `deleted`。

---

## 17. Legacy 与现有目录复用

## 17.1 Legacy Asset Library

现有：

```text
data/asset_library.json
```

转换规则：

```text
Library / Category
→ Asset Collection

Item
→ Asset + AssetVersion

Item URL / Path
→ Legacy Source Adapter
```

保存：

- Legacy Library ID。
- Category ID。
- Item ID。
- 原 URL / Path。
- 导入时间。

写入 `external_resource_mappings`。

## 17.2 Local Assets

`/api/local-assets` 继续是文件浏览和导入来源。

未导入文件属于：

```text
ExternalMediaSource
```

只有执行 Ingest 后才成为 Asset。

## 17.3 Shared Folder

共享目录文件不直接成为 Asset。

Studio 只保存：

```text
shared_folder_id
relative_path
```

用户导入后创建 AssetVersion。

## 17.4 Existing Output

现有 `/output` 和 `/assets/output` 文件可以通过扫描任务导入。

扫描不会修改原文件，默认：

- 计算 Checksum。
- 创建 Blob 引用或受控复制。
- 创建 `legacy` Source Type。
- 保存 External Mapping。

## 17.5 不做隐式双写

Studio V2 新 Asset 不自动回写 `asset_library.json`。

需要旧前端查看时，后续可以提供显式：

```text
Export to Legacy Asset Library
```

---

## 18. API Contract

## 18.1 Asset API

```text
GET    /api/v2/assets
POST   /api/v2/assets/ingest
POST   /api/v2/assets/ingest/upload
GET    /api/v2/assets/{asset_id}
PATCH  /api/v2/assets/{asset_id}
POST   /api/v2/assets/{asset_id}:trash
POST   /api/v2/assets/{asset_id}:restore
DELETE /api/v2/assets/{asset_id}
GET    /api/v2/assets/{asset_id}/versions
POST   /api/v2/assets/{asset_id}/versions
POST   /api/v2/assets/{asset_id}/versions/{version_id}:activate
GET    /api/v2/asset-versions/{version_id}
POST   /api/v2/asset-versions/{version_id}:derive
GET    /api/v2/asset-versions/{version_id}/annotations
POST   /api/v2/asset-versions/{version_id}/annotations
```

## 18.2 Collection API

```text
GET    /api/v2/asset-collections
POST   /api/v2/asset-collections
PATCH  /api/v2/asset-collections/{collection_id}
DELETE /api/v2/asset-collections/{collection_id}
POST   /api/v2/asset-collections/{collection_id}/members
DELETE /api/v2/asset-collections/{collection_id}/members/{asset_id}
```

## 18.3 Artifact API

```text
GET    /api/v2/artifacts
POST   /api/v2/artifacts
GET    /api/v2/artifacts/{artifact_id}
PATCH  /api/v2/artifacts/{artifact_id}
POST   /api/v2/artifacts/{artifact_id}:trash
POST   /api/v2/artifacts/{artifact_id}:restore
DELETE /api/v2/artifacts/{artifact_id}
GET    /api/v2/artifacts/{artifact_id}/versions
POST   /api/v2/artifacts/{artifact_id}/versions
GET    /api/v2/artifact-versions/{version_id}
POST   /api/v2/artifacts/{artifact_id}/versions/{version_id}:activate
POST   /api/v2/artifacts/{artifact_id}/versions/{version_id}:validate
POST   /api/v2/artifacts/{artifact_id}/versions/{version_id}:preview-apply
POST   /api/v2/artifacts/{artifact_id}/versions/{version_id}:apply
POST   /api/v2/artifact-applications/{application_id}:revert
```

## 18.4 Link API

```text
GET    /api/v2/resource-links
POST   /api/v2/resource-links
DELETE /api/v2/resource-links/{link_id}
GET    /api/v2/resources/{resource_type}/{resource_id}/links
GET    /api/v2/resources/{resource_type}/{resource_id}/provenance
```

## 18.5 Artifact Type API

```text
GET /api/v2/artifact-types
GET /api/v2/artifact-types/{type_id}
GET /api/v2/artifact-types/{type_id}/schemas/{schema_version}
```

P0 只允许后端或 Skill Registry 注册 Artifact Type，普通前端不直接修改 Schema。

---

## 19. DTO 设计

## 19.1 ResourceRef

```python
class ResourceRef(BaseModel):
    resource_type: str
    resource_id: str
    version_policy: Literal["pinned", "current"] = "pinned"
    version_id: str | None = None
    label: str | None = None
    preview_url: str | None = None
```

校验：

- `pinned` 必须提供 `version_id`。
- `current` 不允许由历史 Snapshot 保存。

## 19.2 AssetSummary

```python
class AssetSummary(BaseModel):
    id: str
    project_id: str | None
    kind: AssetKind
    name: str
    description: str
    source_type: str
    lifecycle_status: str
    review_status: str
    current_version: AssetVersionSummary
    tags: list[TagSummary] = []
    collection_ids: list[str] = []
    reference_count: int
    created_at: datetime
    updated_at: datetime
    revision: int
```

## 19.3 AssetVersionSummary

```python
class AssetVersionSummary(BaseModel):
    id: str
    asset_id: str
    version_no: int
    mime_type: str
    size_bytes: int
    width: int | None = None
    height: int | None = None
    duration_ms: int | None = None
    content_url: str
    preview_url: str | None = None
    poster_url: str | None = None
    checksum: str
    created_at: datetime
```

## 19.4 ArtifactSummary

```python
class ArtifactSummary(BaseModel):
    id: str
    project_id: str
    artifact_type_id: str
    title: str
    description: str
    lifecycle_status: str
    current_version: ArtifactVersionSummary
    link_count: int
    created_at: datetime
    updated_at: datetime
    revision: int
```

## 19.5 ArtifactVersionSummary

```python
class ArtifactVersionSummary(BaseModel):
    id: str
    artifact_id: str
    version_no: int
    schema_version: int
    format: str
    summary: str
    checksum: str
    provenance: ProvenanceSummary | None
    created_at: datetime
```

## 19.6 Artifact Content

```python
class ArtifactContent(BaseModel):
    format: Literal["json", "markdown", "text", "yaml", "table", "binary-reference"]
    json_value: JsonValue | None = None
    text_value: str | None = None
    blob_ref: BlobReadRef | None = None
```

---

## 20. 错误码

```text
ASSET_NOT_FOUND
ASSET_VERSION_NOT_FOUND
ASSET_VERSION_MISMATCH
ASSET_KIND_MISMATCH
ASSET_DUPLICATE_CONTENT
ASSET_IN_USE
ASSET_PURGE_FORBIDDEN
ASSET_INGEST_FAILED
ASSET_PREVIEW_DEGRADED
BLOB_NOT_FOUND
BLOB_CORRUPT
ARTIFACT_NOT_FOUND
ARTIFACT_VERSION_NOT_FOUND
ARTIFACT_SCHEMA_NOT_FOUND
ARTIFACT_SCHEMA_VALIDATION_FAILED
ARTIFACT_APPLY_CONFLICT
ARTIFACT_APPLY_FAILED
ARTIFACT_REVERT_UNSUPPORTED
RESOURCE_LINK_INVALID
RESOURCE_REFERENCE_NOT_FOUND
RESOURCE_VERSION_REQUIRED
PROVENANCE_INCOMPLETE
REVISION_CONFLICT
```

---

## 21. Event 设计

```text
asset.created
asset.updated
asset.trashed
asset.restored
asset.purged
asset.version.created
asset.current_version.changed
asset.derivative.ready
asset.annotation.created
asset.collection.created
asset.collection.updated
asset.collection.members_changed
artifact.created
artifact.updated
artifact.trashed
artifact.restored
artifact.version.created
artifact.current_version.changed
artifact.validation.failed
artifact.application.previewed
artifact.application.applied
artifact.application.failed
artifact.application.reverted
resource.link.created
resource.link.deleted
blob.status_changed
```

事件中只发送摘要和 ID，不发送大 JSON、文件内容或完整 Artifact。

---

## 22. 与 Agent 平台集成

## 22.1 Context Builder

Context Preview 可以保存 Current Reference，但创建 Snapshot 时必须解析为 Pinned Version。

Context Reference 示例：

```json
{
  "resource_type": "asset",
  "resource_id": "ast_1",
  "version_id": "avr_3",
  "role": "character-reference"
}
```

## 22.2 Skill 输入

Skill Input Schema 推荐只接收：

```text
ResourceRef
或明确的 Domain DTO
```

不接收服务器绝对路径。

## 22.3 Skill 输出

结构化 Skill 必须声明：

```yaml
outputs:
  artifactType: shot-list
  schemaVersion: 1
```

## 22.4 Agent Tool

P0 Resource Tool：

```text
asset.search
asset.read
asset.read_version
asset.link
artifact.create
artifact.create_version
artifact.read
artifact.preview_apply
artifact.apply
resource.links
```

Tool 返回大内容时使用 Resource Ref，不直接把文件或巨大 JSON 塞入 Runtime 事件。

---

## 23. 与 GenerationJob 集成

## 23.1 输入

GenerationJob 接受：

```text
asset_version_ids
artifact_version_ids
structured_inputs
```

创建 Job 时生成 Input Snapshot，固定 Version。

## 23.2 输出

Job 成功后先创建 Asset，再把 `result_asset_refs` 写入 Job。

如果输出是结构化分析结果，则创建 Artifact，而不是伪装成 JSON 文件 Asset。

## 23.3 取消后到达的结果

当 Job 已 `cancel_requested`，但上游仍返回结果：

策略由 Job Policy 决定：

```text
discard
archive-unlinked
accept
```

默认：

```text
archive-unlinked
```

即创建带 Provenance 的 Asset，但不自动绑定 Canvas Node，并标记来源为取消后结果。

---

## 24. 与 React Flow 集成

Asset Node 保存：

```typescript
interface AssetNodeConfig {
  assetId: string;
  versionPolicy: 'current' | 'pinned';
  versionId?: string;
  previewMode: 'fit' | 'fill' | 'original';
}
```

Artifact Node 保存：

```typescript
interface ArtifactNodeConfig {
  artifactId: string;
  versionPolicy: 'current' | 'pinned';
  versionId?: string;
  viewMode: 'summary' | 'table' | 'document';
}
```

Canvas Document 不保存文件 URL、完整 Artifact 内容或 Blob Locator。

---

## 25. 前端模块建议

```text
src/features/resources/
├── assets/
│   ├── api/
│   ├── components/
│   ├── pages/
│   ├── schemas/
│   └── hooks/
├── artifacts/
├── collections/
├── links/
├── provenance/
└── shared/
```

核心组件：

```text
AssetGrid
AssetCard
AssetInspector
AssetVersionTimeline
AssetReferencePanel
AssetIngestDialog
ArtifactList
ArtifactEditor
ArtifactVersionTimeline
ArtifactDiff
ArtifactApplyPreview
ResourceLinkPanel
ProvenancePanel
```

---

## 26. UI 交互规则

- Asset Card 默认显示 Current Version，但提供版本徽标。
- 固定旧版本时明确显示 `Pinned v3`。
- Current Reference 更新后，使用该引用的 UI 显示“版本已更新”。
- 历史 Job 和 Run 永远不显示成“自动使用最新版本”。
- 删除前显示引用数量和影响对象。
- Trash 后不从正在使用它的领域页面中突然消失。
- Artifact Apply 必须先显示 Diff。
- Agent 生成 Artifact 后默认进入 Review，不自动批量覆盖领域对象。
- Version Timeline 不使用重型循环动画。
- Preview 加载采用缩略图、代理视频和按需原文件策略。

---

## 27. 后端模块结构

```text
app/
├── api/v2/
│   ├── assets.py
│   ├── asset_versions.py
│   ├── asset_collections.py
│   ├── artifacts.py
│   ├── artifact_types.py
│   ├── resource_links.py
│   └── provenance.py
├── resources/
│   ├── asset_service.py
│   ├── artifact_service.py
│   ├── artifact_apply_service.py
│   ├── blob_store.py
│   ├── ingest_service.py
│   ├── preview_service.py
│   ├── annotation_service.py
│   ├── resource_link_service.py
│   ├── provenance_service.py
│   ├── garbage_collector.py
│   └── adapters/
│       ├── legacy_asset_library.py
│       ├── local_asset_source.py
│       ├── shared_folder_source.py
│       └── legacy_output_source.py
└── repositories/
    ├── asset_repository.py
    ├── artifact_repository.py
    ├── blob_repository.py
    ├── resource_link_repository.py
    └── provenance_repository.py
```

无需移动旧资产接口；V2 Service 可以逐步复用现有预览、上传和文件工具函数。

---

## 28. P0 / P1 范围

## 28.1 P0

- Blob Store。
- Asset / AssetVersion。
- 图片、视频、音频和 Workflow Ingest。
- Preview Derivative。
- Asset Query、Patch、Trash、Restore。
- Collection 基础能力。
- Artifact / ArtifactVersion。
- 内置 Artifact Type。
- Resource Link。
- Provenance。
- Agent Artifact Writer。
- GenerationJob Output Writer。
- Context Version Pinning。
- Event Outbox。

## 28.2 P1

- Artifact Apply 到 Script、Shot、Storyboard。
- Artifact Diff 和 Revert。
- Smart Collection。
- Annotation Pipeline。
- OCR、转录和 Embedding。
- Legacy Asset Library 批量导入。
- Blob GC 管理页面。
- 远程对象存储 Backend。

## 28.3 P2

- 跨项目共享 Asset。
- 素材许可和版权元数据。
- Review Workflow。
- 资源血缘图可视化。
- Artifact Type 插件化。
- 冷存储和归档层。
- 多用户协作权限。

---

## 29. 推荐实施顺序

### 阶段 A：Blob 与 Asset Core

1. Migration。
2. Blob Store。
3. Asset Repository。
4. AssetVersion。
5. Ingest。
6. Preview。
7. 查询和回收站。

### 阶段 B：Artifact Core

1. Artifact Type Registry。
2. Artifact / Version。
3. Schema Validation。
4. Agent Artifact Writer。
5. Artifact Editor Contract。

### 阶段 C：Link 与 Provenance

1. Resource Link Service。
2. Provenance Record。
3. Agent / Generation Integration。
4. Reference Query。
5. 删除影响分析。

### 阶段 D：Apply 与 Legacy

1. Artifact Apply Preview。
2. Domain Apply Adapter。
3. Legacy Asset Import。
4. GC 和审计。

---

## 30. 验收标准

### 数据正确性

- AssetVersion 和 ArtifactVersion 创建后不可原地修改。
- Task、Run 和 Job 使用的资源全部固定具体 Version。
- 同 Blob 可以被多个 Version 复用。
- 删除逻辑资源不会立即破坏历史引用。
- Purge 不允许删除仍被 Hard Reference 使用的内容。

### Agent 闭环

- Agent Skill 可以读取固定 AssetVersion。
- 结构化输出可以创建经过 Schema 校验的 ArtifactVersion。
- Artifact 可以展示来源 Agent、Skill、Run 和 Context。
- 用户编辑 Artifact 后创建新版本，原 Agent 输出仍可查看。

### Generation 闭环

- GenerationJob 成功结果自动创建 Asset。
- 多结果任务创建多个 Asset，而不是多个 Version。
- 输出能够追溯 Provider、Model、参数和输入 Version。

### 前端体验

- Asset Grid 不读取完整 Version 历史。
- Asset Inspector 可查看版本、引用和来源。
- Artifact Apply 前展示 Diff 和影响范围。
- Pinned 与 Current Reference 在 UI 中清晰区分。

### Legacy 边界

- 旧 `/api/asset-library` 不受影响。
- Studio V2 不隐式双写 `asset_library.json`。
- Legacy 文件可以通过显式 Ingest 转为 Studio Asset。

---

## 31. 最终结论

Studio V2 的资源层采用四个稳定核心：

```text
Blob：不可变物理内容
Asset / AssetVersion：可复用媒体和文件
Artifact / ArtifactVersion：可审阅结构化成果
Resource Link + Provenance：引用关系和来源血缘
```

Agent、GenerationJob、Canvas 和影视创作领域对象都只能通过稳定 Resource ID 和 Version ID 连接，不依赖文件路径、临时 URL 或供应商原始返回。

该模型完成后，后续 GenerationJob 状态机、Script / Character / Scene / Shot / Storyboard 设计和 Agent 内置 Skill 都可以建立在同一资源与版本基础上。