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
  Database,
  FileText,
  FlaskConical,
  GitBranch,
  HeartPulse,
  LayoutDashboard,
  ListChecks,
  Loader2,
  MonitorCog,
  Play,
  RefreshCw,
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
  '新增一个“物理师二次复核”节点，放在主任审核之后、治疗排程之前，只有物理师处理，需要填写二次复核意见。'
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

        <div className="system-card">
          <span className="system-label">后端服务</span>
          <strong>{apiBaseUrl.replace('http://', '')}</strong>
          <button className="ghost-button compact" onClick={() => refreshAll()} title="刷新数据">
            <RefreshCw size={15} />
            刷新
          </button>
        </div>
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
          <PanelHeader icon={Workflow} title="当前放疗流程" subtitle={`版本 ${state.workflow.activeVersion} · ${state.workflow.steps.length} 个节点`} />
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
          <PanelHeader icon={GitBranch} title="系统版本记录" subtitle="流程发布与审计" />
          <div className="deployment-list">
            {state.dashboard.deployments.map((deployment) => (
              <div className="deployment-item" key={deployment.id}>
                <strong>{deployment.version}</strong>
                <span>{deployment.title}</span>
                <small>{deployment.status}</small>
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
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');

  async function submitRequirement() {
    setRunning(true);
    setMessage('');
    try {
      await api('/api/ai/jobs', {
        method: 'POST',
        body: JSON.stringify({ requirement })
      });
      await onRefresh();
      setMessage('已完成需求解析、系统变更、自动测试和预览发布。');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setRunning(false);
    }
  }

  const latestJob = state.aiJobs[0];

  return (
    <div className="ai-layout">
      <section className="panel ai-console">
        <PanelHeader icon={Bot} title="AI 定制助手" subtitle="面向开发/实施人员的自动交付入口" />
        <div className="integration-strip">
          <IntegrationBadge icon={GitBranch} label="Gitea" value={state.integrations?.gitea?.enabled ? `${state.integrations.gitea.owner}/${state.integrations.gitea.repo}` : '未配置'} />
          <IntegrationBadge icon={Workflow} label="Jenkins" value={state.integrations?.jenkins?.enabled ? '外部流水线已接入' : '可选扩展'} />
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
          {running ? '正在生成变更...' : '生成并应用定制变更'}
        </button>
        {message && <div className="message-line">{message}</div>}
      </section>

      <section className="panel">
        <PanelHeader icon={GitBranch} title="最新定制任务" subtitle="需求、计划、测试、发布全链路留痕" />
        {latestJob ? <JobDetail job={latestJob} /> : <div className="empty-state">暂无AI变更任务。</div>}
      </section>

      <section className="panel span-two">
        <PanelHeader icon={Database} title="审计日志" subtitle="医疗软件交付留痕" />
        <div className="audit-table">
          {state.auditLog.map((log) => (
            <div className="audit-row" key={log.id}>
              <span>{new Date(log.at).toLocaleString('zh-CN')}</span>
              <strong>{log.action}</strong>
              <small>{log.actor}</small>
              <p>{log.detail}</p>
            </div>
          ))}
        </div>
      </section>
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
        <StatusPill tone={job.status === 'completed' ? 'green' : job.status === 'failed' ? 'red' : 'amber'} icon={Activity} text={job.status} />
      </div>

      <div className="stage-grid">
        {job.stages.map((stage) => (
          <div className={cx('stage-item', stage.status)} key={stage.id}>
            {stage.status === 'done' ? <Check size={16} /> : stage.status === 'running' ? <Loader2 className="spin" size={16} /> : <TestTube2 size={16} />}
            <strong>{stage.name}</strong>
            <span>{stage.detail || stage.status}</span>
          </div>
        ))}
      </div>

      {job.plan && (
        <div className="plan-block">
          <h3>变更计划</h3>
          <p>{job.plan.summary}</p>
          <div className="operation-list">
            {job.plan.operations.map((operation, index) => (
              <code key={`${operation.type}-${index}`}>{operation.type} · {operation.step?.name || operation.field?.label || operation.rule?.name || operation.title}</code>
            ))}
          </div>
        </div>
      )}

      {job.testResult && (
        <div className="plan-block">
          <h3>自动测试</h3>
          {job.testResult.checks.map((check) => (
            <div className="test-row" key={check.name}>
              {check.passed ? <Check size={15} /> : <AlertTriangle size={15} />}
              <strong>{check.name}</strong>
              <span>{check.detail}</span>
            </div>
          ))}
        </div>
      )}

      {job.sourceControl && (
        <div className="plan-block">
          <h3>Gitea 留痕</h3>
          <div className="source-control-block">
            <Fact label="仓库" value={`${job.sourceControl.owner}/${job.sourceControl.repo}`} />
            <Fact label="分支" value={job.sourceControl.branch} />
            <Fact label="Commit" value={job.sourceControl.commitSha?.slice(0, 10) || '已记录'} />
            <a href={job.sourceControl.fileUrl} target="_blank" rel="noreferrer">查看交付清单</a>
          </div>
        </div>
      )}
    </div>
  );
}

function IntegrationBadge({ icon: Icon, label, value }) {
  return (
    <div className="integration-badge">
      <Icon size={16} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function WorkflowRail({ workflow, compact = false }) {
  return (
    <div className={cx('workflow-rail', compact && 'compact')}>
      {workflow.steps.map((step, index) => (
        <div className={cx('workflow-step', step.state || 'plain')} key={step.id}>
          <div className="step-index">{index + 1}</div>
          <div>
            <strong>{step.name}</strong>
            <span>{roleName(step.role)} · {step.slaHours}h</span>
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
