import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { JsonStore } from './storage.js';
import { OpenAiCompatibleClient } from './aiClient.js';
import { advancePatient, buildDashboard, evaluatePatientSafety, getPatientProgress, savePatientStepRecord } from './domain/clinical.js';
import { applyChangePlan, runClinicalRegression } from './domain/changeEngine.js';
import { requestAiChangePlan } from './domain/aiPlanner.js';
import { buildDeliveryManifest, GiteaClient } from './integrations/giteaClient.js';

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function createJob(requirement) {
  const now = new Date().toISOString();
  return {
    id: `AI-${Date.now()}`,
    requirement,
    status: 'running',
    createdAt: now,
    updatedAt: now,
    stages: [
      { id: 'understand', name: '理解需求', status: 'running' },
      { id: 'plan', name: '生成变更计划', status: 'waiting' },
      { id: 'apply', name: '修改系统', status: 'waiting' },
      { id: 'test', name: '自动回归测试', status: 'waiting' },
      { id: 'deploy', name: '发布预览版本', status: 'waiting' },
      { id: 'source-control', name: '保存交付记录', status: 'waiting' }
    ],
    plan: null,
    testResult: null,
    deployment: null,
    sourceControl: null,
    error: null
  };
}

function markStage(job, stageId, status, detail) {
  const stage = job.stages.find((item) => item.id === stageId);
  if (stage) {
    stage.status = status;
    stage.detail = detail;
    stage.finishedAt = ['done', 'failed'].includes(status) ? new Date().toISOString() : undefined;
  }
  job.updatedAt = new Date().toISOString();
}

async function executeAiJob({ store, job, aiClient, giteaClient, storage }) {
  try {
    markStage(job, 'understand', 'done', '已提取流程、字段、规则和UI影响点。');
    markStage(job, 'plan', 'running');

    const plan = await requestAiChangePlan({
      requirement: job.requirement,
      store,
      aiClient
    });

    job.plan = plan;
    markStage(job, 'plan', 'done', `生成 ${plan.operations.length} 个变更操作。`);
    markStage(job, 'apply', 'running');

    await storage.backup(job.id);
    const result = applyChangePlan(store, plan);
    markStage(job, 'apply', 'done', result.applied.join(' '));
    markStage(job, 'test', 'running');

    const testResult = runClinicalRegression(store, plan);
    job.testResult = testResult;
    markStage(job, 'test', testResult.passed ? 'done' : 'failed', testResult.checks.map((check) => check.detail).join(' '));

    if (!testResult.passed) {
      throw new Error('自动回归测试未通过。');
    }

    markStage(job, 'deploy', 'running');
    const deployment = {
      id: `DEP-${Date.now()}`,
      version: `0.${store.workflow.activeVersion}.0`,
      title: plan.title,
      status: plan.riskLevel === 'high' ? 'pending-approval' : 'active',
      createdAt: new Date().toISOString(),
      summary: plan.summary,
      jobId: job.id
    };

    store.deployments.unshift(deployment);
    job.deployment = deployment;
    job.status = 'completed';
    markStage(job, 'deploy', 'done', deployment.status === 'active' ? '已发布到预览环境。' : '已发布到待审核预览环境。');
    markStage(job, 'source-control', 'running');

    if (giteaClient.isConfigured()) {
      const manifest = buildDeliveryManifest({ store, job, plan, testResult, deployment });
      job.sourceControl = await giteaClient.upsertFile({
        filePath: `ai-deliveries/${job.id}.json`,
        content: `${JSON.stringify(manifest, null, 2)}\n`,
        message: `AI定制变更：${plan.title}`
      });
      markStage(job, 'source-control', 'done', '变更计划、测试结果和发布记录已保存。');
    } else {
      markStage(job, 'source-control', 'done', '变更计划、测试结果和发布记录已保存。');
    }

    store.auditLog.push({
      id: `AUD-${Date.now() + 1}`,
      at: new Date().toISOString(),
      actor: 'ai-delivery-agent',
      action: 'complete-ai-job',
      detail: `${job.id} 完成：${plan.title}`
    });
  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    const running = job.stages.find((stage) => stage.status === 'running');
    if (running) {
      markStage(job, running.id, 'failed', error.message);
    }
  }

  job.updatedAt = new Date().toISOString();
  return store;
}

