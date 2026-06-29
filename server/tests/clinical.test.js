import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultStore } from '../domain/defaultData.js';
import { advancePatient, evaluatePatientSafety, getPatientProgress, savePatientStepRecord } from '../domain/clinical.js';

test('evaluates dose risks and blocks low gamma treatment scheduling', () => {
  const store = createDefaultStore();
  const highRiskPatient = store.patients.find((patient) => patient.id === 'P-1003');
  const findings = evaluatePatientSafety(highRiskPatient, store.rules);

  assert.equal(findings.some((finding) => finding.level === 'critical'), true);
  assert.equal(findings.some((finding) => finding.title === '治疗排程阻断'), true);
});

test('advances patient through configured workflow', () => {
  const store = createDefaultStore();
  const patient = store.patients.find((item) => item.id === 'P-1002');
  const beforeProgress = getPatientProgress(patient, store.workflow);

  assert.equal(beforeProgress.find((step) => step.id === 'ct-simulation').state, 'active');

  advancePatient(store, 'P-1002', 'unit-test');

  assert.equal(patient.currentStepId, 'contouring');
  assert.equal(store.auditLog.at(-1).action, 'advance-patient');
});

test('saves current workflow step form with required field validation', () => {
  const store = createDefaultStore();
  const patient = store.patients.find((item) => item.id === 'P-1002');

  assert.throws(
    () => savePatientStepRecord(store, patient.id, { immobilization: '体膜' }, 'unit-test'),
    /请填写必填项/
  );

  const record = savePatientStepRecord(
    store,
    patient.id,
    { immobilization: '体膜', scanRange: '胸壁上下各5cm' },
    'unit-test'
  );

  assert.equal(record.stepId, 'ct-simulation');
  assert.equal(patient.stepRecords.length, 1);
  assert.equal(store.auditLog.at(-1).action, 'save-step-form');
});
