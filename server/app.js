import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { JsonStore } from './storage.js';
import { OpenAiCompatibleClient } from './aiClient.js';
import { advancePatient, buildDashboard, evaluatePatientSafety, getPatientProgress, savePatientStepRecord } from './domain/clinical.js';
import { applyConfigSlice, cloneConfigSlice, runClinicalRegression, simulateChangePlan } from './domain/changeEngine.js';
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
      { id: 'sandbox', name: '生成沙箱预览', status: 'waiting' },
      { id: 'test', name: '业务安全检查', status: 'waiting' },
      { id: 'deploy', name: '生成待审批版本', status: 'waiting' },
      { id: 'source-control', name: '保存交付记录', status: 'waiting' }
    ],
    plan: null,
    sandbox: null,
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

function configVersionMinor(version) {
  const match = /^0\.(\d+)\.0$/.exec(String(version || ''));
  return match ? Number(match[1]) : 0;
}

function nextConfigVersion(store) {
  // 配置发布版本面向业务展示，不能用内部流程运行版本号来推导。
  const knownVersions = [
    ...(store.configVersions || []).map((version) => version.version),
    ...(store.deployments || []).map((deployment) => deployment.version)
  ];
  const maxMinor = knownVersions.reduce((max, version) => Math.max(max, configVersionMinor(version)), 0);
  return `0.${maxMinor + 1}.0`;
}

function compactConfig(config) {
  // Job payloads keep a compact preview so the desktop UI can render diffs
  // quickly while full before/after snapshots remain in configVersions/Gitea.
  return {
    workflow: {
      activeVersion: config.workflow.activeVersion,
      steps: config.workflow.steps.map((step) => ({
        id: step.id,
        name: step.name,
        role: step.role,
        slaHours: step.slaHours,
        formFieldCount: step.formFields.length,
        qualityCheckCount: step.qualityChecks.length
      }))
    },
    rules: config.rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      severity: rule.severity,
      enabled: rule.enabled
    })),
    uiLayouts: config.uiLayouts.map((layout) => ({
      pageId: layout.pageId,
      title: layout.title,
      sectionCount: layout.sections.length
    })),
    reportTemplates: config.reportTemplates.map((template) => ({
      id: template.id,
      name: template.name,
      dataset: template.dataset,
      enabled: template.enabled
    })),
    permissionRoles: Object.keys(config.permissionMatrix)
  };
}

function approveConfigVersion(store, { configVersionId, jobId, operator, comment }) {
  const configVersion = store.configVersions.find((item) => item.id === configVersionId || (jobId && item.jobId === jobId));
  if (!configVersion) {
    throw new Error('未找到待激活的配置版本。');
  }

  const deployment = store.deployments.find((item) => item.id === configVersion.deploymentId);
  if (!deployment) {
    throw new Error('未找到可审批的发布记录。');
  }

  const job = store.aiJobs.find((item) => item.id === configVersion.jobId);
  if (configVersion.status === 'active') {
    return { job, configVersion, deployment };
  }

  // 待审批状态落在配置版本上，刷新或重开桌面端后仍能激活同一份快照。
  applyConfigSlice(store, configVersion.after);
  store.workflow.activeVersion += 1;
  store.workflow.updatedAt = new Date().toISOString();

  for (const version of store.configVersions) {
    if (version.status === 'active') {
      version.status = 'superseded';
    }
  }
  for (const existingDeployment of store.deployments) {
    if (existingDeployment.status === 'active') {
      existingDeployment.status = 'superseded';
    }
  }

  const now = new Date().toISOString();
  const approval = {
    at: now,
    actor: operator || 'delivery-manager',
    decision: 'approved',
    comment: comment || '审批通过，激活预览配置。'
  };

  configVersion.status = 'active';
  configVersion.activatedAt = now;
  configVersion.approvals ||= [];
  configVersion.approvals.push(approval);

  deployment.status = 'active';
  deployment.activatedAt = now;
  deployment.approval = {
    ...(deployment.approval || {}),
    status: 'approved',
    approvedAt: now,
    approvedBy: approval.actor,
    comment: approval.comment
  };

  if (job?.deployment) {
    job.deployment.status = 'active';
    job.deployment.activatedAt = now;
    job.deployment.approval = deployment.approval;
  }

  store.auditLog.push({
    id: `AUD-${Date.now()}`,
    at: new Date().toISOString(),
    actor: approval.actor,
    action: 'approve-ai-deployment',
    detail: `审批通过并激活 ${deployment.title}。`
  });

  return { job, configVersion, deployment };
}

