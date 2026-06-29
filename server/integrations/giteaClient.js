function encodeRepoPath(value) {
  return String(value).split('/').map(encodeURIComponent).join('/');
}

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '');
}

export class GiteaClient {
  constructor({
    baseUrl,
    owner,
    repo,
    username,
    password,
    token,
    branch = 'main'
  } = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.owner = owner;
    this.repo = repo;
    this.username = username;
    this.password = password;
    this.token = token;
    this.branch = branch;
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.owner && this.repo && (this.token || (this.username && this.password)));
  }

  publicConfig() {
    return {
      enabled: this.isConfigured(),
      baseUrl: this.baseUrl || null,
      owner: this.owner || null,
      repo: this.repo || null,
      branch: this.branch,
      repoUrl: this.baseUrl && this.owner && this.repo ? `${this.baseUrl}/${this.owner}/${this.repo}` : null
    };
  }

  authHeaders() {
    if (this.token) {
      return { Authorization: `token ${this.token}` };
    }

    const credentials = Buffer.from(`${this.username}:${this.password}`, 'utf8').toString('base64');
    return { Authorization: `Basic ${credentials}` };
  }

  async request(method, apiPath, body) {
    if (!this.isConfigured()) {
      throw new Error('Gitea 仓库未配置。');
    }

    const response = await fetch(`${this.baseUrl}/api/v1${apiPath}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...this.authHeaders()
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.message || payload.error || `Gitea 请求失败：${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  async getRepository() {
    return this.request('GET', `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`);
  }

  async getFile(filePath, branch = this.branch) {
    const encodedPath = encodeRepoPath(filePath);
    try {
      return await this.request(
        'GET',
        `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`
      );
    } catch (error) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async upsertFile({ filePath, content, message, branch = this.branch }) {
    const encodedPath = encodeRepoPath(filePath);
    const existingFile = await this.getFile(filePath, branch);
    const body = {
      branch,
      content: Buffer.from(content, 'utf8').toString('base64'),
      message,
      author: {
        name: 'AI Delivery Agent',
        email: 'ai-delivery@radiotherapy.local'
      },
      committer: {
        name: 'AI Delivery Agent',
        email: 'ai-delivery@radiotherapy.local'
      }
    };

    // Gitea requires the current file SHA on updates; create requests omit it.
    if (existingFile?.sha) {
      body.sha = existingFile.sha;
    }

    const method = existingFile ? 'PUT' : 'POST';
    const result = await this.request(
      method,
      `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}/contents/${encodedPath}`,
      body
    );

    const repoUrl = `${this.baseUrl}/${this.owner}/${this.repo}`;
    return {
      provider: 'gitea',
      owner: this.owner,
      repo: this.repo,
      branch,
      path: filePath,
      commitSha: result.commit?.sha || null,
      commitUrl: result.commit?.html_url || null,
      fileUrl: result.content?.html_url || `${repoUrl}/src/branch/${branch}/${filePath}`,
      repoUrl
    };
  }
}

export function buildDeliveryManifest({ store, job, plan, testResult, deployment }) {
  const workflowSnapshot = {
    id: store.workflow.id,
    name: store.workflow.name,
    activeVersion: store.workflow.activeVersion,
    steps: store.workflow.steps.map((step) => ({
      id: step.id,
      name: step.name,
      role: step.role,
      slaHours: step.slaHours,
      formFieldCount: step.formFields.length,
      qualityCheckCount: step.qualityChecks.length
    }))
  };

  // The manifest is the durable engineering handoff for each AI change: it
  // preserves requirement, generated operations, verification, and release data.
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    job: {
      id: job.id,
      requirement: job.requirement,
      status: job.status
    },
    plan,
    testResult,
    deployment,
    workflowSnapshot
  };
}
