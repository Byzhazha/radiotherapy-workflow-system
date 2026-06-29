import { z } from 'zod';

const fieldSchema = z.object({
  key: z.string().min(2),
  label: z.string().min(1),
  type: z.enum(['text', 'number', 'select', 'textarea', 'date', 'datetime']),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional()
});

const roleIdSchema = z.enum(['registrar', 'doctor', 'physicist', 'technician', 'director', 'nurse']);

const workflowStepSchema = z.object({
  id: z.string().min(2),
  name: z.string().min(1),
  role: roleIdSchema,
  slaHours: z.number().int().positive(),
  room: z.string().min(1),
  formFields: z.array(fieldSchema).default([]),
  qualityChecks: z.array(z.string()).default([])
});

const addWorkflowStepSchema = z.object({
  type: z.literal('addWorkflowStep'),
  afterStepId: z.string().min(1),
  step: workflowStepSchema
});

const updateWorkflowStepSchema = z.object({
  type: z.literal('updateWorkflowStep'),
  stepId: z.string().min(1),
  patch: z.object({
    name: z.string().min(1).optional(),
    role: roleIdSchema.optional(),
    slaHours: z.number().int().positive().optional(),
    room: z.string().min(1).optional(),
    qualityChecks: z.array(z.string()).optional()
  }).refine((patch) => Object.keys(patch).length > 0, 'updateWorkflowStep.patch 至少需要一个字段。')
});

const removeWorkflowStepSchema = z.object({
  type: z.literal('removeWorkflowStep'),
  stepId: z.string().min(1),
  migratePatientsToStepId: z.string().min(1),
  reason: z.string().min(1)
});

const addFormFieldSchema = z.object({
  type: z.literal('addFormField'),
  stepId: z.string().min(1),
  field: fieldSchema
});

const updateFormFieldSchema = z.object({
  type: z.literal('updateFormField'),
  stepId: z.string().min(1),
  fieldKey: z.string().min(1),
  patch: z.object({
    label: z.string().min(1).optional(),
    type: z.enum(['text', 'number', 'select', 'textarea', 'date', 'datetime']).optional(),
    required: z.boolean().optional(),
    options: z.array(z.string()).optional()
  }).refine((patch) => Object.keys(patch).length > 0, 'updateFormField.patch 至少需要一个字段。')
});

const removeFormFieldSchema = z.object({
  type: z.literal('removeFormField'),
  stepId: z.string().min(1),
  fieldKey: z.string().min(1),
  reason: z.string().min(1)
});

const addRuleSchema = z.object({
  type: z.literal('addRule'),
  rule: z.object({
    id: z.string().min(2),
    name: z.string().min(1),
    expression: z.string().min(1),
    action: z.string().min(1),
    severity: z.enum(['info', 'medium', 'high', 'critical']),
    enabled: z.boolean().default(true)
  })
});

const updateRuleSchema = z.object({
  type: z.literal('updateRule'),
  ruleId: z.string().min(1),
  patch: z.object({
    name: z.string().min(1).optional(),
    expression: z.string().min(1).optional(),
    action: z.string().min(1).optional(),
    severity: z.enum(['info', 'medium', 'high', 'critical']).optional(),
    enabled: z.boolean().optional()
  }).refine((patch) => Object.keys(patch).length > 0, 'updateRule.patch 至少需要一个字段。')
});

const removeRuleSchema = z.object({
  type: z.literal('removeRule'),
  ruleId: z.string().min(1),
  reason: z.string().min(1)
});

const updateUiSchema = z.object({
  type: z.literal('updateUiPanel'),
  panelId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1)
});

const layoutSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  source: z.enum(['workflow', 'patients', 'appointments', 'qaReports', 'followUps', 'rules', 'deployments', 'aiJobs', 'reports']),
  display: z.enum(['timeline', 'queue', 'list', 'cards', 'chart', 'diff', 'approval', 'table']),
  columns: z.number().int().min(1).max(3).default(1),
  visible: z.boolean().default(true)
});

const upsertLayoutSchema = z.object({
  type: z.literal('upsertUiLayout'),
  layout: z.object({
    pageId: z.string().min(1),
    title: z.string().min(1),
    sections: z.array(layoutSectionSchema).min(1)
  })
});