function createConfigVersion({ job, plan, sandbox, deployment }) {
  const now = new Date().toISOString();
  // The pending config version is the approval artifact: it contains the exact
  // configuration that will become active if the reviewer approves the preview.
  return {
    id: `CFG-${Date.now()}`,
    version: deployment.version,
    title: plan.title,
    status: 'pending-approval',
    createdAt: now,
    deploymentId: deployment.id,
    jobId: job.id,
    requirement: job.requirement,
    riskLevel: plan.riskLevel,
    summary: plan.summary,
    before: sandbox.before,
    after: sandbox.after,
    diff: sandbox.diff,
    approvals: []
  };
}

async function writeDeliveryArtifacts({ giteaClient, store, job, plan, testResult, deployment, sandbox, configVersion }) {
  if (!giteaClient.isConfigured()) {
    return null;
  }

  const manifest = buildDeliveryManifest({ store, job, plan, testResult, deployment, sandbox, configVersion });
  const basePath = `ai-deliveries/${job.id}`;

  return giteaClient.upsertFiles({
    message: `AI定制变更：${plan.title}`,
    files: [
      {
        filePath: `${basePath}/manifest.json`,
        content: `${JSON.stringify(manifest, null, 2)}\n`
      },
      {
        filePath: `${basePath}/config-before.json`,
        content: `${JSON.stringify(sandbox.before, null, 2)}\n`
      },
      {
        filePath: `${basePath}/config-after.json`,
        content: `${JSON.stringify(sandbox.after, null, 2)}\n`
      },
      {
        filePath: `${basePath}/config-diff.json`,
        content: `${JSON.stringify(sandbox.diff, null, 2)}\n`
      }
    ]
  });
}

