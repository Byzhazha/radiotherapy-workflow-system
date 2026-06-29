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

function buildOperationContract() {
  return {
    addWorkflowStep: {
      type: 'addWorkflowStep',
      afterStepId: '必须是 currentWorkflow 中已存在的节点ID',
      step: {
        id: 'kebab-case-id',
        name: '中文节点名',
        role: 'registrar|doctor|physicist|technician|director|nurse',
        slaHours: 12,
        room: '工作区域',
        formFields: [{ key: 'fieldKey', label: '字段名', type: 'text|number|select|textarea|date|datetime', required: true }],
        qualityChecks: ['质控项']
      }
    },
    updateWorkflowStep: {
      type: 'updateWorkflowStep',
      stepId: '必须是 currentWorkflow 中已存在的节点ID',
      patch: {
        name: '可选中文节点名',
        role: 'registrar|doctor|physicist|technician|director|nurse',
        slaHours: 12,
        room: '可选工作区域',
        qualityChecks: ['可选质控项']
      }
    },
    removeWorkflowStep: {
      type: 'removeWorkflowStep',
      stepId: '必须是 currentWorkflow 中已存在的节点ID',
      migratePatientsToStepId: '删除节点后患者迁移到的现存节点ID，不能是自身',
      reason: '删除原因'
    },
    addFormField: {
      type: 'addFormField',
      stepId: '必须是 currentWorkflow 中已存在的节点ID',
      field: { key: 'fieldKey', label: '字段名', type: 'text|number|select|textarea|date|datetime', required: true }
    },
    updateFormField: {
      type: 'updateFormField',
      stepId: '必须是 currentWorkflow 中已存在的节点ID',
      fieldKey: '必须是该节点已存在字段key',
      patch: { label: '可选字段名', type: 'text|number|select|textarea|date|datetime', required: true, options: ['可选项'] }
    },
    removeFormField: {
      type: 'removeFormField',
      stepId: '必须是 currentWorkflow 中已存在的节点ID',
      fieldKey: '必须是该节点已存在字段key',
      reason: '删除原因'
    },
    addRule: {
      type: 'addRule',
      rule: {
        id: 'kebab-case-id',
        name: '中文规则名',
        expression: 'patient or prescription or dosePlan expression string',
        action: 'machine-readable-action',
        severity: 'info|medium|high|critical',
        enabled: true
      }
    },
    updateRule: {
      type: 'updateRule',
      ruleId: '必须是 existingRules 中已存在的规则ID',
      patch: {
        name: '可选规则名',
        expression: '可选 patient or prescription or dosePlan expression string',
        action: '可选 machine-readable-action',
        severity: 'info|medium|high|critical',
        enabled: true
      }
    },
    removeRule: {
      type: 'removeRule',
      ruleId: '必须是 existingRules 中已存在的规则ID',
      reason: '删除原因'
    },
    updateUiPanel: {
      type: 'updateUiPanel',
      panelId: 'stable-panel-id',
      title: '中文面板标题',
      description: '面板说明'
    },
    upsertUiLayout: {
      type: 'upsertUiLayout',
      layout: {
        pageId: 'stable-page-id',
        title: '中文页面标题',
        sections: [
          {
            id: 'stable-section-id',
            title: '中文区块标题',
            source: 'workflow|patients|appointments|qaReports|followUps|rules|deployments|aiJobs|reports',
            display: 'timeline|queue|list|cards|chart|diff|approval|table',
            columns: 1,
            visible: true
          }
        ]
      }
    },
    upsertReportTemplate: {
      type: 'upsertReportTemplate',
      template: {
        id: 'kebab-case-id',
        name: '中文报表名',
        audience: '使用角色或科室',
        dataset: 'patients|appointments|qaReports|followUps|rules|deployments',
        fields: ['字段路径'],
        schedule: 'manual|daily|weekly|monthly',
        enabled: true
      }
    },
    updatePermission: {
      type: 'updatePermission',
      roleId: 'registrar|doctor|physicist|technician|director|nurse',
      patch: {
        canEditPatients: true,
        canManageWorkflow: false,
        canApproveDeployments: false,
        canRollbackDeployments: false,
        canViewReports: true,
        workflowStepIds: ['existing-step-id']
      }
    }
  };
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
        '允许的operation类型只有 addWorkflowStep、updateWorkflowStep、removeWorkflowStep、addFormField、updateFormField、removeFormField、addRule、updateRule、removeRule、updateUiPanel、upsertUiLayout、upsertReportTemplate、updatePermission。',
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
        operationContract: buildOperationContract(),
        responseShape: {
          title: 'string',
          intent: 'string',
          riskLevel: 'low|medium|high',
          summary: 'string',
          operations: [
            {
              type: 'addWorkflowStep',
              afterStepId: 'existing-step-id',
              step: {
                id: 'kebab-case-id',
                name: '中文节点名',
                role: 'physicist',
                slaHours: 12,
                room: '工作区域',
                formFields: [{ key: 'fieldKey', label: '字段名', type: 'text', required: true }],
                qualityChecks: ['质控项']
              }
            }
          ],
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
          operationContract: buildOperationContract()
        })
      }
    ]);
    return validatePlan(extractJson(repairedContent));
  }
}
