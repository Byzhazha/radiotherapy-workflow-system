# 放疗流程管理系统

这是一个 Windows 桌面端放疗流程管理系统，主线能力覆盖患者流程、设备排程、计划质控、随访管理和审计留痕。系统内置 AI 定制助手，面向开发人员和实施工程师，用于根据医院的定制化需求生成受控变更计划，在沙箱中预览配置差异，完成业务安全检查后审批激活。

## 核心能力

- 患者流程：患者登记、放疗会诊、CT 定位、靶区勾画、计划设计、物理审核、主任审核、治疗排程、首次治疗、随访。
- 计划质控：处方剂量、分次、DVH 曲线、PTV 覆盖、Gamma 通过率、危及器官约束和治疗阻断规则。
- 设备排程：CT 模拟定位机、直线加速器、TOMO 设备的预约状态和治疗任务。
- 随访管理：治疗后复诊、毒性分级、疗效评价和下次随访计划。
- AI 定制助手：自然语言输入医院需求后，后端调用大模型生成受控变更计划，覆盖流程节点、表单字段、业务规则、页面布局、报表模板和权限矩阵。
- 沙箱预览与审批：AI 变更先生成配置预览和差异，检查通过后由负责人审批激活。
- 配置版本回滚：每次激活都会保存配置版本，可恢复到已验证版本。
- 审计留痕：患者流程推进、定制变更、发布审批都会写入审计日志。
- Gitea 工程留痕：AI 每次定制任务会生成交付清单、配置前后快照和配置差异并提交到 Gitea 仓库。

## 架构

```text
Electron 桌面客户端
  └─ React 临床工作站界面
      └─ 本机/远端 Express API
          ├─ 放疗流程业务模型
          ├─ 患者、排程、质控、随访 API
          ├─ AI 变更计划生成与校验
          ├─ 沙箱预览、业务安全检查与审批激活
          ├─ 配置版本回滚
          ├─ Gitea 交付清单、配置快照和差异提交
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

AI 定制任务完成后会在仓库的 `ai-deliveries/<job-id>/` 目录生成 `manifest.json`、`config-before.json`、`config-after.json` 和 `config-diff.json`。Gitea Actions 工作流位于 `.gitea/workflows/verify.yml`，用于 push 后执行测试和前端构建。Jenkins 可以作为企业环境里的外部流水线执行器接入，当前主链路由系统后端完成沙箱预览、业务安全检查、审批激活、回滚和 Gitea 留痕。

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
- AI 定制的沙箱预览、审批激活和配置版本回滚。
- 页面布局、报表模板、权限矩阵等配置化定制对象。

## 打包

```bash
npm run package
```

Windows 桌面端输出到 `release/放疗流程管理系统-win-x64/`。打开 `放疗流程管理系统.exe` 即可运行。生成新产物时会清理旧构建目录，避免误用历史版本。

## 面试讲法

这个项目回答的是“开发人员如何基于现有放疗流程管理软件，利用 AI 完成客户定制化需求”。主系统先解决放疗业务闭环，把高频变化点抽象成版本化配置：流程节点、表单字段、规则、页面布局、报表模板和权限矩阵。AI 定制助手通过后端 OpenAI 兼容接口调用大模型，读取现有配置，把医院需求转成受约束的变更计划，在沙箱中生成配置差异并运行安全检查，审批后激活为新的配置版本。

这个方案把传统“改代码、开发自测、测试环境、生产发版”的高频小定制，压缩为“AI 生成配置版本、系统自动验证、负责人审批激活、必要时回滚”。Gitea 用来证明每次 AI 修改都有需求、计划、测试结果、配置前后快照和 diff。Jenkins 可以作为企业环境里的外部流水线执行器接入；当前主链路优先展示配置化快速交付。