const reportTemplateSchema = z.object({
  id: z.string().min(2),
  name: z.string().min(1),
  audience: z.string().min(1),
  dataset: z.enum(['patients', 'appointments', 'qaReports', 'followUps', 'rules', 'deployments']),
  fields: z.array(z.string().min(1)).min(1),
  schedule: z.enum(['manual', 'daily', 'weekly', 'monthly']),
  enabled: z.boolean().default(true)
});

const upsertReportTemplateSchema = z.object({
  type: z.literal('upsertReportTemplate'),
  template: reportTemplateSchema
});

const permissionPatchSchema = z.object({
  canEditPatients: z.boolean().optional(),
  canManageWorkflow: z.boolean().optional(),
  canApproveDeployments: z.boolean().optional(),
  canRollbackDeployments: z.boolean().optional(),
  canViewReports: z.boolean().optional(),
  workflowStepIds: z.array(z.string().min(1)).optional()
}).refine((patch) => Object.keys(patch).length > 0, 'updatePermission.patch 至少需要一个字段。');

const updatePermissionSchema = z.object({
  type: z.literal('updatePermission'),
  roleId: roleIdSchema,
  patch: permissionPatchSchema
});

export const changePlanSchema = z.object({
  title: z.string().min(1),
  intent: z.string().min(1),
  riskLevel: z.enum(['low', 'medium', 'high']),
  summary: z.string().min(1),
  operations: z.array(z.discriminatedUnion('type', [
    addWorkflowStepSchema,
    updateWorkflowStepSchema,
    removeWorkflowStepSchema,
    addFormFieldSchema,
    updateFormFieldSchema,
    removeFormFieldSchema,
    addRuleSchema,
    updateRuleSchema,
    removeRuleSchema,
    updateUiSchema,
    upsertLayoutSchema,
    upsertReportTemplateSchema,
    updatePermissionSchema
  ])).min(1),
  verification: z.array(z.string()).min(1)
});

export function validatePlan(plan) {
  return changePlanSchema.parse(plan);
}

export function cloneConfigSlice(store) {
  // The AI delivery path only versions configurable product behavior, not
  // patient charts or operational records.
  return JSON.parse(JSON.stringify({
    workflow: store.workflow,
    rules: store.rules || [],
    uiPanels: store.uiPanels || [],
    uiLayouts: store.uiLayouts || [],
    reportTemplates: store.reportTemplates || [],
    permissionMatrix: store.permissionMatrix || {}
  }));
}

export function applyConfigSlice(store, config) {
  store.workflow = config.workflow;
  store.rules = config.rules || [];
  store.uiPanels = config.uiPanels || [];
  store.uiLayouts = config.uiLayouts || [];
  store.reportTemplates = config.reportTemplates || [];
  store.permissionMatrix = config.permissionMatrix || {};
  return store;
}

export function diffConfigSlices(before, after) {
  const changes = [];
  const afterStepIds = new Set(after.workflow.steps.map((step) => step.id));

  for (const step of after.workflow.steps) {
    const previous = before.workflow.steps.find((item) => item.id === step.id);
    if (!previous) {
      changes.push({ area: 'workflow', action: 'added', id: step.id, title: step.name });
    } else if (JSON.stringify(previous) !== JSON.stringify(step)) {
      changes.push({ area: 'workflow', action: 'updated', id: step.id, title: step.name });
    }
  }

  for (const step of before.workflow.steps) {
    if (!afterStepIds.has(step.id)) {
      changes.push({ area: 'workflow', action: 'removed', id: step.id, title: step.name });
    }
  }

  for (const collectionName of ['rules', 'uiPanels', 'uiLayouts', 'reportTemplates']) {
    const idKey = collectionName === 'uiPanels' ? 'panelId' : collectionName === 'uiLayouts' ? 'pageId' : 'id';
    const beforeItems = before[collectionName] || [];
    const afterItems = after[collectionName] || [];
    const afterIds = new Set(afterItems.map((item) => item[idKey]));

    for (const item of afterItems) {
      const previous = beforeItems.find((candidate) => candidate[idKey] === item[idKey]);
      if (!previous) {
        changes.push({ area: collectionName, action: 'added', id: item[idKey], title: item.name || item.title || item[idKey] });
      } else if (JSON.stringify(previous) !== JSON.stringify(item)) {
        changes.push({ area: collectionName, action: 'updated', id: item[idKey], title: item.name || item.title || item[idKey] });
      }
    }

    for (const item of beforeItems) {
      if (!afterIds.has(item[idKey])) {
        changes.push({ area: collectionName, action: 'removed', id: item[idKey], title: item.name || item.title || item[idKey] });
      }
    }
  }

  const roles = new Set([
    ...Object.keys(before.permissionMatrix || {}),
    ...Object.keys(after.permissionMatrix || {})
  ]);
  for (const roleId of roles) {
    if (JSON.stringify(before.permissionMatrix?.[roleId] || null) !== JSON.stringify(after.permissionMatrix?.[roleId] || null)) {
      changes.push({ area: 'permissionMatrix', action: 'updated', id: roleId, title: roleId });
    }
  }

  return changes;
}

