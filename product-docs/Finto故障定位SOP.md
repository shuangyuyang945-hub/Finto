# Finto 故障定位 SOP

## 目标

用最短路径回答三个问题：

1. 应用是否启动；
2. 这是正常业务拒绝，还是程序异常；
3. 出现程序异常时，哪条日志与用户看到的错误对应。

本SOP适用于当前单机本地版本，不包含远程服务器、Docker或多人账号排障。

## 第一步：确认应用存活

访问：

```text
http://127.0.0.1:8765/api/health
```

如果桌面启动器选择了其他端口，依次检查8766至8780。正常响应包含：

```json
{
  "ok": true,
  "product": "Finto",
  "version": "当前应用版本",
  "schema_version": 10
}
```

- 能返回：继续第二步；
- 不能返回：确认是否已启动`Finto.cmd`，或在项目根目录运行`python server.py`观察启动信息；
- 端口被占用：桌面版会尝试后续端口；开发启动可显式使用`--port 8766`。

## 第二步：先看HTTP状态，不要把所有拒绝都当故障

| HTTP | 含义 | 第一动作 |
|---|---|---|
| 400 | 请求格式或必填字段不合法 | 检查页面输入和请求字段 |
| 403 | 权限不足，或引用未授权、停用、删除的来源 | 检查本次AgentJob冻结的授权来源 |
| 404 | Project、AgentJob或接口不存在 | 检查对象ID、页面是否来自当前版本 |
| 409 | 请求与当前业务状态冲突 | 检查Project、Revision或AgentJob当前状态 |
| 422 | 模型输出能解析，但不符合结果合同 | 查看失败候选和字段级校验原因 |
| 502 | 外部AI服务调用失败 | 检查API地址、模型、密钥和服务可用性；不要盲目重复付费调用 |
| 500 | 未预期的程序异常 | 记录页面显示的`request_id`，进入第三步 |

400、403、404、409、422和502通常是系统已识别并明确返回的业务或外部依赖失败，不等于服务崩溃。

## 第三步：用错误编号定位500

日志位置：

- 桌面模式：`%LOCALAPPDATA%\Finto\logs\finto-error.log`
- 开发模式：项目根目录`logs\finto-error.log`
- 使用`--data-dir`时：指定目录下`logs\finto-error.log`

每行是一条JSON，例如：

```json
{"timestamp":"2026-09-19T17:30:00+08:00","event":"unexpected_request_error","request_id":"a1b2c3d4e5f6","method":"POST","path":"/api/example","error_type":"RuntimeError"}
```

用页面上的`request_id`搜索日志。基础日志只记录：

- 时间；
- 错误编号；
- HTTP方法；
- 请求路径；
- 异常类型。

它不会记录请求正文、项目资料、API Key或异常原文。不要为了排障把密钥、完整资料或数据库直接粘贴到公开Issue。

## 第四步：按故障位置止损

### Agent任务运行失败

1. 先确认是零Token还是AI模式；
2. 检查AgentJob当前状态，避免对已经运行的Job重复调用；
3. 检查冻结的来源是否仍可用、`ai_access`是否为1；
4. AI模式再检查API地址、模型名、密钥和服务余额；
5. 不要手工把失败Job改成成功；保留失败审计，修正后创建受控的新任务。

### 候选被拒绝

1. 查看`used_source_ids`、字段级`evidence_source_ids`和`unknowns.checked_source_ids`；
2. 与AgentJob的`allowed_source_ids`比较；
3. 查看来源是否在任务创建后被停用或删除；
4. 保留rejected候选与原因，确认Deliverable/Revision没有写入。

### 正式草稿或状态流转失败

1. 确认Project仍为active；
2. 确认Revision当前状态允许本次流转；
3. 确认操作者符合负责人或执行负责人边界；
4. 不直接修改旧Revision；范围、期限或验收标准变化时创建新Revision。

## 第五步：提交最小故障证据

交给维护者时只提供：

```text
发生时间：
页面/动作：
HTTP状态：
request_id（仅500需要）：
是否零Token或AI模式：
对象ID（Project/Job/Revision，按需）：
可稳定复现的最短步骤：
预期结果：
实际结果：
```

不要提交API Key、完整数据库、未去标识化资料或包含个人信息的截图。

## 恢复完成标准

- health正常；
- 原失败路径按预期成功，或返回正确的4xx/502拒绝；
- 相关自动化测试通过；
- 正式业务表没有因失败请求产生意外写入；
- 失败审计仍可追溯，没有通过删记录伪造恢复。
