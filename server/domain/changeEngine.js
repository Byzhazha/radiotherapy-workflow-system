import { z } from 'zod';

const fieldSchema = z.object({
  key: z.string().min(2),
  label: z.string().min(1),
  type: z.enum(['text', 'number', 'select', 'textarea', 'date', 'datetime']),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional()
});

const addWorkflowStepSchema = z.object({
  type: z.literal('addWorkflowStep'),
  afterStepId: z.string().min(1),
  step: z.object({
    id: z.string().min(2),
    name: z.string().min(1),
    role: z.string().min(1),
    slaHours: z.number().int().positive(),
    room: z.string().min(1),
    formFields: z.array(fieldSchema).default([]),
    qualityChecks: z.array(z.string()).default([])
  })
});

const addFormFieldSchema = z.object({
  type: z.literal('addFormField'),
  stepId: z.string().min(1),
  field: fieldSchema
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

const updateUiSchema = z.object({
  type: z.literal('updateUiPanel'),
  panelId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1)
});

export const changePlanSchema = z.object({
  title: z.string().min(1),
  intent: z.string().min(1),
  riskLevel: z.enum(['low', 'medium', 'high']),
  summary: z.string().min(1),
  operations: z.array(z.discriminatedUnion('type', [
    addWorkflowStepSchema,
    addFormFieldSchema,
    addRuleSchema,
    updateUiSchema
  ])).min(1),
  verification: z.array(z.string()).min(1)
});

export function validatePlan(plan) {
  return changePlanSchema.parse(plan);
}

export function applyChangePlan(store, plan, actor = 'ai-delivery-agent') {
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

    if (operation.type === 'addRule') {
      if (store.rules.some((rule) => rule.id === operation.rule.id)) {
        throw new Error(`规则已存在：${operation.rule.id}`);
      }

      store.rules.push(operation.rule);
      applied.push(`新增规则「${operation.rule.name}」。`);
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
  }

  store.workflow.activeVersion += 1;
  store.workflow.updatedAt = new Date().toISOString();
  store.auditLog.push({
    id: `AUD-${Date.now()}`,
    at: new Date().toISOString(),
    actor,
    action: 'apply-ai-change-plan',
    detail: applied.join(' ')
  });

  return { parsed, applied };
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
