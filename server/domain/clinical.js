export function findStep(workflow, stepId) {
  return workflow.steps.find((step) => step.id === stepId);
}

export function getPatientProgress(patient, workflow) {
  const currentIndex = workflow.steps.findIndex((step) => step.id === patient.currentStepId);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;

  return workflow.steps.map((step, index) => ({
    ...step,
    state: index < safeIndex ? 'done' : index === safeIndex ? 'active' : 'waiting'
  }));
}

export function evaluatePatientSafety(patient, rules) {
  const findings = [];
  const dosePlan = patient.dosePlan;

  if (!dosePlan) {
    findings.push({
      level: 'info',
      title: '尚未生成剂量计划',
      detail: '患者仍处于计划前流程，剂量约束将在计划设计后自动评估。'
    });
    return findings;
  }

  for (const constraint of dosePlan.constraints || []) {
    findings.push({
      level: constraint.passed ? 'pass' : 'risk',
      title: constraint.name,
      detail: `${constraint.actual} / ${constraint.target}`
    });
  }

  if (rules.some((rule) => rule.id === 'low-gamma-block-treatment' && rule.enabled) && dosePlan.gammaPassRate < 95) {
    findings.push({
      level: 'critical',
      title: '治疗排程阻断',
      detail: `Gamma通过率 ${dosePlan.gammaPassRate}% 低于 95%，需重新计划或复核。`
    });
  }

  if (rules.some((rule) => rule.id === 'high-dose-director-review' && rule.enabled) && patient.prescription.totalDoseGy >= 60) {
    findings.push({
      level: 'warning',
      title: '高剂量主任复核',
      detail: `${patient.prescription.totalDoseGy}Gy 方案需要主任审核留痕。`
    });
  }

  return findings;
}

export function buildDashboard(store) {
  const blockedPatients = store.patients.filter((patient) =>
    evaluatePatientSafety(patient, store.rules).some((finding) => finding.level === 'critical')
  );
  const activeAppointments = store.appointments.filter((appointment) => appointment.status !== 'cancelled');

  return {
    counts: {
      patients: store.patients.length,
      urgent: store.patients.filter((patient) => patient.priority !== 'normal').length,
      blocked: blockedPatients.length,
      appointments: activeAppointments.length,
      activeAiJobs: store.aiJobs.filter((job) => ['queued', 'running'].includes(job.status)).length
    },
    equipment: store.equipment,
    recentQa: store.qaReports.slice(-5).reverse(),
    deployments: store.deployments.slice(-4).reverse()
  };
}

export function advancePatient(store, patientId, operator) {
  const patient = store.patients.find((item) => item.id === patientId);
  if (!patient) {
    throw new Error(`患者不存在：${patientId}`);
  }

  const currentIndex = store.workflow.steps.findIndex((step) => step.id === patient.currentStepId);
  if (currentIndex < 0 || currentIndex >= store.workflow.steps.length - 1) {
    return patient;
  }

  const currentStep = store.workflow.steps[currentIndex];
  const nextStep = store.workflow.steps[currentIndex + 1];

  // Business progression is intentionally centralized here so UI, tests, and
  // AI-generated changes all obey the same workflow transition rule.
  patient.currentStepId = nextStep.id;
  patient.status = nextStep.id;

  store.auditLog.push({
    id: `AUD-${Date.now()}`,
    at: new Date().toISOString(),
    actor: operator || 'clinical-user',
    action: 'advance-patient',
    detail: `${patient.name} 从「${currentStep.name}」进入「${nextStep.name}」。`
  });

  return patient;
}

export function savePatientStepRecord(store, patientId, values, operator) {
  const patient = store.patients.find((item) => item.id === patientId);
  if (!patient) {
    throw new Error(`患者不存在：${patientId}`);
  }

  const step = findStep(store.workflow, patient.currentStepId);
  if (!step) {
    throw new Error(`流程节点不存在：${patient.currentStepId}`);
  }

  const normalizedValues = values && typeof values === 'object' ? values : {};
  const missingFields = step.formFields
    .filter((field) => field.required)
    .filter((field) => {
      const value = normalizedValues[field.key];
      return value === undefined || value === null || String(value).trim() === '';
    });

  if (missingFields.length > 0) {
    throw new Error(`请填写必填项：${missingFields.map((field) => field.label).join('、')}`);
  }

  // Step records are stored on the patient chart so workflow changes keep a
  // complete clinical trace instead of overwriting earlier node submissions.
  patient.stepRecords = patient.stepRecords || [];
  const record = {
    id: `REC-${Date.now()}`,
    stepId: step.id,
    stepName: step.name,
    actor: operator || 'clinical-user',
    recordedAt: new Date().toISOString(),
    values: Object.fromEntries(
      step.formFields.map((field) => [field.key, normalizedValues[field.key] ?? ''])
    )
  };

  patient.stepRecords.unshift(record);

  store.auditLog.push({
    id: `AUD-${Date.now() + 1}`,
    at: new Date().toISOString(),
    actor: record.actor,
    action: 'save-step-form',
    detail: `${patient.name} 保存「${step.name}」节点表单。`
  });

  return record;
}
