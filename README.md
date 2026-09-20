# Finto · 可追溯的项目交付工具

Finto 把分散、会变化的项目资料整理成带来源依据的交付草稿。系统先冻结本次任务允许使用的资料，生成候选，再由负责人审查；候选不会绕过人工确认直接改写正式交付物。

本仓库只发布 Finto 的可运行产品实现、自动化测试、发布配置和经过整理的产品交付文档；个人学习记录、练习数据和无关项目不进入版本库。

## 一条完整业务链

```text
创建项目与当前周期
→ 添加项目资料并选择本次授权范围
→ 选择零 Token 本地解析或 AI 模式运行任务
→ 检查候选字段、来源依据和待确认信息
→ 负责人原样接受、修改后接受或拒绝
→ 创建正式草稿 Revision
→ 负责人确认后进入后续制作与验收
```

关键边界：

- AgentJob 冻结动作、指令、授权来源和禁止范围；执行时不能自行扩权。
- 零 Token 模式只解析资料中的明确字段，不调用模型、不猜测缺失内容。
- AI 模式调用设置页配置的 OpenAI-compatible 服务。
- 候选必须经过来源和结构校验，并进入人工审查。
- 正式 `Deliverable` / `Revision` 只在负责人接受或修改后创建。
- 被拒绝或失败的候选保留审计记录，不污染正式业务表。

## 最快启动方式（Windows）

1. 安装 Python 3；本项目运行时不依赖第三方 Python 包。
2. 双击根目录的 `Finto.cmd`。
3. 应用会从 `127.0.0.1:8765` 开始尝试可用端口，并打开独立窗口。
4. 首次使用时，从“项目总览”创建项目，再到“资料库”添加本次项目资料。

桌面模式的数据保存在 `%LOCALAPPDATA%\Finto`。第一次启动时，如果检测到旧版应用数据，会先完整复制到新目录并转换旧备份文件名；旧目录不会被删除。若没有旧版数据，则会复制项目目录中已有的知识库数据，同样不删除原文件。

## 开发启动

在项目根目录执行：

```powershell
python server.py
```

然后打开 <http://127.0.0.1:8765>。

如需指定端口或独立测试数据目录：

```powershell
python server.py --host 127.0.0.1 --port 8766 --data-dir .tmp\finto-manual-test
```

停止服务：回到启动它的 PowerShell 窗口，按 `Ctrl+C`。

## 判断系统是否正常

浏览器访问：

```text
http://127.0.0.1:8765/api/health
```

正常响应应包含：

```json
{
  "ok": true,
  "product": "Finto",
  "version": "当前应用版本",
  "schema_version": 10
}
```

如果桌面启动器发现端口已被兼容版本占用，会直接复用该实例；若端口被其他程序占用，会继续尝试至 `8780`。

## 两种运行方式

### 零 Token 本地解析（默认推荐）

适合字段明确的项目资料，例如“阶段成果”“交付时间”“验收要求”。程序在本地按确定性规则提取，仍会生成来源依据并进入人工审查。

### AI 模式

适合表达不统一、需要语义理解的资料。在“设置”中填写：

- API 地址（OpenAI-compatible `v1` 地址）；
- 模型名称；
- API Key。

配置保存在本地 SQLite 中，不通过 `.env` 读取。因此当前版本没有必须填写的 `.env` 文件，也不要把真实密钥提交到仓库。

## 测试

运行核心项目交付回归测试：

```powershell
python -m unittest tests.test_project_deliverable -v
```

运行全部自动化测试：

```powershell
python -m unittest discover -s tests -v
```

## 数据与审计位置

- 桌面模式数据库：`%LOCALAPPDATA%\Finto\data\knowledge.db`
- 桌面模式资料正文：`%LOCALAPPDATA%\Finto\content\`
- 桌面模式备份：`%LOCALAPPDATA%\Finto\backups\`
- 桌面模式错误日志：`%LOCALAPPDATA%\Finto\logs\finto-error.log`
- 开发模式数据库：`data\knowledge.db`
- 开发模式资料正文：`content\`
- 开发模式错误日志：`logs\finto-error.log`

数据库升级由应用启动时自动执行。正式使用前应先通过应用的备份功能保留数据库和 Markdown 资料。

遇到启动、运行任务或人工审查故障时，按 [故障定位SOP](product-docs/Finto故障定位SOP.md) 检查。500响应中的`request_id`可与错误日志逐行对应；日志不记录请求正文、资料内容、API Key或异常原文。

## 成熟交付文档

- [项目交付产品蓝图](product-docs/Finto项目交付产品蓝图.md)
- [项目交付首页原型](product-docs/Finto项目交付首页原型.html)
- [一页 POC 方案](product-docs/Finto一页POC方案.md)
- [故障定位 SOP](product-docs/Finto故障定位SOP.md)
- [专业 Pushback](product-docs/Finto专业Pushback.md)

## 当前已实现

- Project / Cycle 与当前工作周期；
- Deliverable / Revision 的版本历史和人工状态流转；
- AgentJob 任务合同与任务级来源授权快照；
- 零 Token 确定性解析和 OpenAI-compatible AI 调用；
- 字段级证据、来源定位和待确认信息；
- 人工接受、修改后接受、拒绝及候选历史；
- 未授权、已停用或被删除来源的拒绝边界；
- 失败运行、候选决定和正式版本的审计记录；
- 健康检查、桌面启动和本地备份。

## 已知限制

- 当前是单机本地工具，没有账号、多人并发权限和远程部署能力。
- 负责人角色目前是业务字段与流程责任，不是登录身份鉴权。
- 资料与交付物的项目关联仍在逐步完善，部分旧资料会显示为未按项目关联。
- 零 Token 模式只适合明确字段；复杂语义应切换 AI 模式并人工核验。
- AI 服务的可用性、费用和输出质量由所配置的第三方服务决定。

## Windows 安装包（可选）

构建命令：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\packaging\Build-Windows.ps1 -Installer
```

输出位于 `dist\`。安装版支持开始菜单入口和覆盖升级；升级或卸载不会主动删除 `%LOCALAPPDATA%\Finto` 中的数据。
