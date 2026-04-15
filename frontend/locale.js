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
    'pipeline.openCommit': 'Open commit on GitHub',
    'pipeline.revealFile': 'Reveal in Finder',

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
    'panel.collapse': 'COLLAPSE',
    'panel.expand': 'EXPAND',
    'kanban.tasks': 'TASKS',
    'kanban.taskId': 'TASK_ID: ',
    'kanban.dep': 'DEP: ',
    'kanban.depNull': 'DEP: NULL',
    'kanban.evidence': ' EVIDENCE',

    // Telemetry
    'telemetry.title': 'System Telemetry',
    'telemetry.totalIterations': 'Total Iterations',
    'telemetry.featureTasks': 'Features / Tasks',
    'telemetry.avgTaskTime': 'Avg Task Time',
    'telemetry.reviewFixRate': 'Review Fix Rate',
    'telemetry.inProgress': 'In Progress',
    'telemetry.completed': 'Completed',
    'telemetry.delivered': 'Delivered',
    'telemetry.minPerTask': 'min/task',
    'telemetry.skillRanking': 'Skill Performance Ranking',
    'telemetry.noSkillData': 'No skill data yet',
    'telemetry.calls': ' CALLS',
    'telemetry.seconds': 's',

    // Activity
    'activity.title': 'Activity Stream',
    'activity.totalActivities': 'Total Activities',
    'activity.successRate': 'Success Rate',
    'activity.avgDuration': 'Avg Duration',
    'activity.noActivity': 'No Activity',
    'activity.noActivityHint': 'Skill invocations and tool calls will appear here as you work.',
    'activity.success': 'SUCCESS',
    'activity.failed': 'FAILED',

    // Memory
    'memory.title': 'Cognitive Memory',
    'memory.noFacts': 'No Memory Facts',
    'memory.noFactsHint': 'Project knowledge and learned patterns are stored here.',
    'memory.noFactsCmd': '/apex-forge-memory add',
    'memory.totalMemories': 'Total Memories',
    'memory.globalMemories': 'Global',
    'memory.projectMemories': 'Project',
    'memory.globalLayer': 'Global Memory',
    'memory.projectLayer': 'Project Memory',
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
    'home.guide': '? GUIDE',
    'home.guideTitle': 'How to add a project',
    'home.guideText': 'Run this command in your project directory:',
    'home.guideHint': 'The project will appear here automatically.',
    'home.searchPlaceholder': 'Search projects...',
    'home.statusAll': 'All',
    'home.statusRunning': 'Running',
    'home.statusActive': 'Active',
    'home.statusArchived': 'Archived',
    'home.sortRecent': 'Recent',
    'home.sortName': 'Name',
    'home.sortSuccess': 'Success',
    'home.hideProject': 'Hide project',
    'home.allHidden': '{count} project(s) hidden',
    'home.unhideAll': 'Show all projects',
    'home.subtitle': '{count} projects \u00b7 {active} active \u00b7 {archived} archived',

    // Session
    'session.apexId': 'Apex Session',
    'session.stage': 'Stage',
    'session.lastActive': 'Last active',
    'session.sessions': 'sessions',

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
    'pipeline.openCommit': '在 GitHub 上查看此提交',
    'pipeline.revealFile': '在 Finder 中显示',

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
    'panel.collapse': '收起',
    'panel.expand': '展开',
    'kanban.tasks': '个任务',
    'kanban.taskId': '任务ID：',
    'kanban.dep': '依赖：',
    'kanban.depNull': '依赖：无',
    'kanban.evidence': ' 条证据',

    // Telemetry
    'telemetry.title': '系统遥测',
    'telemetry.totalIterations': '总迭代数',
    'telemetry.featureTasks': '功能/任务数',
    'telemetry.avgTaskTime': '平均任务耗时',
    'telemetry.reviewFixRate': 'Review 修复率',
    'telemetry.inProgress': '进行中',
    'telemetry.completed': '已完成',
    'telemetry.delivered': '已交付',
    'telemetry.minPerTask': 'min/task',
    'telemetry.skillRanking': 'Skill 性能排行',
    'telemetry.noSkillData': '暂无 Skill 数据',
    'telemetry.calls': ' 次调用',
    'telemetry.seconds': '秒',

    // Activity
    'activity.title': '活动流',
    'activity.totalActivities': '总活动数',
    'activity.successRate': '活动成功率',
    'activity.avgDuration': '平均活动耗时',
    'activity.noActivity': '暂无活动',
    'activity.noActivityHint': 'Skill 调用和工具操作将在你工作时自动记录在此。',
    'activity.success': '成功',
    'activity.failed': '失败',

    // Memory
    'memory.title': '认知记忆',
    'memory.totalMemories': '总记忆数',
    'memory.globalMemories': '全局',
    'memory.projectMemories': '项目',
    'memory.noFacts': '暂无记忆',
    'memory.noFactsHint': '项目知识和学习到的模式会存储在此。',
    'memory.noFactsCmd': '/apex-forge-memory add',
    'memory.globalLayer': '全局记忆',
    'memory.projectLayer': '项目记忆',
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
    'home.guide': '? 指引',
    'home.guideTitle': '如何添加项目',
    'home.guideText': '在你的项目目录运行：',
    'home.guideHint': '项目会自动出现在这里。',
    'home.searchPlaceholder': '搜索项目…',
    'home.statusAll': '全部',
    'home.statusRunning': '运行中',
    'home.statusActive': '活跃',
    'home.statusArchived': '已归档',
    'home.sortRecent': '最近',
    'home.sortName': '名称',
    'home.sortSuccess': '成功率',
    'home.hideProject': '隐藏项目',
    'home.allHidden': '已隐藏 {count} 个项目',
    'home.unhideAll': '显示全部项目',
    'home.subtitle': '{count} 个项目 \u00b7 {active} 个活跃 \u00b7 {archived} 个归档',

    // Session
    'session.apexId': 'Apex Session',
    'session.stage': '阶段',
    'session.lastActive': '最后活跃',
    'session.sessions': '个会话',

    // Common
    'common.connected': '已连接',
    'common.projectPrefix': '项目：',
    'common.tasks': ' 个任务 \u00b7 ',
  }
};
