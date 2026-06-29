import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultStore } from '../domain/defaultData.js';
import { requestAiChangePlan } from '../domain/aiPlanner.js';

test('repairs invalid AI plan through schema feedback', async () => {
  const store = createDefaultStore();
  const calls = [];
  const aiClient = {
    async completeJson(messages) {
      calls.push(messages);
      if (calls.length === 1) {
        return JSON.stringify({
          title: '错误计划',
          intent: '测试修复',
          riskLevel: 'medium',
          summary: '缺少rule字段。',
          operations: [{ type: 'addRule', rule: { id: 'bad-rule', name: '坏规则', severity: 'high', enabled: true } }],
          verification: ['应该触发修复']
        });
      }

      return JSON.stringify({
        title: '修复后的规则计划',
        intent: '测试修复',
        riskLevel: 'medium',
        summary: '补齐规则字段。',
        operations: [
          {
            type: 'addRule',
            rule: {
              id: 'fixed-rule',
              name: '修复规则',
              expression: 'prescription.totalDoseGy > 60',
              action: 'require-director-review',
              severity: 'high',
              enabled: true
            }
          }
        ],
        verification: ['schema校验通过']
      });
    }
  };

  const plan = await requestAiChangePlan({ requirement: '增加规则', store, aiClient });

  assert.equal(calls.length, 2);
  assert.equal(plan.operations[0].rule.id, 'fixed-rule');
});
