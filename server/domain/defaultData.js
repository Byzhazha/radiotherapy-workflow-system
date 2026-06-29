export function createDefaultStore() {
  const now = new Date().toISOString();
  return buildDefaultStore(now);
}

export function buildDefaultStore(now = new Date().toISOString()) {
  return {
    schemaVersion: 1,
    product: {
      name: '放疗流程管理系统',
      hospital: '示范放疗中心',
      edition: 'clinical-delivery'
    },
    roles: [
      { id: 'registrar', name: '登记员', color: '#3c6e71' },
      { id: 'doctor', name: '放疗医生', color: '#284b63' },
      { id: 'physicist', name: '物理师', color: '#7b2d26' },
      { id: 'technician', name: '技师', color: '#a15c38' },
      { id: 'director', name: '科主任', color: '#51344d' },
      { id: 'nurse', name: '护士', color: '#48756a' }
    ],
    workflow: {
      id: 'rt-standard',
      name: '放疗标准流程',
      activeVersion: 3,
      updatedAt: now,
      steps: [
        {
          id: 'registration',
          name: '患者登记',
          role: 'registrar',
          slaHours: 1,
          room: '门诊登记',
          formFields: [
            { key: 'diagnosis', label: '诊断', type: 'text', required: true },
            { key: 'stage', label: '分期', type: 'select', required: true, options: ['I', 'II', 'III', 'IV'] }
          ],
          qualityChecks: ['身份核验', '病历资料完整']
        },
        {
          id: 'consultation',
          name: '放疗会诊',
          role: 'doctor',
          slaHours: 4,
          room: '医生工作站',
          formFields: [
            { key: 'intent', label: '治疗目的', type: 'select', required: true, options: ['根治', '辅助', '姑息'] },
            { key: 'site', label: '治疗部位', type: 'text', required: true }
          ],
          qualityChecks: ['适应证确认', '既往治疗核对']
        },
        {
          id: 'ct-simulation',
          name: 'CT定位',
          role: 'technician',
          slaHours: 24,
          room: 'CT模拟定位室',
          formFields: [
            { key: 'immobilization', label: '固定方式', type: 'select', required: true, options: ['头颈肩膜', '体膜', '真空垫'] },
            { key: 'scanRange', label: '扫描范围', type: 'text', required: true }
          ],
          qualityChecks: ['定位图像上传', '体位固定记录']
        },
        {
          id: 'contouring',
          name: '靶区勾画',
          role: 'doctor',
          slaHours: 24,
          room: '勾画工作站',
          formFields: [
            { key: 'gtv', label: 'GTV', type: 'text', required: true },
            { key: 'ptvMargin', label: 'PTV外扩(mm)', type: 'number', required: true }
          ],
          qualityChecks: ['ROI命名规范', '危及器官完整']
        },
        {
          id: 'plan-design',
          name: '计划设计',
          role: 'physicist',
          slaHours: 24,
          room: '计划室',
          formFields: [
            { key: 'technique', label: '照射技术', type: 'select', required: true, options: ['IMRT', 'VMAT', 'SBRT', '3D-CRT'] },
            { key: 'totalDoseGy', label: '处方剂量(Gy)', type: 'number', required: true },
            { key: 'fractions', label: '分次数', type: 'number', required: true }
          ],
          qualityChecks: ['处方剂量一致', '危及器官约束']
        },
        {
          id: 'physics-review',
          name: '物理师审核',
          role: 'physicist',
          slaHours: 12,
          room: '质控室',
          formFields: [
            { key: 'gammaPassRate', label: 'Gamma通过率(%)', type: 'number', required: true },
            { key: 'muCheck', label: 'MU独立核查', type: 'text', required: true }
          ],
          qualityChecks: ['剂量验证通过', '计划参数复核']
        },
        {
          id: 'director-review',
          name: '主任审核',
          role: 'director',
          slaHours: 12,
          room: '主任工作站',
          formFields: [
            { key: 'approvalOpinion', label: '审核意见', type: 'textarea', required: true }
          ],
          qualityChecks: ['适应证复核', '高风险病例确认']
        },
        {
          id: 'treatment-schedule',
          name: '治疗排程',
          role: 'nurse',
          slaHours: 4,
          room: '排程中心',
          formFields: [
            { key: 'machineId', label: '治疗设备', type: 'select', required: true, options: ['LA-1', 'LA-2', 'TOMO-1'] },
            { key: 'firstTreatmentAt', label: '首次治疗时间', type: 'datetime', required: true }
          ],
          qualityChecks: ['设备可用', '患者通知']
        },
        {
          id: 'first-treatment',
          name: '首次治疗',
          role: 'technician',
          slaHours: 8,
          room: '加速器机房',
          formFields: [
            { key: 'igrtResult', label: 'IGRT结果', type: 'select', required: true, options: ['通过', '需复位', '暂停'] }
          ],
          qualityChecks: ['摆位影像确认', '治疗记录回写']
        },
        {
          id: 'follow-up',
          name: '随访',
          role: 'doctor',
          slaHours: 168,
          room: '随访门诊',
          formFields: [
            { key: 'toxicityGrade', label: '毒性分级', type: 'select', required: true, options: ['0', '1', '2', '3', '4'] },
            { key: 'nextVisit', label: '下次随访', type: 'date', required: true }
          ],
          qualityChecks: ['疗效评价', '不良反应记录']
        }
      ]
    },
    rules: [
      {
        id: 'high-dose-director-review',
        name: '高剂量主任复核',
        expression: 'prescription.totalDoseGy >= 60',
        action: 'director-review-required',
        severity: 'high',
        enabled: true
      },
      {
        id: 'low-gamma-block-treatment',
        name: 'Gamma低通过率禁止治疗',
        expression: 'dosePlan.gammaPassRate < 95',
        action: 'block-treatment-schedule',
        severity: 'critical',
        enabled: true
      }
    ],
    uiLayouts: [
      {
        pageId: 'clinical-overview',
        title: '临床运行总览',
        sections: [
          { id: 'workflow', title: '当前放疗流程', source: 'workflow', display: 'timeline', columns: 2, visible: true },
          { id: 'patient-queue', title: '患者队列', source: 'patients', display: 'queue', columns: 1, visible: true },
          { id: 'quality', title: '最近质控', source: 'qaReports', display: 'list', columns: 1, visible: true }
        ]
      },
      {
        pageId: 'delivery-workbench',
        title: '定制交付工作台',
        sections: [
          { id: 'preview', title: '沙箱预览', source: 'deployments', display: 'diff', columns: 2, visible: true },
          { id: 'approval', title: '审批详情', source: 'aiJobs', display: 'approval', columns: 1, visible: true }
        ]
      }
    ],
    uiPanels: [
      { panelId: 'ai-delivery-console', title: '下达定制需求', description: '输入医院流程、表单、规则、报表或权限定制需求。' }
    ],
    reportTemplates: [
      {
        id: 'treatment-prep-summary',
        name: '治疗准备汇总',
        audience: '放疗医生',
        dataset: 'patients',
        fields: ['name', 'diagnosis', 'currentStepId', 'prescription.totalDoseGy', 'dosePlan.gammaPassRate'],
        schedule: 'manual',
        enabled: true
      },
      {
        id: 'qa-risk-review',
        name: '质控风险复核',
        audience: '物理师',
        dataset: 'qaReports',
        fields: ['patientId', 'type', 'score', 'result', 'createdAt'],
        schedule: 'daily',
        enabled: true
      }
    ],
    permissionMatrix: {
      registrar: {
        canEditPatients: true,
        canManageWorkflow: false,
        canApproveDeployments: false,
        canRollbackDeployments: false,
        canViewReports: true,
        workflowStepIds: ['registration']
      },
      doctor: {
        canEditPatients: true,
        canManageWorkflow: false,
        canApproveDeployments: false,
        canRollbackDeployments: false,
        canViewReports: true,
        workflowStepIds: ['consultation', 'contouring', 'follow-up']
      },
      physicist: {
        canEditPatients: true,
        canManageWorkflow: false,
        canApproveDeployments: false,
        canRollbackDeployments: false,
        canViewReports: true,
        workflowStepIds: ['plan-design', 'physics-review']
      },
      technician: {
        canEditPatients: true,
        canManageWorkflow: false,
        canApproveDeployments: false,
        canRollbackDeployments: false,
        canViewReports: false,
        workflowStepIds: ['ct-simulation', 'first-treatment']
      },
      director: {
        canEditPatients: true,
        canManageWorkflow: true,
        canApproveDeployments: true,
        canRollbackDeployments: true,
        canViewReports: true,
        workflowStepIds: ['director-review']
      },
      nurse: {
        canEditPatients: true,
        canManageWorkflow: false,
        canApproveDeployments: false,
        canRollbackDeployments: false,
        canViewReports: true,
        workflowStepIds: ['treatment-schedule']
      }
    },
    equipment: [
      { id: 'LA-1', name: '直线加速器 LA-1', type: 'LINAC', status: 'available', room: 'A机房' },
      { id: 'LA-2', name: '直线加速器 LA-2', type: 'LINAC', status: 'busy', room: 'B机房' },
      { id: 'TOMO-1', name: 'TOMO治疗机', type: 'TOMO', status: 'available', room: 'TOMO机房' },
      { id: 'CT-SIM', name: 'CT模拟定位机', type: 'CT', status: 'available', room: '定位室' }
    ],
    patients: [
      {
        id: 'P-1001',
        mrn: 'RT202606001',
        name: '周明',
        sex: '男',
        age: 58,
        diagnosis: '鼻咽癌',
        stage: 'III',
        physician: '林医生',
        priority: 'urgent',
        currentStepId: 'plan-design',
        status: 'in-treatment-prep',
        createdAt: '2026-06-21T09:20:00.000Z',
        prescription: {
          site: '头颈部',
          technique: 'VMAT',
          totalDoseGy: 70,
          fractions: 33,
          dosePerFractionGy: 2.12
        },
        dosePlan: {
          planId: 'PLAN-1001-A',
          ptvCoverage: 96.4,
          conformityIndex: 1.08,
          homogeneityIndex: 0.12,
          gammaPassRate: 97.8,
          oarMaxDoseGy: 44.2,
          constraints: [
            { name: 'PTV V95%', target: '>=95%', actual: '96.4%', passed: true },
            { name: '脊髓 Dmax', target: '<45Gy', actual: '44.2Gy', passed: true },
            { name: '腮腺 Mean', target: '<26Gy', actual: '25.1Gy', passed: true }
          ],
          dvh: [
            { dose: 0, ptv: 100, spinalCord: 100, parotid: 100 },
            { dose: 20, ptv: 99, spinalCord: 52, parotid: 61 },
            { dose: 40, ptv: 98, spinalCord: 14, parotid: 19 },
            { dose: 60, ptv: 96, spinalCord: 0, parotid: 3 },
            { dose: 70, ptv: 50, spinalCord: 0, parotid: 0 }
          ]
        }
      },
      {
        id: 'P-1002',
        mrn: 'RT202606002',
        name: '刘倩',
        sex: '女',
        age: 46,
        diagnosis: '乳腺癌术后',
        stage: 'II',
        physician: '陈医生',
        priority: 'normal',
        currentStepId: 'ct-simulation',
        status: 'simulation',
        createdAt: '2026-06-24T14:10:00.000Z',
        prescription: {
          site: '胸壁',
          technique: 'IMRT',
          totalDoseGy: 50,
          fractions: 25,
          dosePerFractionGy: 2
        },
        dosePlan: null
      },
      {
        id: 'P-1003',
        mrn: 'RT202606003',
        name: '王启航',
        sex: '男',
        age: 65,
        diagnosis: '肺癌',
        stage: 'IV',
        physician: '林医生',
        priority: 'high-risk',
        currentStepId: 'director-review',
        status: 'review',
        createdAt: '2026-06-20T10:30:00.000Z',
        prescription: {
          site: '胸部',
          technique: 'SBRT',
          totalDoseGy: 60,
          fractions: 8,
          dosePerFractionGy: 7.5
        },
        dosePlan: {
          planId: 'PLAN-1003-B',
          ptvCoverage: 94.8,
          conformityIndex: 1.21,
          homogeneityIndex: 0.17,
          gammaPassRate: 94.2,
          oarMaxDoseGy: 18.8,
          constraints: [
            { name: 'PTV V95%', target: '>=95%', actual: '94.8%', passed: false },
            { name: '肺 V20', target: '<30%', actual: '26.3%', passed: true },
            { name: 'Gamma通过率', target: '>=95%', actual: '94.2%', passed: false }
          ],
          dvh: [
            { dose: 0, ptv: 100, lung: 100, heart: 100 },
            { dose: 10, ptv: 99, lung: 31, heart: 22 },
            { dose: 20, ptv: 97, lung: 26, heart: 10 },
            { dose: 45, ptv: 90, lung: 4, heart: 0 },
            { dose: 60, ptv: 45, lung: 0, heart: 0 }
          ]
        }
      }
    ],
    appointments: [
      { id: 'A-1', patientId: 'P-1002', equipmentId: 'CT-SIM', title: 'CT定位', startsAt: '2026-06-30T09:00:00.000Z', durationMinutes: 40, status: 'confirmed' },
      { id: 'A-2', patientId: 'P-1001', equipmentId: 'LA-1', title: '首次治疗', startsAt: '2026-06-30T14:30:00.000Z', durationMinutes: 25, status: 'pending-review' },
      { id: 'A-3', patientId: 'P-1003', equipmentId: 'LA-2', title: '复核后治疗', startsAt: '2026-07-01T10:00:00.000Z', durationMinutes: 35, status: 'blocked' }
    ],
    qaReports: [
      { id: 'QA-1001', patientId: 'P-1001', type: 'PlanQA', score: 96, result: 'passed', createdAt: '2026-06-28T11:00:00.000Z' },
      { id: 'QA-1003', patientId: 'P-1003', type: 'PlanQA', score: 82, result: 'failed', createdAt: '2026-06-28T16:30:00.000Z' },
      { id: 'CQA-1001', patientId: 'P-1001', type: 'ContourQA', score: 94, result: 'passed', createdAt: '2026-06-27T15:20:00.000Z' }
    ],
    followUps: [
      { id: 'F-1', patientId: 'P-0991', name: '赵宁', dueAt: '2026-07-03T09:00:00.000Z', toxicityGrade: '1', status: 'scheduled' }
    ],
    aiJobs: [],
    deployments: [
      {
        id: 'DEP-BASE',
        version: '0.1.0',
        title: '基础放疗流程版本',
        status: 'active',
        createdAt: now,
        activatedAt: now,
        summary: '初始流程、排程、剂量质控、随访管理和AI定制助手。'
      }
    ],
    configVersions: [
      {
        id: 'CFG-BASE',
        version: '0.1.0',
        title: '基础放疗流程版本',
        status: 'active',
        createdAt: now,
        activatedAt: now,
        deploymentId: 'DEP-BASE'
      }
    ],
    auditLog: [
      { id: 'AUD-BASE', at: now, actor: 'system', action: 'seed-store', detail: '初始化放疗流程管理系统数据。' }
    ]
  };
}

