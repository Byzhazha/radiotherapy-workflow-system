# 放疗流程管理系统

这是一个 Windows 桌面端放疗流程管理系统，主线能力覆盖患者流程、设备排程、计划质控、随访管理和审计留痕。系统内置 AI 定制助手，面向开发人员和实施工程师，用于根据医院的定制化需求生成变更计划、修改系统流程/表单/规则、运行自动检查并发布预览版本。

## 核心能力

- 患者流程：患者登记、放疗会诊、CT 定位、靶区勾画、计划设计、物理审核、主任审核、治疗排程、首次治疗、随访。
- 计划质控：处方剂量、分次、DVH 曲线、PTV 覆盖、Gamma 通过率、危及器官约束和治疗阻断规则。
- 设备排程：CT 模拟定位机、直线加速器、TOMO 设备的预约状态和治疗任务。
- 随访管理：治疗后复诊、毒性分级、疗效评价和下次随访计划。
- AI 定制助手：自然语言输入医院需求后，后端调用大模型生成受控变更计划，应用到流程、表单、规则和系统版本记录。
- 审计留痕：患者流程推进、定制变更、发布审批都会写入审计日志。
- Gitea 工程留痕：AI 每次定制任务会生成交付清单并提交到 Gitea 仓库，保留需求、计划、测试、发布和流程快照。

## 架构

```text
Electron 桌面客户端
  └─ React 临床工作站界面
      └─ 本机/远端 Express API
          ├─ 放疗流程业务模型
          ├─ 患者、排程、质控、随访 API
          ├─ AI 变更计划生成与校验
          ├─ 自动回归测试与发布记录
          ├─ Gitea 交付清单提交
          └─ JSON 持久化存储
```

桌面端打开的是 Windows 软件。React 负责界面渲染，Express 负责业务 API 和 AI 调用。AI 密钥放在后端环境变量里，客户端只连接统一后端服务。

默认客户端配置位于 `config/client-config.json`：

```json
{
  "apiBaseUrl": "http://38.76.162.229:8750"
}
```

## 本地运行

```bash
npm install
npm run dev
```

AI 服务配置在 `.env`：

```env
AI_BASE_URL=https://zz1cc.cc.cd/v1
AI_API_KEY=your-server-side-key
AI_MODEL=gpt-5.5
RT_API_PORT=8750
RT_API_HOST=127.0.0.1
GITEA_BASE_URL=https://gitea.jaycode.online
GITEA_OWNER=gitadmin
GITEA_REPO=radiotherapy-workflow-system
GITEA_USERNAME=gitadmin
GITEA_PASSWORD=your-gitea-password
GITEA_BRANCH=main
```

## Gitea 仓库

```bash
python scripts/init_gitea_repo.py
```

仓库地址：`https://gitea.jaycode.online/gitadmin/radiotherapy-workflow-system`

AI 定制任务完成后会在仓库的 `ai-deliveries/` 目录生成交付清单。Gitea Actions 工作流位于 `.gitea/workflows/verify.yml`，用于 push 后执行测试和前端构建。Jenkins 可以作为企业环境里的外部流水线执行器接入，当前主链路由系统后端直接完成变更、测试、发布预览和 Gitea 留痕。

## 验证

```bash
npm test
npm run build
```

自动化测试覆盖：

- 流程变更应用与回归检查。
- 剂量质控风险识别与治疗阻断。
- 患者流程推进。
- AI 输出不符合 schema 时的自动修正链路。

## 打包

```bash
npm run package
```

Windows 桌面端输出到 `release/放疗流程管理系统-win-x64/`。打开 `放疗流程管理系统.exe` 即可运行。生成新产物时会清理旧构建目录，避免误用历史版本。

## 面试讲法

这个项目回答的是“开发人员如何基于现有放疗流程管理软件，利用 AI 完成客户定制化需求”。主系统先解决放疗业务闭环，AI 定制助手通过后端 OpenAI 兼容接口调用大模型，读取现有流程、字段、规则和发布状态，把医院需求转成受约束的变更计划，自动应用、测试、预览发布，并保留医疗软件需要的审计链路。

Gitea 用来证明每次 AI 修改都有版本记录、diff、交付清单和可回滚依据。Jenkins 不是第一版主线，因为题目重点是压缩传统 CI/CD；需要企业化接入时，可以让 Jenkins 消费 Gitea push/webhook 继续执行更重的流水线。
