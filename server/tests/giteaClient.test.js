import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultStore } from '../domain/defaultData.js';
import { buildDeliveryManifest, GiteaClient } from '../integrations/giteaClient.js';

test('reports public Gitea integration configuration without exposing credentials', () => {
  const client = new GiteaClient({
    baseUrl: 'https://gitea.example.com/',
    owner: 'oncology',
    repo: 'rt-workflow',
    username: 'robot',
    password: 'secret',
    branch: 'main'
  });

  assert.equal(client.isConfigured(), true);
  assert.deepEqual(client.publicConfig(), {
    enabled: true,
    baseUrl: 'https://gitea.example.com',
    owner: 'oncology',
    repo: 'rt-workflow',
    branch: 'main',
    repoUrl: 'https://gitea.example.com/oncology/rt-workflow'
  });
});

test('builds delivery manifest with requirement, tests, deployment, and workflow snapshot', () => {
  const store = createDefaultStore();
  const manifest = buildDeliveryManifest({
    store,
    job: {
      id: 'AI-1',
      requirement: '新增物理师二次复核',
      status: 'completed'
    },
    plan: {
      title: '增加复核节点',
      operations: []
    },
    testResult: {
      passed: true,
      checks: []
    },
    deployment: {
      version: '0.4.0',
      status: 'active'
    }
  });

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.job.requirement, '新增物理师二次复核');
  assert.equal(manifest.testResult.passed, true);
  assert.equal(manifest.workflowSnapshot.steps.length, store.workflow.steps.length);
});