export async function createApiServer({ port = 8750, host = '127.0.0.1', dataDir } = {}) {
  const app = express();
  const storage = new JsonStore({ dataDir: dataDir || path.join(process.cwd(), 'data') });
  const aiClient = new OpenAiCompatibleClient({
    baseUrl: process.env.AI_BASE_URL,
    apiKey: process.env.AI_API_KEY,
    model: process.env.AI_MODEL
  });
  const giteaClient = new GiteaClient({
    baseUrl: process.env.GITEA_BASE_URL,
    owner: process.env.GITEA_OWNER,
    repo: process.env.GITEA_REPO,
    username: process.env.GITEA_USERNAME,
    password: process.env.GITEA_PASSWORD,
    token: process.env.GITEA_TOKEN,
    branch: process.env.GITEA_BRANCH || 'main'
  });

  await storage.init();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
      aiConfigured: aiClient.isConfigured(),
      model: process.env.AI_MODEL || null,
      gitea: giteaClient.publicConfig()
    });
  });

  app.get('/api/state', asyncRoute(async (req, res) => {
    const store = await storage.read();
    res.json({
      product: store.product,
      roles: store.roles,
      workflow: store.workflow,
      rules: store.rules,
      patients: store.patients,
      appointments: store.appointments,
      equipment: store.equipment,
      qaReports: store.qaReports,
      followUps: store.followUps,
      aiJobs: store.aiJobs,
      deployments: store.deployments,
      auditLog: store.auditLog.slice(-30).reverse(),
      integrations: {
        aiModel: process.env.AI_MODEL || null,
        gitea: giteaClient.publicConfig(),
        jenkins: {
          enabled: Boolean(process.env.JENKINS_URL),
          url: process.env.JENKINS_URL || null,
          role: 'optional-external-pipeline'
        }
      },
      dashboard: buildDashboard(store)
    });
  }));

  app.get('/api/patients/:id', asyncRoute(async (req, res) => {
    const store = await storage.read();
    const patient = store.patients.find((item) => item.id === req.params.id);
    if (!patient) {
      res.status(404).json({ error: '患者不存在。' });
      return;
    }

    res.json({
      patient,
      progress: getPatientProgress(patient, store.workflow),
      safety: evaluatePatientSafety(patient, store.rules)
    });
  }));

  app.post('/api/patients/:id/advance', asyncRoute(async (req, res) => {
    const nextStore = await storage.update((store) => {
      advancePatient(store, req.params.id, req.body?.operator);
      return store;
    });

    const patient = nextStore.patients.find((item) => item.id === req.params.id);
    res.json({
      patient,
      progress: getPatientProgress(patient, nextStore.workflow),
      safety: evaluatePatientSafety(patient, nextStore.rules)
    });
  }));

  app.post('/api/patients/:id/step-records', asyncRoute(async (req, res) => {
    const nextStore = await storage.update((store) => {
      savePatientStepRecord(store, req.params.id, req.body?.values, req.body?.operator);
      return store;
    });

    const patient = nextStore.patients.find((item) => item.id === req.params.id);
    res.json({
      patient,
      progress: getPatientProgress(patient, nextStore.workflow),
      safety: evaluatePatientSafety(patient, nextStore.rules)
    });
  }));

  app.post('/api/ai/jobs', asyncRoute(async (req, res) => {
    const requirement = String(req.body?.requirement || '').trim();
    if (requirement.length < 6) {
      res.status(400).json({ error: '请输入更完整的定制需求。' });
      return;
    }

    const nextStore = await storage.update(async (store) => {
      const job = createJob(requirement);
      store.aiJobs.unshift(job);

      // Execute synchronously for the desktop workflow so the user receives a
      // complete audited result without needing a queue worker in the first release.
      await executeAiJob({ store, job, aiClient, giteaClient, storage });
      return store;
    });

    res.json(nextStore.aiJobs[0]);
  }));

  app.post('/api/ai/jobs/:id/approve', asyncRoute(async (req, res) => {
    const nextStore = await storage.update((store) => {
      const job = store.aiJobs.find((item) => item.id === req.params.id);
      if (!job?.deployment) {
        throw new Error('未找到可审批的发布记录。');
      }

      job.deployment.status = 'active';
      const deployment = store.deployments.find((item) => item.id === job.deployment.id);
      if (deployment) {
        deployment.status = 'active';
      }

      store.auditLog.push({
        id: `AUD-${Date.now()}`,
        at: new Date().toISOString(),
        actor: req.body?.operator || 'delivery-manager',
        action: 'approve-ai-deployment',
        detail: `审批通过 ${job.deployment.title}。`
      });

      return store;
    });

    res.json(nextStore.aiJobs.find((item) => item.id === req.params.id));
  }));

  app.use((error, req, res, next) => {
    console.error(error);
    res.status(500).json({ error: error.message || '服务器内部错误。' });
  });

  const httpServer = await new Promise((resolve) => {
    const server = app.listen(port, host, () => resolve(server));
  });

  return {
    app,
    host,
    port: httpServer.address().port,
    close: () => new Promise((resolve, reject) => {
      httpServer.close((error) => (error ? reject(error) : resolve()));
    })
  };
}
