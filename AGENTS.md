# AGENTS.md — 项目工作流约定

本文件定义 AI agent 在本项目中必须遵循的工作流程与文档约定。所有 agent 会话（Claude Code、Cursor、Copilot 等）均应遵守。

## 工作流总览

按 agent-skills 的生命周期执行，每个阶段有人工评审门禁，未获确认不得进入下一阶段：

```
DEFINE（需求定义）
  ├─ 需求模糊 → interview-me（一次一问，澄清至 ~95% 置信度）
  ├─ 仅为想法 → idea-refine（发散收敛，产出想法一页纸）
  └─ 意图明确 → spec-driven-development
PLAN（规划）→ planning-and-task-breakdown
BUILD（实施）→ incremental-implementation + test-driven-development
VERIFY（验证）→ debugging-and-error-recovery
REVIEW（审查）→ code-review-and-quality
SHIP（发布）→ shipping-and-launch
```

## 需求澄清产物（DEFINE 阶段）

- `interview-me` 产出的意图声明：经用户**明确确认**后保存到 `docs/intent/<topic>.md`
- `idea-refine` 产出的一页纸（Problem / Direction / Assumptions / MVP / Not Doing）：经确认后保存到 `docs/ideas/<idea-name>.md`
- **未经用户确认，禁止落盘任何文档**
- 这些文档是 spec 的输入，不是流程终点

## Spec 规范（spec-driven-development）

- 大需求先产出**能力地图**（模块表 + 依赖方向 + 构建顺序），经用户评审后才写各模块 spec
- 模块 id 使用 kebab-case，一旦确定不改名
- 逐模块递归执行 Specify → Plan → Tasks → Implement
- 接口契约遵循 Contract First，设计规范使用 `api-and-interface-design`；模块间契约写入**提供方模块**的 spec
- 架构选型决策（框架、数据库、消息中间件等）同步用 `documentation-and-adrs` 记录 ADR，记录"为什么"，包括被否掉的备选方案

### 文档存放位置（本项目的覆盖约定）

```
docs/
├── specs/
│   ├── CAPABILITY-MAP.md          ← 全局能力地图（跨功能共享，作为模块索引）
│   ├── SPEC-<module-id>.md        ← 各模块/功能 spec，按 module-id 命名
│   └── SPEC.md                    ← 单能力小需求可直接用此名
├── intent/<topic>.md              ← interview-me 意图声明
├── ideas/<idea-name>.md           ← idea-refine 想法一页纸
└── adr/
    ├── ADR-001-xxx.md             ← 架构决策记录，顺序编号，沿用现有序号
    └── ADR-002-xxx.md
```

- ADR 只增不改：决策变更时写新 ADR 并标记旧的为 Superseded，**不删除旧记录**

## 任务规范（planning-and-task-breakdown）

- **按功能隔离任务目录**，每个功能/initiative 一套，支持并行开发：

```
tasks/
├── <feature-name>/
│   ├── plan.md                    ← 该功能的实施计划
│   └── todo.md                    ← 该功能的任务清单
```

- 新功能启动时先建 spec（评审通过），再创建对应 `tasks/<feature-name>/`
- **禁止覆盖未完成的计划**：写入 plan/todo 前检查目标文件是否还有未勾选任务；属于不同工作则停下来询问用户
- 任务尺寸：S（1–2 文件）/ M（3–5 文件）为宜；L（5–8）必须再拆；XL（8+）禁止
- 拆分采用**垂直切片**（一个完整用户路径一个任务），不做水平分层（先全部 DB 再全部 API 再全部 UI）
- 每个任务必须包含：验收标准（≤3 条）、验证步骤（测试/构建/手动检查）、依赖关系、涉及文件
- 任务清单按 Phase 分组，每 2–3 个任务设一个 Checkpoint（测试通过、构建干净、核心流程可用、需人工确认后再继续）

## 实施规范（BUILD）

- 一次执行一个任务，完成后立即勾选并验证
- TDD：先写失败的测试，再实现，再重构（red-green-refactor）
- 框架/库用法拿不准时，用 `source-driven-development` 对照官方文档，不凭记忆写 API
- 高风险/不可逆操作前，用 `doubt-driven-development` 做对抗性审查

## Boundaries

- **Always**: 提交前跑测试；遵循本文件的命名与目录约定；在系统边界校验外部输入
- **Ask first**: 新增依赖、数据库 schema 变更、修改 CI 配置、覆盖未完成的计划文件
- **Never**: 提交 secrets；未经 spec 评审直接开始实现；删除旧 ADR；注释掉代码代替删除

## 提交与 PR

- 提交遵循 `git-workflow-and-versioning`
- PR 描述中链接回所实现的 spec 章节（`docs/specs/SPEC-<module-id>.md#章节`）
- spec 是唯一事实来源：需求或决策变更时，**先改 spec / 写新 ADR，再改代码**