export function ensureStoreShape(store) {
  const defaults = buildDefaultStore(new Date().toISOString());

  // Persisted installations created by earlier versions gain the new
  // configurable surfaces without replacing their clinical data.
  store.uiLayouts ||= defaults.uiLayouts;
  store.uiPanels ||= defaults.uiPanels;
  store.reportTemplates ||= defaults.reportTemplates;
  store.permissionMatrix ||= defaults.permissionMatrix;
  store.configVersions ||= defaults.configVersions;
  store.deployments ||= defaults.deployments;
  store.auditLog ||= [];
  store.aiJobs ||= [];
  store.rules ||= defaults.rules;
  store.workflow ||= defaults.workflow;
  store.roles ||= defaults.roles;
  store.patients ||= defaults.patients;
  store.appointments ||= defaults.appointments;
  store.equipment ||= defaults.equipment;
  store.qaReports ||= defaults.qaReports;
  store.followUps ||= defaults.followUps;

  for (const deployment of store.deployments) {
    deployment.approvals ||= [];
  }

  const currentConfig = {
    workflow: JSON.parse(JSON.stringify(store.workflow)),
    rules: JSON.parse(JSON.stringify(store.rules)),
    uiPanels: JSON.parse(JSON.stringify(store.uiPanels)),
    uiLayouts: JSON.parse(JSON.stringify(store.uiLayouts)),
    reportTemplates: JSON.parse(JSON.stringify(store.reportTemplates)),
    permissionMatrix: JSON.parse(JSON.stringify(store.permissionMatrix))
  };

  for (const version of store.configVersions) {
    version.after ||= JSON.parse(JSON.stringify(currentConfig));
    version.diff ||= [];
    version.approvals ||= [];
  }

  return store;
}
