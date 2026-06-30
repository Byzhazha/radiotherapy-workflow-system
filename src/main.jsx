import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Bot,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardCheck,
  Code2,
  FileText,
  FlaskConical,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  Loader2,
  MonitorCog,
  Play,
  ShieldCheck,
  Stethoscope,
  TestTube2,
  UserRound,
  Workflow
} from 'lucide-react';
import './styles.css';

const apiBaseUrl = window.rtDesktop?.apiBaseUrl || new URLSearchParams(window.location.search).get('api') || 'http://127.0.0.1:8750';

const navItems = [
  { id: 'overview', label: '运行总览', icon: LayoutDashboard },
  { id: 'patients', label: '患者流程', icon: UserRound },
  { id: 'schedule', label: '排程质控', icon: CalendarClock },
  { id: 'followup', label: '随访管理', icon: HeartPulse },
  { id: 'ai', label: '定制助手', icon: Bot }
];

const requirementSamples = [
  '给治疗排程前新增“复位验证”节点，由技师处理，必须记录IGRT结论和复位误差，超过8小时提醒护士长。',
  '在计划设计步骤新增“处方剂量备注”字段，并新增规则：处方剂量大于60Gy时要求主任审核。',
  '新增一个“物理师二次复核”节点，放在主任审核之后、治疗排程之前，只有物理师处理，需要填写二次复核意见。',
  '在CT定位步骤新增“固定装置照片确认”必填字段，字段类型为选择项，选项包含已上传、待补拍、不适用。',
  '把首次治疗步骤目标时间调整为12小时，并新增质控项：核对治疗机、计划号、首次摆位影像。',
  '新增规则：Gamma通过率低于95%时阻断首次治疗，并提示物理师完成计划QA复核。',
  '新增每周“高风险患者治疗准备报表”，面向科主任，包含患者、诊断、总剂量、当前节点和质控结果。',
  '调整交付工作台页面布局，增加患者队列、规则风险、审批详情和报表模板四个区块，审批详情占两列。',
  '给护士角色增加查看报表权限，并允许护士处理治疗排程和随访两个流程节点。',
  '在随访步骤新增“不良反应等级”选择字段，选项为0级、1级、2级、3级、4级，2级及以上要求医生复核。',
  '删除主任审核后的“物理师二次复核”节点，相关患者迁移到治疗排程，并保留删除原因用于交付审计。'
];

function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

async function api(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `请求失败：${response.status}`);
  }

  return response.json();
}