function createAuditLog(actor, detail) {
  return {
    id: `AUD-${Date.now()}`,
    at: new Date().toISOString(),
    actor,
    action: 'apply-ai-change-plan',
    detail
  };
}

export function applyChangePlan(store, plan, actor = 'ai-delivery-agent', options = {}) {
  const parsed = validatePlan(plan);
  const applied = [];

  for (const operation of parsed.operations) {
    if (operation.type === 'addWorkflowStep') {
      const afterIndex = store.workflow.steps.findIndex((step) => step.id === operation.afterStepId);
      if (afterIndex < 0) {
        throw new Error(`流程节点不存在：${operation.afterStepId}`);
      }

      if (store.workflow.steps.some((step) => step.id === operation.step.id)) {
        throw new Error(`流程节点已存在：${operation.step.id}`);
      }

      store.workflow.steps.splice(afterIndex + 1, 0, operation.step);
      applied.push(`新增流程节点「${operation.step.name}」。`);
    }

    if (operation.type === 'updateWorkflowStep') {
      const step = store.workflow.steps.find((item) => item.id === operation.stepId);
      if (!step) {
        throw new Error(`流程节点不存在：${operation.stepId}`);
      }

      Object.assign(step, operation.patch);
      applied.push(`更新流程节点「${step.name}」。`);
    }

    if (operation.type === 'removeWorkflowStep') {
      const stepIndex = store.workflow.steps.findIndex((item) => item.id === operation.stepId);
      if (stepIndex < 0) {
        throw new Error(`流程节点不存在：${operation.stepId}`);
      }

      if (operation.stepId === operation.migratePatientsToStepId) {
        throw new Error('删除节点的患者迁移目标不能是自身。');
      }

      const targetStep = store.workflow.steps.find((item) => item.id === operation.migratePatientsToStepId);
      if (!targetStep) {
        throw new Error(`迁移目标流程节点不存在：${operation.migratePatientsToStepId}`);
      }

      const [removed] = store.workflow.steps.splice(stepIndex, 1);
      for (const patient of store.patients || []) {
        if (patient.currentStepId === removed.id) {
          patient.currentStepId = targetStep.id;
          patient.status = targetStep.id;
        }
      }
      applied.push(`删除流程节点「${removed.name}」，相关患者迁移到「${targetStep.name}」。`);
    }

    if (operation.type === 'addFormField') {
      const step = store.workflow.steps.find((item) => item.id === operation.stepId);
      if (!step) {
        throw new Error(`表单所属流程不存在：${operation.stepId}`);
      }

      if (step.formFields.some((field) => field.key === operation.field.key)) {
        throw new Error(`字段已存在：${operation.field.key}`);
      }

      step.formFields.push(operation.field);
      applied.push(`在「${step.name}」增加字段「${operation.field.label}」。`);
    }

    if (operation.type === 'updateFormField') {
      const step = store.workflow.steps.find((item) => item.id === operation.stepId);
      if (!step) {
        throw new Error(`表单所属流程不存在：${operation.stepId}`);
      }

      const field = step.formFields.find((item) => item.key === operation.fieldKey);
      if (!field) {
        throw new Error(`字段不存在：${operation.fieldKey}`);
      }

      Object.assign(field, operation.patch);
      applied.push(`更新「${step.name}」字段「${field.label}」。`);
    }

    if (operation.type === 'removeFormField') {
      const step = store.workflow.steps.find((item) => item.id === operation.stepId);
      if (!step) {
        throw new Error(`表单所属流程不存在：${operation.stepId}`);
      }

      const fieldIndex = step.formFields.findIndex((item) => item.key === operation.fieldKey);
      if (fieldIndex < 0) {
        throw new Error(`字段不存在：${operation.fieldKey}`);
      }

      const [removed] = step.formFields.splice(fieldIndex, 1);
      applied.push(`删除「${step.name}」字段「${removed.label}」。`);
    }

    if (operation.type === 'addRule') {
      if (store.rules.some((rule) => rule.id === operation.rule.id)) {
        throw new Error(`规则已存在：${operation.rule.id}`);
      }

      store.rules.push(operation.rule);
      applied.push(`新增规则「${operation.rule.name}」。`);
    }

    if (operation.type === 'updateRule') {
      const rule = store.rules.find((item) => item.id === operation.ruleId);
      if (!rule) {
        throw new Error(`规则不存在：${operation.ruleId}`);
      }

      Object.assign(rule, operation.patch);
      applied.push(`更新规则「${rule.name}」。`);
    }

    if (operation.type === 'removeRule') {
      const ruleIndex = store.rules.findIndex((item) => item.id === operation.ruleId);
      if (ruleIndex < 0) {
        throw new Error(`规则不存在：${operation.ruleId}`);
      }

      const [removed] = store.rules.splice(ruleIndex, 1);
      applied.push(`删除规则「${removed.name}」。`);
    }

    if (operation.type === 'updateUiPanel') {
      store.uiPanels ||= [];
      const existing = store.uiPanels.find((panel) => panel.panelId === operation.panelId);
      if (existing) {
        existing.title = operation.title;
        existing.description = operation.description;
      } else {
        store.uiPanels.push(operation);
      }
      applied.push(`更新界面面板「${operation.title}」。`);
    }

    if (operation.type === 'upsertUiLayout') {
      store.uiLayouts ||= [];
      const existingIndex = store.uiLayouts.findIndex((layout) => layout.pageId === operation.layout.pageId);
      if (existingIndex >= 0) {
        store.uiLayouts[existingIndex] = operation.layout;
      } else {
        store.uiLayouts.push(operation.layout);
      }
      applied.push(`更新页面布局「${operation.layout.title}」。`);
    }

    if (operation.type === 'upsertReportTemplate') {
      store.reportTemplates ||= [];
      const existingIndex = store.reportTemplates.findIndex((template) => template.id === operation.template.id);
      if (existingIndex >= 0) {
        store.reportTemplates[existingIndex] = operation.template;
      } else {
        store.reportTemplates.push(operation.template);
      }
      applied.push(`更新报表模板「${operation.template.name}」。`);
    }

    if (operation.type === 'updatePermission') {
      store.permissionMatrix ||= {};
      const current = store.permissionMatrix[operation.roleId] || {};
      store.permissionMatrix[operation.roleId] = {
        ...current,
        ...operation.patch
      };
      applied.push(`更新角色权限「${operation.roleId}」。`);
    }
  }

  if (options.bumpVersion !== false) {
    store.workflow.activeVersion += 1;
    store.workflow.updatedAt = new Date().toISOString();
  }

  if (options.audit !== false) {
    store.auditLog.push(createAuditLog(actor, applied.join(' ')));
  }

  return { parsed, applied };
}

