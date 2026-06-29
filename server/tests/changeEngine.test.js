import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultStore } from '../domain/defaultData.js';
import { applyChangePlan, runClinicalRegression } from '../domain/changeEngine.js';

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