async function executeAiJob({ store, job, aiClient, giteaClient, storage }) {
  try {
    markStage(job, 'understand', 'done', '已提取流程、字段、规则、页面、报表和权限影响点。');
    markStage(job, 'plan', 'running');

    const plan = await requestAiChangePlan({
      requirement: job.requirement,
      store,
      aiClient
    });

    job.plan = plan;
    markStage(job, 'plan', 'done', `生成 ${plan.operations.length} 个变更操作。`);
    markStage(job, 'sandbox', 'running');

    await storage.backup(job.id);
    // AI changes are evaluated against a cloned store first; the active clinical
    // configuration is left untouched until the approval endpoint applies it.
    const sandbox = simulateChangePlan(store, plan);
    job.sandbox = {
      applied: sandbox.applied,
      diff: sandbox.diff,
      preview: compactConfig(sandbox.after)
    };
    markStage(job, 'sandbox', 'done', sandbox.applied.join(' '));
    markStage(job, 'test', 'running');

    const testResult = runClinicalRegression(sandbox.sandboxStore, plan);
    job.testResult = testResult;
    markStage(job, 'test', testResult.passed ? 'done' : 'failed', testResult.checks.map((check) => check.detail).join(' '));

    if (!testResult.passed) {
      throw new Error('自动回归测试未通过。');
    }

    markStage(job, 'deploy', 'running');
    const deployment = {
      id: `DEP-${Date.now()}`,
      version: nextConfigVersion(store),
      title: plan.title,
      status: 'pending-approval',
      createdAt: new Date().toISOString(),
      summary: plan.summary,
      jobId: job.id,
      riskLevel: plan.riskLevel,
      approval: {
        status: 'waiting',
        requiredBy: plan.riskLevel === 'high' ? '科主任或实施负责人' : '实施负责人',
        checklist: [
          '确认流程变化符合医院执行路径。',
          '确认新增或调整字段不会影响在管患者记录。',
          '确认关键阻断规则和权限边界仍然有效。'
        ]
      }
    };
    const configVersion = createConfigVersion({ job, plan, sandbox, deployment });

    store.deployments.unshift(deployment);
    store.configVersions.unshift(configVersion);
    job.deployment = deployment;
    job.configVersionId = configVersion.id;
    job.status = 'completed';
    markStage(job, 'deploy', 'done', '沙箱预览版本已生成，等待审批后激活。');
    markStage(job, 'source-control', 'running');

    job.sourceControl = await writeDeliveryArtifacts({ giteaClient, store, job, plan, testResult, deployment, sandbox, configVersion });
    markStage(job, 'source-control', 'done', '变更计划、配置快照、差异和测试结果已保存。');

    store.auditLog.push({
      id: `AUD-${Date.now() + 1}`,
      at: new Date().toISOString(),
      actor: 'ai-delivery-agent',
      action: 'complete-ai-job',
      detail: `${job.id} 生成待审批预览：${plan.title}`
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
      uiLayouts: store.uiLayouts,
      uiPanels: store.uiPanels,
      reportTemplates: store.reportTemplates,
      permissionMatrix: store.permissionMatrix,
      patients: store.patients,
      appointments: store.appointments,
      equipment: store.equipment,
      qaReports: store.qaReports,
      followUps: store.followUps,
      aiJobs: store.aiJobs,
      deployments: store.deployments,
      configVersions: store.configVersions,
      auditLog: store.auditLog.slice(-30).reverse(),
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
      if (!job?.configVersionId) {
        throw new Error('未找到可审批的发布记录。');
      }

      approveConfigVersion(store, {
        jobId: job.id,
        configVersionId: job.configVersionId,
        operator: req.body?.operator,
        comment: req.body?.comment
      });

      return store;
    });

    res.json(nextStore.aiJobs.find((item) => item.id === req.params.id));
  }));

  app.post('/api/config-versions/:id/approve', asyncRoute(async (req, res) => {
    const nextStore = await storage.update((store) => {
      approveConfigVersion(store, {
        configVersionId: req.params.id,
        operator: req.body?.operator,
        comment: req.body?.comment
      });

      return store;
    });

    res.json(nextStore.configVersions.find((item) => item.id === req.params.id));
  }));

  app.post('/api/deployments/:id/rollback', asyncRoute(async (req, res) => {
    const nextStore = await storage.update((store) => {
      const beforeRollback = cloneConfigSlice(store);
      const targetDeployment = store.deployments.find((deployment) => deployment.id === req.params.id);
      if (!targetDeployment) {
        throw new Error('未找到可回滚的版本。');
      }

      const targetVersion = store.configVersions.find((version) => version.deploymentId === targetDeployment.id);
      if (!targetVersion?.after) {
        throw new Error('该版本没有可恢复的配置快照。');
      }

      // Rollback is implemented as a new active version so the audit trail keeps
      // both the failed direction and the recovery action.
      applyConfigSlice(store, targetVersion.after);
      store.workflow.activeVersion += 1;
      store.workflow.updatedAt = new Date().toISOString();
      const afterRollback = cloneConfigSlice(store);

      for (const version of store.configVersions) {
        if (version.status === 'active') {
          version.status = 'superseded';
        }
      }
      for (const deployment of store.deployments) {
        if (deployment.status === 'active') {
          deployment.status = 'superseded';
        }
      }

      const now = new Date().toISOString();
      const rollbackDeployment = {
        id: `DEP-${Date.now()}`,
        version: nextConfigVersion(store),
        title: `回滚到 ${targetVersion.title}`,
        status: 'active',
        createdAt: now,
        activatedAt: now,
        summary: req.body?.reason || `恢复配置版本 ${targetVersion.version}`,
        rollbackOf: targetDeployment.id
      };
      const rollbackVersion = {
        id: `CFG-${Date.now()}`,
        version: rollbackDeployment.version,
        title: rollbackDeployment.title,
        status: 'active',
        createdAt: now,
        activatedAt: now,
        deploymentId: rollbackDeployment.id,
        rollbackOf: targetVersion.id,
        before: beforeRollback,
        after: afterRollback,
        diff: targetVersion.diff || [],
        approvals: [
          {
            at: now,
            actor: req.body?.operator || 'delivery-manager',
            decision: 'rollback',
            comment: req.body?.reason || '恢复已验证配置版本。'
          }
        ]
      };

      store.deployments.unshift(rollbackDeployment);
      store.configVersions.unshift(rollbackVersion);
      store.auditLog.push({
        id: `AUD-${Date.now() + 1}`,
        at: now,
        actor: req.body?.operator || 'delivery-manager',
        action: 'rollback-deployment',
        detail: `回滚到 ${targetVersion.title}。`
      });

      return store;
    });

    res.json({
      deployment: nextStore.deployments[0],
      configVersion: nextStore.configVersions[0],
      workflow: nextStore.workflow
    });
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