export function simulateChangePlan(store, plan) {
  // Sandbox execution reuses the production change engine against a deep clone
  // so validation, diffs, and previews match the eventual approval behavior.
  const sandboxStore = JSON.parse(JSON.stringify(store));
  const before = cloneConfigSlice(sandboxStore);
  const result = applyChangePlan(sandboxStore, plan, 'ai-sandbox', { audit: false, bumpVersion: false });
  const after = cloneConfigSlice(sandboxStore);

  return {
    plan: result.parsed,
    applied: result.applied,
    before,
    after,
    diff: diffConfigSlices(before, after),
    sandboxStore,
    preview: {
      workflow: after.workflow,
      rules: after.rules,
      uiPanels: after.uiPanels,
      uiLayouts: after.uiLayouts,
      reportTemplates: after.reportTemplates,
      permissionMatrix: after.permissionMatrix
    }
  };
}

export function runClinicalRegression(store, plan) {
  const checks = [];
  const stepIds = new Set();
  let hasDuplicateStep = false;

  for (const step of store.workflow.steps) {
    if (stepIds.has(step.id)) {
      hasDuplicateStep = true;
    }
    stepIds.add(step.id);
  }

  const stepIdList = store.workflow.steps.map((step) => step.id);
  checks.push({
    name: '流程节点唯一性',
    passed: !hasDuplicateStep,
    detail: hasDuplicateStep ? '发现重复节点ID。' : `共 ${store.workflow.steps.length} 个流程节点，ID 均唯一。`
  });

  const missingRole = store.workflow.steps.find((step) => !store.roles.some((role) => role.id === step.role));
  checks.push({
    name: '角色权限闭环',
    passed: !missingRole,
    detail: missingRole ? `节点 ${missingRole.name} 使用未知角色 ${missingRole.role}。` : '每个节点都绑定到已登记角色。'
  });

  const missingRequiredFields = store.workflow.steps.filter((step) => !Array.isArray(step.formFields));
  checks.push({
    name: '表单定义完整性',
    passed: missingRequiredFields.length === 0,
    detail: missingRequiredFields.length ? '部分节点缺少表单字段数组。' : '节点表单均可由客户端渲染。'
  });

  const patientsOnMissingStep = store.patients.filter((patient) => !stepIds.has(patient.currentStepId));
  checks.push({
    name: '在管患者流程落点',
    passed: patientsOnMissingStep.length === 0,
    detail: patientsOnMissingStep.length ? `存在患者停留在已删除节点：${patientsOnMissingStep.map((patient) => patient.id).join('、')}。` : '所有在管患者都停留在有效流程节点。'
  });

  const requiredFieldsWithoutLabel = store.workflow.steps.flatMap((step) =>
    step.formFields.filter((field) => field.required && !field.label).map((field) => `${step.id}.${field.key}`)
  );
  checks.push({
    name: '必填表单可执行性',
    passed: requiredFieldsWithoutLabel.length === 0,
    detail: requiredFieldsWithoutLabel.length ? `必填字段缺少展示名称：${requiredFieldsWithoutLabel.join('、')}。` : '必填字段都有可展示名称。'
  });

  const blockingRules = store.rules.filter((rule) => rule.enabled && rule.severity === 'critical');
  checks.push({
    name: '关键规则保留',
    passed: blockingRules.length > 0,
    detail: blockingRules.length ? `保留 ${blockingRules.length} 条关键阻断规则。` : '缺少关键阻断规则，不能进入发布。'
  });

  const invalidPermissionSteps = Object.entries(store.permissionMatrix || {}).flatMap(([roleId, permission]) =>
    (permission.workflowStepIds || []).filter((stepId) => !stepIds.has(stepId)).map((stepId) => `${roleId}.${stepId}`)
  );
  checks.push({
    name: '权限矩阵流程引用',
    passed: invalidPermissionSteps.length === 0,
    detail: invalidPermissionSteps.length ? `权限引用了不存在的流程节点：${invalidPermissionSteps.join('、')}。` : '角色权限只引用有效流程节点。'
  });

  const invalidLayouts = (store.uiLayouts || []).filter((layout) => !Array.isArray(layout.sections) || layout.sections.length === 0);
  checks.push({
    name: '页面布局可渲染',
    passed: invalidLayouts.length === 0,
    detail: invalidLayouts.length ? `布局缺少可渲染区块：${invalidLayouts.map((layout) => layout.pageId).join('、')}。` : '页面布局都有可渲染区块。'
  });

  const invalidReports = (store.reportTemplates || []).filter((template) => !template.fields?.length || !template.dataset);
  checks.push({
    name: '报表模板数据契约',
    passed: invalidReports.length === 0,
    detail: invalidReports.length ? `报表模板缺少数据字段：${invalidReports.map((template) => template.id).join('、')}。` : '报表模板都有明确数据集和字段。'
  });

  const mustKeepTreatmentPath = ['registration', 'consultation', 'plan-design', 'physics-review', 'treatment-schedule'];
  const missingTreatmentPath = mustKeepTreatmentPath.filter((stepId) => !stepIdList.includes(stepId));
  checks.push({
    name: '核心治疗路径保留',
    passed: missingTreatmentPath.length === 0,
    detail: missingTreatmentPath.length ? `核心路径缺少节点：${missingTreatmentPath.join('、')}。` : '登记、会诊、计划、物理审核和治疗排程路径完整。'
  });

  const highRiskPlan = plan.riskLevel === 'high';
  checks.push({
    name: '高风险变更人工确认',
    passed: true,
    detail: highRiskPlan ? '变更标记为高风险，发布记录已要求人工验收。' : '变更风险等级允许自动进入预览环境。'
  });

  return {
    passed: checks.every((check) => check.passed),
    checks
  };
}