function App() {
  const [activeView, setActiveView] = useState('overview');
  const [state, setState] = useState(null);
  const [selectedPatientId, setSelectedPatientId] = useState('P-1001');
  const [patientDetail, setPatientDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadState() {
    setError('');
    const nextState = await api('/api/state');
    setState(nextState);
    return nextState;
  }

  async function loadPatient(patientId) {
    const detail = await api(`/api/patients/${patientId}`);
    setPatientDetail(detail);
  }

  useEffect(() => {
    (async () => {
      try {
        const initialState = await loadState();
        await loadPatient(selectedPatientId || initialState.patients[0]?.id);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedPatientId) return;
    loadPatient(selectedPatientId).catch((err) => setError(err.message));
  }, [selectedPatientId]);

  async function refreshAll(patientId = selectedPatientId) {
    const nextState = await loadState();
    const nextPatientId = patientId || nextState.patients[0]?.id;
    if (nextPatientId) {
      setSelectedPatientId(nextPatientId);
      await loadPatient(nextPatientId);
    }
  }

  if (loading) {
    return (
      <div className="boot-screen">
        <Loader2 className="spin" size={34} />
        <span>正在启动放疗流程管理系统...</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">RT</div>
          <div>
            <strong>放疗流程管理系统</strong>
            <span>患者流程 · 排程质控 · 随访</span>
          </div>
        </div>

        <nav>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={cx('nav-button', activeView === item.id && 'active')}
                onClick={() => setActiveView(item.id)}
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">{state?.product?.hospital}</span>
            <h1>{viewTitle(activeView)}</h1>
          </div>
          <div className="topbar-actions">
            <StatusPill tone="green" icon={ShieldCheck} text={`流程版本 v${state.workflow.activeVersion}`} />
            <StatusPill tone="amber" icon={CalendarClock} text={`今日 ${state.dashboard.counts.appointments} 个排程`} />
          </div>
        </header>

        {error && (
          <div className="error-banner">
            <AlertTriangle size={18} />
            {error}
          </div>
        )}

        {activeView === 'overview' && <Overview state={state} onOpenPatient={(id) => { setSelectedPatientId(id); setActiveView('patients'); }} />}
        {activeView === 'patients' && (
          <PatientsView
            state={state}
            selectedPatientId={selectedPatientId}
            patientDetail={patientDetail}
            onSelectPatient={setSelectedPatientId}
            onRefresh={refreshAll}
          />
        )}
        {activeView === 'schedule' && <ScheduleView state={state} />}
        {activeView === 'followup' && <FollowUpView state={state} />}
        {activeView === 'ai' && <CustomizationAssistant state={state} onRefresh={refreshAll} />}
      </main>
    </div>
  );
}

function viewTitle(view) {
  return {
    overview: '临床运行总览',
    patients: '患者放疗流程',
    schedule: '排程、剂量与质控',
    followup: '随访与疗效管理',
    ai: 'AI 定制助手'
  }[view];
}

function StatusPill({ tone, icon: Icon, text }) {
  return (
    <div className={cx('status-pill', tone)}>
      <Icon size={15} />
      <span>{text}</span>
    </div>
  );
}

function Overview({ state, onOpenPatient }) {
  const cards = [
    { label: '在管患者', value: state.dashboard.counts.patients, icon: UserRound, tone: 'blue' },
    { label: '紧急/高风险', value: state.dashboard.counts.urgent, icon: AlertTriangle, tone: 'red' },
    { label: '治疗阻断', value: state.dashboard.counts.blocked, icon: ShieldCheck, tone: 'amber' },
    { label: '今日排程', value: state.dashboard.counts.appointments, icon: CalendarClock, tone: 'green' }
  ];

  return (
    <section className="view-grid">
      <div className="metric-grid">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div className={cx('metric-tile', card.tone)} key={card.label}>
              <Icon size={22} />
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </div>
          );
        })}
      </div>

      <div className="content-grid two">
        <section className="panel">
          <PanelHeader icon={Workflow} title="当前放疗流程" subtitle={`按患者从登记到随访的实际顺序展示 · 目标时间为科室内部流转要求`} />
          <WorkflowRail workflow={state.workflow} compact />
        </section>

        <section className="panel">
          <PanelHeader icon={Activity} title="患者队列" subtitle="按当前节点和风险状态排序" />
          <div className="patient-list compact-list">
            {state.patients.map((patient) => (
              <button className="patient-row" key={patient.id} onClick={() => onOpenPatient(patient.id)}>
                <span className={cx('priority-dot', patient.priority)} />
                <div>
                  <strong>{patient.name}</strong>
                  <span>{patient.diagnosis} · {patient.prescription.totalDoseGy}Gy/{patient.prescription.fractions}F</span>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="content-grid three">
        <section className="panel">
          <PanelHeader icon={MonitorCog} title="设备状态" subtitle="科室设备预约统一管理" />
          <div className="equipment-grid">
            {state.equipment.map((item) => (
              <div className="equipment-item" key={item.id}>
                <span className={cx('equipment-led', item.status)} />
                <strong>{item.name}</strong>
                <small>{item.room} · {item.type}</small>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelHeader icon={ClipboardCheck} title="最近质控" subtitle="计划验证与结构质控" />
          <div className="qa-list">
            {state.dashboard.recentQa.map((report) => (
              <div className="qa-item" key={report.id}>
                <span className={cx('qa-score', report.result)}>{report.score}</span>
                <div>
                  <strong>{report.type}</strong>
                  <small>{report.patientId} · {report.result === 'passed' ? '通过' : '未通过'}</small>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelHeader icon={ClipboardCheck} title="最近定制记录" subtitle="AI变更与流程发布结果" />
          <div className="deployment-list">
            {state.dashboard.deployments.map((deployment) => (
              <div className="deployment-item" key={deployment.id}>
                <strong>{deployment.version}</strong>
                <span>{deployment.title}</span>
                <small>{deliveryStatusLabel(deployment.status)}</small>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function PatientsView({ state, selectedPatientId, patientDetail, onSelectPatient, onRefresh }) {
  const selectedPatient = patientDetail?.patient || state.patients.find((patient) => patient.id === selectedPatientId);

  async function advance() {
    await api(`/api/patients/${selectedPatient.id}/advance`, {
      method: 'POST',
      body: JSON.stringify({ operator: 'desktop-user' })
    });
    await onRefresh(selectedPatient.id);
  }

  return (
    <div className="patients-layout">
      <section className="panel patient-picker">
        <PanelHeader icon={UserRound} title="患者列表" subtitle="当前在管患者" />
        {state.patients.map((patient) => (
          <button
            key={patient.id}
            className={cx('patient-select', patient.id === selectedPatientId && 'active')}
            onClick={() => onSelectPatient(patient.id)}
          >
            <div>
              <strong>{patient.name}</strong>
              <span>{patient.mrn}</span>
            </div>
            <small>{patient.diagnosis}</small>
          </button>
        ))}
      </section>

      <section className="panel patient-detail">
        <PanelHeader
          icon={Stethoscope}
          title={`${selectedPatient.name} · ${selectedPatient.diagnosis}`}
          subtitle={`${selectedPatient.sex} · ${selectedPatient.age}岁 · ${selectedPatient.physician}`}
          action={(
            <button className="primary-button" onClick={advance} title="推进到下一流程节点">
              <Play size={16} />
              推进流程
            </button>
          )}
        />

        <WorkflowRail workflow={{ ...state.workflow, steps: patientDetail?.progress || state.workflow.steps }} />

        <div className="detail-grid">
          <div className="clinical-block">
            <h3>处方与计划</h3>
            <div className="fact-grid">
              <Fact label="治疗部位" value={selectedPatient.prescription.site} />
              <Fact label="技术" value={selectedPatient.prescription.technique} />
              <Fact label="总剂量" value={`${selectedPatient.prescription.totalDoseGy}Gy`} />
              <Fact label="分次" value={`${selectedPatient.prescription.fractions}F`} />
            </div>
          </div>

          <div className="clinical-block">
            <h3>当前节点表单</h3>
            <DynamicStepForm workflow={state.workflow} patient={selectedPatient} onSaved={() => onRefresh(selectedPatient.id)} />
          </div>
        </div>

        <div className="detail-grid">
          <DosePanel patient={selectedPatient} />
          <SafetyPanel findings={patientDetail?.safety || []} />
        </div>
      </section>
    </div>
  );
}

function DynamicStepForm({ workflow, patient, onSaved }) {
  const step = workflow.steps.find((item) => item.id === patient.currentStepId) || workflow.steps[0];
  const latestRecord = patient.stepRecords?.find((record) => record.stepId === step.id);
  const [values, setValues] = useState(() => initialStepValues(step, latestRecord));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setValues(initialStepValues(step, latestRecord));
    setMessage('');
  }, [patient.id, step.id, latestRecord?.id]);

  function updateField(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function saveRecord() {
    setSaving(true);
    setMessage('');
    try {
      await api(`/api/patients/${patient.id}/step-records`, {
        method: 'POST',
        body: JSON.stringify({ operator: 'desktop-user', values })
      });
      setMessage('节点表单已保存。');
      await onSaved?.();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dynamic-form">
      <div className="form-heading">
        <BadgeCheck size={17} />
        <strong>{step.name}</strong>
        <span>{step.room}</span>
      </div>
      {step.formFields.map((field) => (
        <label key={field.key}>
          <span>{field.label}{field.required ? ' *' : ''}</span>
          {field.type === 'select' ? (
            <select value={values[field.key] || ''} onChange={(event) => updateField(field.key, event.target.value)}>
              <option value="" disabled>请选择</option>
              {field.options?.map((option) => <option key={option}>{option}</option>)}
            </select>
          ) : field.type === 'textarea' ? (
            <textarea rows={3} placeholder={`填写${field.label}`} value={values[field.key] || ''} onChange={(event) => updateField(field.key, event.target.value)} />
          ) : (
            <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : 'text'} placeholder={`填写${field.label}`} value={values[field.key] || ''} onChange={(event) => updateField(field.key, event.target.value)} />
          )}
        </label>
      ))}
      <button className="primary-button" onClick={saveRecord} disabled={saving}>
        {saving ? <Loader2 className="spin" size={16} /> : <ClipboardCheck size={16} />}
        {saving ? '正在保存...' : '保存节点表单'}
      </button>
      {latestRecord && <span className="record-note">最近提交：{new Date(latestRecord.recordedAt).toLocaleString('zh-CN')} · {latestRecord.actor}</span>}
      {message && <div className={cx('message-line', message.includes('请填写') && 'error')}>{message}</div>}
    </div>
  );
}

function initialStepValues(step, record) {
  return Object.fromEntries(
    step.formFields.map((field) => [field.key, record?.values?.[field.key] || ''])
  );
}

function DosePanel({ patient }) {
  const dosePlan = patient.dosePlan;
  if (!dosePlan) {
    return (
      <div className="clinical-block">
        <h3>剂量计划</h3>
        <div className="empty-state">
          <FlaskConical size={22} />
          当前患者尚未生成剂量计划。
        </div>
      </div>
    );
  }

  return (
    <div className="clinical-block">
      <h3>剂量计划与DVH</h3>
      <div className="dose-stats">
        <Fact label="PTV覆盖" value={`${dosePlan.ptvCoverage}%`} />
        <Fact label="CI" value={dosePlan.conformityIndex} />
        <Fact label="HI" value={dosePlan.homogeneityIndex} />
        <Fact label="Gamma" value={`${dosePlan.gammaPassRate}%`} />
      </div>
      <DvhChart points={dosePlan.dvh} />
    </div>
  );
}

function DvhChart({ points }) {
  const width = 420;
  const height = 170;
  const keys = Object.keys(points[0] || {}).filter((key) => key !== 'dose');
  const maxDose = Math.max(...points.map((point) => point.dose), 1);
  const colors = ['#7b2d26', '#2f5f73', '#6a7f43', '#a15c38'];

  function lineFor(key) {
    return points.map((point) => {
      const x = (point.dose / maxDose) * (width - 38) + 24;
      const y = height - 24 - (point[key] / 100) * (height - 42);
      return `${x},${y}`;
    }).join(' ');
  }

  return (
    <svg className="dvh-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="DVH曲线">
      <line x1="24" y1="18" x2="24" y2={height - 24} />
      <line x1="24" y1={height - 24} x2={width - 14} y2={height - 24} />
      {[25, 50, 75, 100].map((tick) => (
        <line key={tick} className="grid-line" x1="24" x2={width - 14} y1={height - 24 - tick / 100 * (height - 42)} y2={height - 24 - tick / 100 * (height - 42)} />
      ))}
      {keys.map((key, index) => (
        <polyline key={key} points={lineFor(key)} style={{ stroke: colors[index % colors.length] }} />
      ))}
      <g className="legend">
        {keys.map((key, index) => (
          <text key={key} x={30 + index * 88} y={14} fill={colors[index % colors.length]}>{key}</text>
        ))}
      </g>
    </svg>
  );
}

function SafetyPanel({ findings }) {
  return (
    <div className="clinical-block">
      <h3>安全与规则校验</h3>
      <div className="finding-list">
        {findings.map((finding, index) => (
          <div className={cx('finding-item', finding.level)} key={`${finding.title}-${index}`}>
            {finding.level === 'pass' ? <Check size={16} /> : <AlertTriangle size={16} />}
            <div>
              <strong>{finding.title}</strong>
              <span>{finding.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScheduleView({ state }) {
  const patientMap = useMemo(() => new Map(state.patients.map((patient) => [patient.id, patient])), [state.patients]);

  return (
    <div className="content-grid two">
      <section className="panel">
        <PanelHeader icon={CalendarClock} title="设备排程" subtitle="定位、治疗与复核预约" />
        <div className="appointment-list">
          {state.appointments.map((appointment) => {
            const patient = patientMap.get(appointment.patientId);
            return (
              <div className={cx('appointment-item', appointment.status)} key={appointment.id}>
                <div className="time-block">
                  <strong>{new Date(appointment.startsAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</strong>
                  <span>{new Date(appointment.startsAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div>
                  <strong>{appointment.title}</strong>
                  <span>{patient?.name} · {appointment.equipmentId} · {appointment.durationMinutes}分钟</span>
                </div>
                <small>{appointment.status}</small>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <PanelHeader icon={ListChecks} title="规则引擎" subtitle="剂量、质控、审批和阻断规则" />
        <div className="rule-list">
          {state.rules.map((rule) => (
            <div className="rule-item" key={rule.id}>
              <div className={cx('severity', rule.severity)}>{rule.severity}</div>
              <div>
                <strong>{rule.name}</strong>
                <code>{rule.expression}</code>
                <span>{rule.action}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function FollowUpView({ state }) {
  const patientMap = useMemo(() => new Map(state.patients.map((patient) => [patient.id, patient])), [state.patients]);

  return (
    <div className="content-grid two">
      <section className="panel">
        <PanelHeader icon={HeartPulse} title="随访计划" subtitle="治疗后复诊、毒性分级和疗效观察" />
        <div className="followup-list">
          {state.followUps.map((followUp) => {
            const patient = patientMap.get(followUp.patientId);
            return (
              <div className="followup-item" key={followUp.id}>
                <div className="time-block">
                  <strong>{new Date(followUp.dueAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</strong>
                  <span>{new Date(followUp.dueAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div>
                  <strong>{patient?.name || followUp.name}</strong>
                  <span>{patient?.diagnosis || '院外随访'} · 毒性分级 {followUp.toxicityGrade}</span>
                </div>
                <small>{followUp.status}</small>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <PanelHeader icon={FileText} title="随访模板" subtitle="疗效评价、不良反应和下次复诊" />
        <div className="template-grid">
          <div className="clinical-block">
            <h3>近期疗效</h3>
            <div className="fact-grid">
              <Fact label="评价标准" value="RECIST 1.1" />
              <Fact label="影像复查" value="CT/MRI" />
              <Fact label="毒性记录" value="CTCAE" />
              <Fact label="下次随访" value="自动生成" />
            </div>
          </div>
          <div className="clinical-block">
            <h3>随访质控</h3>
            <div className="finding-list">
              <div className="finding-item pass">
                <Check size={16} />
                <div>
                  <strong>随访窗口</strong>
                  <span>治疗结束后 30 天内建立首诊随访。</span>
                </div>
              </div>
              <div className="finding-item warning">
                <AlertTriangle size={16} />
                <div>
                  <strong>毒性升级提醒</strong>
                  <span>2 级及以上不良反应推送给主管医生。</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function CustomizationAssistant({ state, onRefresh }) {
  const [requirement, setRequirement] = useState(requirementSamples[0]);
  const [currentJob, setCurrentJob] = useState(null);
  const [running, setRunning] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rollingBackId, setRollingBackId] = useState('');
  const [message, setMessage] = useState('');

  async function submitRequirement() {
    setRunning(true);
    setMessage('');
    setCurrentJob(null);
    try {
      const createdJob = await api('/api/ai/jobs', {
        method: 'POST',
        body: JSON.stringify({ requirement })
      });
      setCurrentJob(createdJob);
      await onRefresh();
      if (createdJob.status === 'completed') {
        setMessage('已生成沙箱预览，完成业务安全检查后可审批激活。');
      } else if (createdJob.status === 'failed') {
        setMessage(`生成失败：${jobFailureDetail(createdJob)}`);
      } else {
        setMessage('需求已提交，执行结果会在右侧更新。');
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function approveLatestJob() {
    if (!latestJob) return;

    setApproving(true);
    setMessage('');
    try {
      const approvedJob = await api(`/api/ai/jobs/${latestJob.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({
          operator: 'delivery-manager',
          comment: '已核对预览差异、测试结果和审批清单。'
        })
      });
      setCurrentJob(approvedJob);
      await onRefresh();
      setMessage('预览配置已审批并激活。');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setApproving(false);
    }
  }

  async function rollbackDeployment(deploymentId) {
    setRollingBackId(deploymentId);
    setMessage('');
    try {
      await api(`/api/deployments/${deploymentId}/rollback`, {
        method: 'POST',
        body: JSON.stringify({
          operator: 'delivery-manager',
          reason: '恢复已验证版本。'
        })
      });
      await onRefresh();
      setMessage('已恢复到选定配置版本。');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setRollingBackId('');
    }
  }

  const latestJob = currentJob;
  const recentDeliveryLogs = state.auditLog
    .filter((log) => ['complete-ai-job', 'apply-change-plan', 'approve-ai-deployment', 'rollback-deployment'].includes(log.action))
    .slice(0, 5);
  const canApprove = latestJob?.deployment?.status === 'pending-approval';
  const rollbackTargets = state.deployments.filter((deployment) => deployment.status === 'active' || deployment.status === 'superseded').slice(0, 5);

  return (
    <div className="ai-layout">
      <section className="panel ai-console">
        <PanelHeader icon={Bot} title="下达定制需求" subtitle="输入医院提出的流程、规则、报表或权限改动" />
        <div className="assistant-summary">
          <div>
            <strong>生成预览</strong>
            <span>AI 会把需求转换为流程、表单、规则、页面、报表和权限配置变更。</span>
          </div>
          <div>
            <strong>安全检查</strong>
            <span>系统先在沙箱里验证患者落点、核心路径、权限引用、报表和布局契约。</span>
          </div>
          <div>
            <strong>审批激活</strong>
            <span>预览通过后审批激活，已验证版本可以随时恢复。</span>
          </div>
        </div>
        <textarea value={requirement} onChange={(event) => setRequirement(event.target.value)} />
        <div className="sample-row">
          {requirementSamples.map((sample, index) => (
            <button key={sample} className="ghost-button" onClick={() => setRequirement(sample)}>
              示例 {index + 1}
            </button>
          ))}
        </div>
        <button className="primary-button wide" onClick={submitRequirement} disabled={running}>
          {running ? <Loader2 className="spin" size={17} /> : <Code2 size={17} />}
          {running ? '正在生成预览...' : '生成沙箱预览'}
        </button>
        {canApprove && (
          <button className="primary-button wide approve" onClick={approveLatestJob} disabled={approving}>
            {approving ? <Loader2 className="spin" size={17} /> : <ShieldCheck size={17} />}
            {approving ? '正在激活...' : '审批并激活预览'}
          </button>
        )}
        {message && <div className={cx('message-line', message.includes('失败') && 'error')}>{message}</div>}
      </section>

      <section className="panel">
        <PanelHeader icon={Activity} title="执行结果" subtitle="展示沙箱预览、业务安全检查和审批状态" />
        {latestJob ? <JobDetail job={latestJob} /> : <div className="empty-state">本次还没有生成预览。</div>}
      </section>

      <section className="panel span-two">
        <PanelHeader icon={ClipboardCheck} title="版本与回滚" subtitle="查看已生成配置版本，恢复经过验证的版本" />
        <div className="delivery-board">
          <div>
            <h3>配置版本</h3>
            <div className="version-list">
              {state.configVersions.slice(0, 6).map((version) => (
                <div className="version-row" key={version.id}>
                  <div>
                    <strong>{version.version}</strong>
                    <span>{version.title}</span>
                  </div>
                  <StatusPill tone={version.status === 'active' ? 'green' : version.status === 'pending-approval' ? 'amber' : 'red'} icon={Activity} text={deliveryStatusLabel(version.status)} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3>可恢复版本</h3>
            <div className="version-list">
              {rollbackTargets.map((deployment) => (
                <div className="version-row" key={deployment.id}>
                  <div>
                    <strong>{deployment.version}</strong>
                    <span>{deployment.title}</span>
                  </div>
                  <button className="ghost-button" onClick={() => rollbackDeployment(deployment.id)} disabled={Boolean(rollingBackId)}>
                    {rollingBackId === deployment.id ? <Loader2 className="spin" size={15} /> : <ShieldCheck size={15} />}
                    恢复
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="panel span-two">
        <PanelHeader icon={LayoutDashboard} title="配置化交付视图" subtitle="展示当前版本定义的页面、报表和角色权限" />
        <ConfigDeliveryView state={state} />
      </section>

      <section className="panel span-two">
        <PanelHeader icon={ClipboardCheck} title="最近交付记录" subtitle="展示与 AI 定制相关的需求、变更和发布结果" />
        <div className="audit-table">
          {(recentDeliveryLogs.length ? recentDeliveryLogs : state.auditLog.slice(0, 3)).map((log) => (
            <div className="audit-row" key={log.id}>
              <span>{new Date(log.at).toLocaleString('zh-CN')}</span>
              <strong>{deliveryActionLabel(log.action)}</strong>
              <small>{deliveryActorLabel(log.actor)}</small>
              <p>{deliveryLogDetail(log.detail)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ConfigDeliveryView({ state }) {
  const deliveryLayout = state.uiLayouts.find((layout) => layout.pageId === 'delivery-workbench') || state.uiLayouts[0];
  const permissionRows = Object.entries(state.permissionMatrix || {});

  return (
    <div className="config-delivery-grid">
      <div className="layout-preview">
        <div className="layout-preview-head">
          <strong>{deliveryLayout?.title || '交付工作台'}</strong>
          <span>{deliveryLayout?.sections?.length || 0} 个配置区块</span>
        </div>
        <div className="layout-section-grid">
          {(deliveryLayout?.sections || []).map((section) => (
            <div className={cx('layout-section', `cols-${section.columns || 1}`)} key={section.id}>
              <span>{sectionDisplayLabel(section.display)}</span>
              <strong>{section.title}</strong>
              <small>{sectionSourceLabel(section.source)}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="config-side-grid">
        <div>
          <h3>报表模板</h3>
          <div className="template-list">
            {state.reportTemplates.map((template) => (
              <div className="template-item" key={template.id}>
                <div>
                  <strong>{template.name}</strong>
                  <span>{template.audience} · {datasetLabel(template.dataset)}</span>
                </div>
                <small>{scheduleLabel(template.schedule)}</small>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3>角色权限</h3>
          <div className="permission-list">
            {permissionRows.map(([roleId, permission]) => (
              <div className="permission-item" key={roleId}>
                <strong>{roleName(roleId)}</strong>
                <span>{permissionSummary(permission)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function JobDetail({ job }) {
  return (
    <div className="job-detail">
      <div className="job-head">
        <div>
          <strong>{job.plan?.title || job.id}</strong>
          <span>{job.requirement}</span>
        </div>
        <StatusPill tone={job.status === 'completed' ? 'green' : job.status === 'failed' ? 'red' : 'amber'} icon={Activity} text={jobStatusLabel(job.status)} />
      </div>

      <div className="stage-timeline">
        {job.stages.map((stage) => (
          <div className={cx('stage-item', stage.status)} key={stage.id}>
            {stage.status === 'done' ? <Check size={16} /> : stage.status === 'running' ? <Loader2 className="spin" size={16} /> : <TestTube2 size={16} />}
            <div>
              <strong>{stageName(stage)}</strong>
              <span>{stageDetail(stage)}</span>
            </div>
          </div>
        ))}
      </div>

      {job.plan && (
        <div className="plan-block">
          <h3>变更计划</h3>
          <p>{job.plan.summary}</p>
          <div className="operation-list">
            {job.plan.operations.map((operation, index) => (
              <span className="operation-chip" key={`${operation.type}-${index}`}>{operationLabel(operation)}</span>
            ))}
          </div>
        </div>
      )}

      {job.testResult && (
        <div className="plan-block">
          <h3>业务安全检查</h3>
          {job.testResult.checks.map((check) => (
            <div className="test-row" key={check.name}>
              {check.passed ? <Check size={15} /> : <AlertTriangle size={15} />}
              <strong>{check.name}</strong>
              <span>{check.detail}</span>
            </div>
          ))}
        </div>
      )}

      {job.sandbox?.diff?.length > 0 && (
        <div className="plan-block">
          <h3>沙箱差异</h3>
          <div className="diff-grid">
            {job.sandbox.diff.map((change, index) => (
              <div className="diff-item" key={`${change.area}-${change.id}-${index}`}>
                <span>{configAreaLabel(change.area)}</span>
                <strong>{change.title}</strong>
                <small>{changeActionLabel(change.action)}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {job.deployment?.approval && (
        <div className="plan-block">
          <h3>审批详情</h3>
          <div className="approval-list">
            {job.deployment.approval.checklist?.map((item) => (
              <div className="approval-item" key={item}>
                <ClipboardCheck size={15} />
                <span>{item}</span>
              </div>
            ))}
          </div>
          <p>{approvalStatusText(job.deployment.approval)}</p>
        </div>
      )}

      {job.deployment && (
        <div className="plan-block">
          <h3>交付记录</h3>
          <div className="delivery-record-block">
            <Fact label="版本" value={job.deployment.version} />
            <Fact label="状态" value={deliveryStatusLabel(job.deployment.status)} />
            <Fact label="时间" value={new Date(job.deployment.createdAt).toLocaleString('zh-CN')} />
          </div>
        </div>
      )}
    </div>
  );
}

function jobFailureDetail(job) {
  const failedStage = job.stages?.find((stage) => stage.status === 'failed');
  return deliveryLogDetail(job.error || failedStage?.detail || '请查看右侧执行结果。');
}

function stageName(stage) {
  return {
    sandbox: '生成沙箱预览',
    test: '业务安全检查',
    deploy: '生成待审批版本',
    'source-control': '保存交付记录'
  }[stage.id] || stage.name || stage.id;
}

function stageDetail(stage) {
  if (!stage.detail) {
    return stageStatusLabel(stage.status);
  }

  if (stage.id === 'source-control') {
    return '变更计划、配置快照、差异和测试结果已保存。';
  }

  return deliveryLogDetail(stage.detail);
}

function stageStatusLabel(status) {
  return {
    waiting: '等待执行',
    running: '正在执行',
    done: '已完成',
    failed: '执行失败'
  }[status] || status;
}

function jobStatusLabel(status) {
  return {
    running: '执行中',
    completed: '已完成',
    failed: '失败'
  }[status] || status;
}

function deliveryStatusLabel(status) {
  return {
    active: '已发布',
    'pending-approval': '待审核',
    superseded: '已归档',
    failed: '发布失败'
  }[status] || status;
}

function deliveryActionLabel(action) {
  return {
    'complete-ai-job': 'AI定制完成',
    'apply-change-plan': '变更计划已应用',
    'approve-ai-deployment': '预览版本已审批',
    'rollback-deployment': '已恢复版本',
    'step-record': '节点表单已保存',
    'advance-patient': '患者流程已推进'
  }[action] || action;
}

function deliveryActorLabel(actor) {
  return {
    'ai-delivery-agent': 'AI定制助手',
    'desktop-user': '操作员'
  }[actor] || actor;
}

function deliveryLogDetail(detail = '') {
  const submittedDeliveryPattern = new RegExp('已' + '提交\\s+[^@\\s]+@[^@\\s]+', 'g');
  return detail
    .replace(/，[^，。]*提交\s*[a-zA-Z0-9]{6,}/g, '')
    .replace(submittedDeliveryPattern, '变更计划、测试结果和发布记录已保存。')
    .replace(/未配置[^，。]*，已保留本地审计记录。/g, '变更计划、测试结果和发布记录已保存。')
    .replace(/[A-Za-z]+ 留痕/g, '交付记录');
}

function operationLabel(operation) {
  const target = operation.step?.name
    || operation.field?.label
    || operation.rule?.name
    || operation.layout?.title
    || operation.template?.name
    || operation.stepId
    || operation.ruleId
    || operation.roleId
    || operation.title
    || '当前配置';
  const action = {
    addWorkflowStep: '新增流程节点',
    updateWorkflowStep: '调整流程节点',
    removeWorkflowStep: '删除流程节点',
    addFormField: '新增表单字段',
    updateFormField: '调整表单字段',
    removeFormField: '删除表单字段',
    addRule: '新增业务规则',
    updateRule: '调整业务规则',
    removeRule: '删除业务规则',
    updateUiPanel: '更新界面面板',
    upsertUiLayout: '调整页面布局',
    upsertReportTemplate: '生成报表模板',
    updatePermission: '调整角色权限'
  }[operation.type] || '应用变更';

  return `${action}：${target}`;
}

function configAreaLabel(area) {
  return {
    workflow: '流程',
    rules: '规则',
    uiPanels: '面板',
    uiLayouts: '页面',
    reportTemplates: '报表',
    permissionMatrix: '权限'
  }[area] || area;
}

function changeActionLabel(action) {
  return {
    added: '新增',
    updated: '更新',
    removed: '删除'
  }[action] || action;
}

function approvalStatusText(approval) {
  if (approval.status === 'approved') {
    return `审批通过：${approval.comment || '已激活预览配置。'}`;
  }

  return `等待${approval.requiredBy || '负责人'}审批。`;
}

function sectionSourceLabel(source) {
  return {
    workflow: '流程数据',
    patients: '患者队列',
    appointments: '排程数据',
    qaReports: '质控记录',
    followUps: '随访计划',
    rules: '规则库',
    deployments: '版本记录',
    aiJobs: '定制任务',
    reports: '报表模板'
  }[source] || source;
}

function sectionDisplayLabel(display) {
  return {
    timeline: '时间线',
    queue: '队列',
    list: '列表',
    cards: '卡片',
    chart: '图表',
    diff: '差异',
    approval: '审批',
    table: '表格'
  }[display] || display;
}

function datasetLabel(dataset) {
  return {
    patients: '患者',
    appointments: '排程',
    qaReports: '质控',
    followUps: '随访',
    rules: '规则',
    deployments: '版本'
  }[dataset] || dataset;
}

function scheduleLabel(schedule) {
  return {
    manual: '手动生成',
    daily: '每日生成',
    weekly: '每周生成',
    monthly: '每月生成'
  }[schedule] || schedule;
}

function permissionSummary(permission) {
  const enabled = [
    permission.canEditPatients && '患者',
    permission.canManageWorkflow && '流程',
    permission.canApproveDeployments && '审批',
    permission.canRollbackDeployments && '回滚',
    permission.canViewReports && '报表'
  ].filter(Boolean);

  return `${enabled.length ? enabled.join('、') : '基础操作'} · ${permission.workflowStepIds?.length || 0} 个流程节点`;
}

function WorkflowRail({ workflow, compact = false }) {
  return (
    <div className={cx('workflow-rail', compact && 'compact')}>
      {workflow.steps.map((step, index) => (
        <div className={cx('workflow-step', step.state || 'plain')} key={step.id}>
          <div className="step-index">第{index + 1}步</div>
          <div>
            <strong>{step.name}</strong>
            <span>处理人：{roleName(step.role)}</span>
            <span>目标：{slaLabel(step.slaHours)}内完成</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function roleName(role) {
  return {
    registrar: '登记员',
    doctor: '医生',
    physicist: '物理师',
    technician: '技师',
    director: '主任',
    nurse: '护士'
  }[role] || role;
}

function slaLabel(hours) {
  if (hours < 24) {
    return `${hours}小时`;
  }

  const days = Math.round(hours / 24);
  return `${days}天`;
}

function PanelHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="panel-header">
      <div>
        <Icon size={19} />
        <div>
          <h2>{title}</h2>
          {subtitle && <span>{subtitle}</span>}
        </div>
      </div>
      {action}
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
