// Apex Forge Dashboard — i18n string tables
// Usage: t('key') returns the string for the current language.

const LOCALE = {
  en: {
    // Pipeline
    'pipeline.title': 'Pipeline Orchestration',
    'pipeline.statusIdle': 'STATUS: IDLE',
    'pipeline.statusRunning': 'STATUS: RUNNING',
    'pipeline.statusPrefix': 'STATUS: ',
    'pipeline.artifacts': ' Artifacts',
    'pipeline.noArtifacts': 'No Artifacts',
    'pipeline.noArtifactsHint': 'Artifacts are generated as you progress through pipeline stages.',
    'pipeline.noArtifactsCmd': '/apex-forge brainstorm',

    // Stages
    'stage.brainstorm': 'brainstorm',
    'stage.plan': 'plan',
    'stage.execute': 'execute',
    'stage.review': 'review',
    'stage.ship': 'ship',
    'stage.compound': 'compound',

    // Kanban
    'kanban.title': 'Task Orchestration Board',
    'kanban.open': 'OPEN',
    'kanban.assigned': 'ASSIGNED',
    'kanban.inProgress': 'IN PROGRESS',
    'kanban.toVerify': 'TO VERIFY',
    'kanban.done': 'DONE',
    'kanban.noTasks': 'NO TASKS HERE',
    'kanban.noTasksDone': 'NO TASKS COMPLETED',
    'kanban.collapse': 'COLLAPSE',
    'kanban.expand': 'EXPAND',
    'kanban.tasks': 'TASKS',
    'kanban.taskId': 'TASK_ID: ',
    'kanban.dep': 'DEP: ',
    'kanban.depNull': 'DEP: NULL',
    'kanban.evidence': ' EVIDENCE',

    // Telemetry
    'telemetry.title': 'System Telemetry',
    'telemetry.totalRuns': 'Total Runs',
    'telemetry.avgDuration': 'Avg Duration',
    'telemetry.successRate': 'Success Rate',
    'telemetry.skillRanking': 'Skill Performance Ranking',
    'telemetry.noSkillData': 'No skill data yet',
    'telemetry.calls': ' CALLS',
    'telemetry.seconds': 's',

    // Activity
    'activity.title': 'Activity Stream',
    'activity.noActivity': 'No Activity',
    'activity.noActivityHint': 'Skill invocations and tool calls will appear here as you work.',
    'activity.success': 'SUCCESS',
    'activity.failed': 'FAILED',

    // Memory
    'memory.title': 'Cognitive Memory',
    'memory.noFacts': 'No Memory Facts',
    'memory.noFactsHint': 'Project knowledge and learned patterns are stored here.',
    'memory.noFactsCmd': '/apex-forge-memory add',
    'memory.high': 'HIGH',
    'memory.med': 'MED',
    'memory.low': 'LOW',
    'memory.confidence': '_CONFIDENCE',

    // Design Comparison
    'design.title': 'Design Comparison',
    'design.variants': ' VARIANTS',
    'design.snapshotDiff': 'SNAPSHOT DIFF ANALYSIS',
    'design.loading': 'Loading designs...',
    'design.noDesigns': 'No designs yet. Run <code>apex design generate</code> or <code>apex design variants</code> to create designs.',
    'design.loadError': 'Could not load designs.',

    // Navigation
    'nav.dashboard': 'DASHBOARD',
    'nav.designComparison': 'DESIGN COMPARISON',
    'nav.projects': 'PROJECTS',
    'nav.archived': 'ARCHIVED',
    'nav.allProjects': 'ALL PROJECTS',
    'nav.brand': 'APEX FORGE',

    // Home
    'home.title': 'YOUR PROJECTS',
    'home.newProject': '+ NEW PROJECT',
    'home.searchPlaceholder': 'Search projects...',
    'home.filterStatus': 'Status: All',
    'home.filterSort': 'Sort: Recent',
    'home.subtitle': '{count} projects \u00b7 {active} active \u00b7 {archived} archived',

    // Common
    'common.connected': 'CONNECTED',
    'common.projectPrefix': 'PROJECT: ',
    'common.tasks': ' tasks \u00b7 ',
  },

  zh: {
    // Pipeline
    'pipeline.title': '流水线编排',
    'pipeline.statusIdle': '状态：空闲',
    'pipeline.statusRunning': '状态：运行中',
    'pipeline.statusPrefix': '状态：',
    'pipeline.artifacts': ' 产出物',
    'pipeline.noArtifacts': '暂无产出物',
    'pipeline.noArtifactsHint': '随着流水线各阶段推进，产出物将自动记录在此。',
    'pipeline.noArtifactsCmd': '/apex-forge brainstorm',

    // Stages
    'stage.brainstorm': '头脑风暴',
    'stage.plan': '计划',
    'stage.execute': '执行',
    'stage.review': '评审',
    'stage.ship': '交付',
    'stage.compound': '复盘迭代',

    // Kanban
    'kanban.title': '任务编排看板',
    'kanban.open': '待处理',
    'kanban.assigned': '已分配',
    'kanban.inProgress': '进行中',
    'kanban.toVerify': '待验证',
    'kanban.done': '已完成',
    'kanban.noTasks': '暂无任务',
    'kanban.noTasksDone': '暂无已完成任务',
    'kanban.collapse': '收起',
    'kanban.expand': '展开',
    'kanban.tasks': '个任务',
    'kanban.taskId': '任务ID：',
    'kanban.dep': '依赖：',
    'kanban.depNull': '依赖：无',
    'kanban.evidence': ' 条证据',

    // Telemetry
    'telemetry.title': '系统遥测',
    'telemetry.totalRuns': '总运行次数',
    'telemetry.avgDuration': '平均耗时',
    'telemetry.successRate': '成功率',
    'telemetry.skillRanking': 'Skill 性能排行',
    'telemetry.noSkillData': '暂无 Skill 数据',
    'telemetry.calls': ' 次调用',
    'telemetry.seconds': '秒',

    // Activity
    'activity.title': '活动流',
    'activity.noActivity': '暂无活动',
    'activity.noActivityHint': 'Skill 调用和工具操作将在你工作时自动记录在此。',
    'activity.success': '成功',
    'activity.failed': '失败',

    // Memory
    'memory.title': '认知记忆',
    'memory.noFacts': '暂无记忆',
    'memory.noFactsHint': '项目知识和学习到的模式会存储在此。',
    'memory.noFactsCmd': '/apex-forge-memory add',
    'memory.high': '高',
    'memory.med': '中',
    'memory.low': '低',
    'memory.confidence': '_置信度',

    // Design Comparison
    'design.title': '设计对比',
    'design.variants': ' 个变体',
    'design.snapshotDiff': '快照差异分析',
    'design.loading': '加载设计中…',
    'design.noDesigns': '暂无设计。运行 <code>apex design generate</code> 或 <code>apex design variants</code> 创建。',
    'design.loadError': '无法加载设计。',

    // Navigation
    'nav.dashboard': '仪表盘',
    'nav.designComparison': '设计对比',
    'nav.projects': '项目',
    'nav.archived': '已归档',
    'nav.allProjects': '所有项目',
    'nav.brand': 'APEX FORGE',

    // Home
    'home.title': '你的项目',
    'home.newProject': '+ 新建项目',
    'home.searchPlaceholder': '搜索项目…',
    'home.filterStatus': '状态：全部',
    'home.filterSort': '排序：最近',
    'home.subtitle': '{count} 个项目 \u00b7 {active} 个活跃 \u00b7 {archived} 个归档',

    // Common
    'common.connected': '已连接',
    'common.projectPrefix': '项目：',
    'common.tasks': ' 个任务 \u00b7 ',
  }
};
