import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApiServer } from '../app.js';

test('creates sandbox preview, activates after approval, and rolls back to a saved version', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rt-ai-flow-'));
  const aiClientPlan = {
    title: '治疗排程时限调整',
    intent: '把治疗排程目标时间调整为6小时',
    riskLevel: 'medium',
    summary: '先生成沙箱预览，审批后激活配置。',
    operations: [
      {
        type: 'updateWorkflowStep',
        stepId: 'treatment-schedule',
        patch: { slaHours: 6 }
      }
    ],
    verification: ['治疗排程SLA更新为6小时']
  };
  const previousBaseUrl = process.env.AI_BASE_URL;
  const previousApiKey = process.env.AI_API_KEY;
  const previousModel = process.env.AI_MODEL;
  const previousGiteaBaseUrl = process.env.GITEA_BASE_URL;
  const previousGiteaOwner = process.env.GITEA_OWNER;
  const previousGiteaRepo = process.env.GITEA_REPO;
  const previousGiteaUsername = process.env.GITEA_USERNAME;
  const previousGiteaPassword = process.env.GITEA_PASSWORD;
  const previousGiteaToken = process.env.GITEA_TOKEN;
  process.env.AI_BASE_URL = 'http://127.0.0.1/mock';
  process.env.AI_API_KEY = 'test-key';
  process.env.AI_MODEL = 'test-model';
  process.env.GITEA_BASE_URL = '';
  process.env.GITEA_OWNER = '';
  process.env.GITEA_REPO = '';
  process.env.GITEA_USERNAME = '';
  process.env.GITEA_PASSWORD = '';
  process.env.GITEA_TOKEN = '';

  const originalFetch = globalThis.fetch;
  let server;

  try {
    globalThis.fetch = async (url, options) => {
      if (String(url).includes('/chat/completions')) {
        return new Response(JSON.stringify({
          choices: [{ message: { content: JSON.stringify(aiClientPlan) } }]
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return originalFetch(url, options);
    };

    server = await createApiServer({ port: 0, host: '127.0.0.1', dataDir });
    const baseUrl = `http://${server.host}:${server.port}`;
    const createdResponse = await originalFetch(`${baseUrl}/api/ai/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirement: '把治疗排程目标时间调整为6小时，并生成审批预览。' })
    });
    const job = await createdResponse.json();

    assert.equal(createdResponse.ok, true);
    assert.equal(job.deployment.status, 'pending-approval');
    assert.equal(job.sandbox.preview.workflow.steps.find((step) => step.id === 'treatment-schedule').slaHours, 6);

    const stateBeforeApproval = await (await originalFetch(`${baseUrl}/api/state`)).json();
    assert.equal(stateBeforeApproval.workflow.steps.find((step) => step.id === 'treatment-schedule').slaHours, 4);

    const approved = await (await originalFetch(`${baseUrl}/api/ai/jobs/${job.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: 'unit-test', comment: '验证通过。' })
    })).json();
    assert.equal(approved.deployment.status, 'active');

    const stateAfterApproval = await (await originalFetch(`${baseUrl}/api/state`)).json();
    assert.equal(stateAfterApproval.workflow.steps.find((step) => step.id === 'treatment-schedule').slaHours, 6);

    const baseDeployment = stateAfterApproval.deployments.find((deployment) => deployment.id === 'DEP-BASE');
    const rollbackResponse = await originalFetch(`${baseUrl}/api/deployments/${baseDeployment.id}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operator: 'unit-test', reason: '恢复基础版本。' })
    });
    const rollback = await rollbackResponse.json();

    assert.equal(rollbackResponse.ok, true);
    assert.equal(rollback.workflow.steps.find((step) => step.id === 'treatment-schedule').slaHours, 4);
  } finally {
    if (server) {
      await server.close();
    }
    globalThis.fetch = originalFetch;
    process.env.AI_BASE_URL = previousBaseUrl;
    process.env.AI_API_KEY = previousApiKey;
    process.env.AI_MODEL = previousModel;
    process.env.GITEA_BASE_URL = previousGiteaBaseUrl;
    process.env.GITEA_OWNER = previousGiteaOwner;
    process.env.GITEA_REPO = previousGiteaRepo;
    process.env.GITEA_USERNAME = previousGiteaUsername;
    process.env.GITEA_PASSWORD = previousGiteaPassword;
    process.env.GITEA_TOKEN = previousGiteaToken;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
