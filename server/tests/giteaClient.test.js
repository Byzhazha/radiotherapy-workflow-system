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

test('uploads delivery artifacts through one Gitea commit', async () => {
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return {
      ok: true,
      json: async () => ({
        commit: {
          sha: 'commit-one',
          html_url: 'https://gitea.example.com/oncology/rt-workflow/commit/commit-one'
        },
        files: [
          { path: 'ai-deliveries/AI-1/manifest.json', html_url: 'https://gitea.example.com/file/manifest' },
          { path: 'ai-deliveries/AI-1/config-before.json', html_url: 'https://gitea.example.com/file/before' },
          { path: 'ai-deliveries/AI-1/config-after.json', html_url: 'https://gitea.example.com/file/after' },
          { path: 'ai-deliveries/AI-1/config-diff.json', html_url: 'https://gitea.example.com/file/diff' }
        ]
      })
    };
  };

  try {
    const client = new GiteaClient({
      baseUrl: 'https://gitea.example.com/',
      owner: 'oncology',
      repo: 'rt-workflow',
      username: 'robot',
      password: 'secret',
      branch: 'main'
    });

    const result = await client.upsertFiles({
      message: 'AI定制变更：测试',
      files: [
        { filePath: 'ai-deliveries/AI-1/manifest.json', content: '{}\n' },
        { filePath: 'ai-deliveries/AI-1/config-before.json', content: '{}\n' },
        { filePath: 'ai-deliveries/AI-1/config-after.json', content: '{}\n' },
        { filePath: 'ai-deliveries/AI-1/config-diff.json', content: '[]\n' }
      ]
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.method, 'POST');
    assert.match(requests[0].url, /\/api\/v1\/repos\/oncology\/rt-workflow\/contents$/);
    assert.equal(requests[0].body.files.length, 4);
    assert.deepEqual(requests[0].body.files.map((file) => file.operation), ['upload', 'upload', 'upload', 'upload']);
    assert.equal(requests[0].body.files[0].content, Buffer.from('{}\n', 'utf8').toString('base64'));
    assert.equal(result.commitSha, 'commit-one');
    assert.equal(new Set(result.files.map((file) => file.commitSha)).size, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
