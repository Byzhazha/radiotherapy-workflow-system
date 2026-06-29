import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultStore } from '../domain/defaultData.js';
import { applyChangePlan, runClinicalRegression, simulateChangePlan } from '../domain/changeEngine.js';

test('applies an audited workflow step change and keeps regression green', () => {
  const store = createDefaultStore();
  const plan = {
    title: '增加物理师二次复核',
    intent: '在治疗排程前增加复核节点',
    riskLevel: 'medium',
    summary: '把高频客户定制落到流程节点和质控字段。',
    operations: [
      {
        type: 'addWorkflowStep',
        afterStepId: 'director-review',
        step: {
          id: 'secondary-physics-review',
          name: '物理师二次复核',
          role: 'physicist',
          slaHours: 12,
          room: '质控室',
          formFields: [
            { key: 'secondaryReviewOpinion', label: '二次复核意见', type: 'textarea', required: true }
          ],
          qualityChecks: ['高风险计划二次确认']
        }
      }
    ],
    verification: ['新节点位于主任审核之后', '流程节点ID唯一']
  };

  const result = applyChangePlan(store, plan, 'test-agent');
  const insertedIndex = store.workflow.steps.findIndex((step) => step.id === 'secondary-physics-review');
  const previousIndex = store.workflow.steps.findIndex((step) => step.id === 'director-review');

  assert.equal(result.applied.length, 1);
  assert.equal(insertedIndex, previousIndex + 1);
  assert.equal(store.workflow.activeVersion, 4);
  assert.equal(runClinicalRegression(store, plan).passed, true);
});

test('applies broad customization operations in a sandbox without touching active config', () => {
  const store = createDefaultStore();
  const plan = {
    title: '复位验证与交付模板',
    intent: '调整流程、表单、规则、页面、报表和权限',
    riskLevel: 'high',
    summary: '覆盖生产级定制对象。',
    operations: [
      {
        type: 'updateWorkflowStep',
        stepId: 'treatment-schedule',
        patch: { slaHours: 6, qualityChecks: ['设备可用', '患者通知', '复位验证已完成'] }
      },
      {
        type: 'removeWorkflowStep',
        stepId: 'ct-simulation',
        migratePatientsToStepId: 'contouring',
        reason: '定位记录改由影像系统回传'
      },
      {
        type: 'updateFormField',
        stepId: 'physics-review',
        fieldKey: 'gammaPassRate',
        patch: { label: 'Gamma通过率(%)', required: true }
      },
      {
        type: 'removeFormField',
        stepId: 'director-review',
        fieldKey: 'approvalOpinion',
        reason: '改为结构化审批'
      },
      {
        type: 'updateRule',
        ruleId: 'high-dose-director-review',
        patch: { severity: 'critical', action: 'require-structured-director-approval' }
      },
      {
        type: 'upsertUiLayout',
        layout: {
          pageId: 'delivery-workbench',
          title: '定制交付工作台',
          sections: [
            { id: 'diff', title: '配置差异', source: 'deployments', display: 'diff', columns: 2, visible: true },
            { id: 'approval', title: '审批详情', source: 'aiJobs', display: 'approval', columns: 1, visible: true }
          ]
        }
      },
      {
        type: 'upsertReportTemplate',
        template: {
          id: 'reposition-verification-report',
          name: '复位验证日报',
          audience: '技师长',
          dataset: 'patients',
          fields: ['name', 'currentStepId', 'stepRecords.repositionError'],
          schedule: 'daily',
          enabled: true
        }
      },
      {
        type: 'updatePermission',
        roleId: 'director',
        patch: { canRollbackDeployments: true, workflowStepIds: ['director-review', 'treatment-schedule'] }
      },
      {
        type: 'updatePermission',
        roleId: 'technician',
        patch: { workflowStepIds: ['first-treatment'] }
      }
    ],
    verification: ['沙箱生成配置差异', '业务安全检查通过']
  };

  const sandbox = simulateChangePlan(store, plan);

  assert.equal(store.workflow.steps.some((step) => step.id === 'ct-simulation'), true);
  assert.equal(sandbox.preview.workflow.steps.some((step) => step.id === 'ct-simulation'), false);
  assert.equal(sandbox.sandboxStore.patients.find((patient) => patient.id === 'P-1002').currentStepId, 'contouring');
  assert.equal(sandbox.diff.some((change) => change.area === 'reportTemplates' && change.id === 'reposition-verification-report'), true);
  assert.equal(sandbox.diff.some((change) => change.area === 'permissionMatrix' && change.id === 'director'), true);
  assert.equal(runClinicalRegression(sandbox.sandboxStore, plan).passed, true);
});

test('regression catches unsafe workflow removal without patient migration', () => {
  const store = createDefaultStore();
  store.workflow.steps = store.workflow.steps.filter((step) => step.id !== 'ct-simulation');
  const result = runClinicalRegression(store, {
    title: '错误删除',
    intent: '测试',
    riskLevel: 'medium',
    summary: '删除在管患者所在节点。',
    operations: [{ type: 'updateUiPanel', panelId: 'x', title: 'x', description: 'x' }],
    verification: ['应失败']
  });

  assert.equal(result.passed, false);
  assert.equal(result.checks.some((check) => check.name === '在管患者流程落点' && !check.passed), true);
});
