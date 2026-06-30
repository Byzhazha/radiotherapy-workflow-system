import { validatePlan } from './changeEngine.js';

function extractJson(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');

  if (start < 0 || end < start) {
    throw new Error('AI响应中未找到JSON对象。');
  }

  return JSON.parse(body.slice(start, end + 1));
}

function buildOperationGuide() {
  // Keep the provider prompt compact while preserving the schema contract needed by the backend validator.
  return [
    '{"type":"addWorkflowStep","afterStepId":"existing-step-id","step":{id,name,role,slaHours,room,formFields,qualityChecks}}',
    '{"type":"updateWorkflowStep","stepId":"existing-step-id","patch":{name,role,slaHours,room,qualityChecks}}',
    '{"type":"removeWorkflowStep","stepId":"existing-step-id","migratePatientsToStepId":"existing-step-id","reason":"string"}',
    '{"type":"addFormField","stepId":"existing-step-id","field":{key,label,type,required,options}}',
    '{"type":"updateFormField","stepId":"existing-step-id","fieldKey":"existing-field-key","patch":{label,type,required,options}}',
    '{"type":"removeFormField","stepId":"existing-step-id","fieldKey":"existing-field-key","reason":"string"}',
    '{"type":"addRule","rule":{id,name,expression,action,severity,enabled}}',
    '{"type":"updateRule","ruleId":"existing-rule-id","patch":{name,expression,action,severity,enabled}}',
    '{"type":"removeRule","ruleId":"existing-rule-id","reason":"string"}',
    '{"type":"updateUiPanel","panelId":"stable-panel-id","title":"string","description":"string"}',
    '{"type":"upsertUiLayout","layout":{pageId,title,sections:[{id,title,source,display,columns,visible}]}}',
    '{"type":"upsertReportTemplate","template":{id,name,audience,dataset,fields,schedule,enabled}}',
    '{"type":"updatePermission","roleId":"existing-role-id","patch":{canEditPatients,canManageWorkflow,canApproveDeployments,canRollbackDeployments,canViewReports,workflowStepIds}}'
  ];
}

export function buildPlannerPrompt({ requirement, store }) {
  const workflowSummary = store.workflow.steps.map((step) => ({
    id: step.id,
    name: step.name,
    role: step.role,
    slaHours: step.slaHours,
    fields: step.formFields.map((field) => field.key)
  }));

  // The prompt constrains the agent to a small set of auditable operations so
  // generated work can be validated before it changes a medical workflow.
  return [
    {
      role: 'system',
      content: [
        '你是放疗流程管理系统的AI交付工程师。',
        '你必须只输出一个JSON对象，不能输出Markdown。',
        '你的任务是把用户定制需求转成可审计的代码/配置变更计划。',
        '允许的operation类型只有用户消息 allowedOperations 中列出的类型。',
        '每个operation对象必须使用字段名 type 表示操作类型，不能使用 operation、actionType 或其它字段名替代。',
        '每个operation必须严格符合对应字段结构；如果需求不需要某类operation，就不要输出那类operation。',
        '不要生成真实剂量计算结论，但可以生成剂量质控字段、流程节点和规则。',
        'role 必须从 registrar、doctor、physicist、technician、director、nurse 中选择。',
        'riskLevel 必须是 low、medium、high。',
        '删除流程节点时必须提供 migratePatientsToStepId，保证在管患者仍停留在有效节点。',
        '权限、报表和页面布局只能使用现有数据源与现有角色，不要引入新的基础设施。'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        requirement,
        currentWorkflow: workflowSummary,
        existingRules: store.rules.map((rule) => ({ id: rule.id, name: rule.name, severity: rule.severity, enabled: rule.enabled })),
        existingLayouts: (store.uiLayouts || []).map((layout) => ({ pageId: layout.pageId, title: layout.title, sections: layout.sections.map((section) => section.id) })),
        existingReportTemplates: (store.reportTemplates || []).map((template) => ({ id: template.id, name: template.name, dataset: template.dataset })),
        existingPermissionRoles: Object.keys(store.permissionMatrix || {}),
        allowedOperations: buildOperationGuide(),
        responseShape: {
          title: 'string',
          intent: 'string',
          riskLevel: 'low|medium|high',
          summary: 'string',
          operations: ['operation objects matching allowedOperations'],
          verification: ['自动化验证点']
        }
      })
    }
  ];
}

export async function requestAiChangePlan({ requirement, store, aiClient }) {
  if (!aiClient?.completeJson) {
    throw new Error('AI客户端未配置。');
  }

  const messages = buildPlannerPrompt({ requirement, store });
  const content = await aiClient.completeJson(messages);
  const plan = extractJson(content);

  try {
    return validatePlan(plan);
  } catch (error) {
    // Keep the AI path controlled by feeding schema errors back into the model
    // instead of accepting partial operations or patching them with local guesses.
    const repairedContent = await aiClient.completeJson([
      ...messages,
      {
        role: 'assistant',
        content: JSON.stringify(plan)
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: '上一次JSON未通过后端schema校验。请只返回修正后的完整JSON对象。',
          validationError: error.message,
          allowedOperations: buildOperationGuide()
        })
      }
    ]);
    return validatePlan(extractJson(repairedContent));
  }
}
