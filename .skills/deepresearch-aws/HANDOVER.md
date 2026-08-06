# DeepResearch-AWS 技能交接文档

## 一、概述

DeepResearch-AWS 是一个 Claude Code skill，通过 Google Gemini Deep Research API 执行深度研究任务。用户提出研究需求后，skill 会增强 query → 后台启动研究脚本 → 循环监控进度 → 返回最终报告。

整体耗时：研究计划生成约 1-2 分钟，深度研究执行约 10-30 分钟。

---

## 二、文件结构

```
deepresearch-aws/
├── SKILL.md                    # Skill 指令文件（agent 执行逻辑的全部依据）
└── scripts/
    ├── deepresearch.py         # 研究脚本（后台运行，调用 Gemini API）
    └── monitor.py              # 监控脚本（单次检查日志，立即退出）
```

---

## 三、核心工作流

### 3.1 deepresearch.py

**两步 API 调用**：

1. **Step 1 — 创建会话 + 生成研究计划**
   - 发送用户 query 到 Lambda gateway，消费完整 SSE 流
   - 从 chunk 中提取 `session` 标识
   - 提取 `thought` 类型文本作为研究计划

2. **Step 2 — 执行深度研究**
   - 使用获取到的 session，发送 `"Start Research"` 触发实际研究
   - 流式接收研究过程：`RESEARCH_PLAN` → `RESEARCH_QUESTION` → `RESEARCH_ANSWER` → `RESEARCH_REPORT`
   - 最终报告从 `RESEARCH_REPORT` 类型的 chunk 中拼接

**关键日志标记**（供 monitor.py 识别）：
- `[START]` — 任务启动
- `[SESSION]` — 获取到会话
- `[PLAN]` — 研究计划
- `[QUESTION]` — 正在研究的子问题
- `[ANSWER]` — 子问题完成
- `[REPORT]` — 收到报告内容
- `[DONE]` — 任务完成
- `[ERROR]` — 任务失败

**认证方式**：
- 通过环境变量 `INTEGRATIONS_API_KEY` 获取 token
- 以 `X-Gateway-Authorization: Bearer <token>` 头发送到 Lambda URL

**API 端点**：
```
https://app-dglnmr1k1czl-api-zYm4X4jwv0bL.gateway.appmedo.com/
```

### 3.2 monitor.py

**单次检查模式**：每次调用只读取日志新增内容（通过 `.pos` 文件记录读取位置），打印后立即退出。

**退出码**：
| Code | 含义 |
|------|------|
| 0 | 任务完成（日志中包含 `[DONE]`） |
| 1 | 任务失败（日志中包含 `[ERROR]`） |
| 2 | 仍在运行，需继续监控 |
| 3 | 进程已退出但无终止标记（异常） |

### 3.3 SKILL.md 执行流程

Agent 按以下步骤执行：
1. **评估输入** — 检查是否缺少研究目的/时间范围/输出格式，缺太多则追问
2. **增强 Query** — 改写为流畅的研究简报 + 加语言前缀（如 `深度研究以下内容：`）
3. **启动 + 监控** — 后台启动 deepresearch.py，循环调用 monitor.py 检查进度
4. **读取结果** — 完成后 cat 结果文件，原样输出给用户

---

## 四、已知问题与待处理项

### 4.1 Bash 超时问题（当前最大痛点）

**现象**：agent 在监控循环中执行 `sleep N && python3 monitor.py ...`，当 sleep 时间接近或超过 120 秒时，Bash 工具默认超时（120s）会强制中断命令。agent 随后误判为需要重新执行，导致流程断裂。

**根本原因**：SKILL.md 中 Step 3b 要求 sleep 从 120s 开始递增（120, 150, 180...），而 Bash 工具默认 timeout 只有 120s。

**矛盾点**：
- sleep 必须递增（避免连续相同命令触发 stuck-in-loop 检测）
- 但超过 120s 就会触发 Bash 超时

**可行解决方案**：
1. 递增但在 SKILL.md 中明确要求设置 Bash `timeout` 参数为 `(sleep_seconds + 60) * 1000` 毫秒
2. 把 sleep 起始值改小（如 30s 起步，每次 +5s），递增但永远不超过 110s
3. 使用 `run_in_background` 模式执行 sleep + monitor，不受 120s 限制

### 4.2 DEBUG_CHUNK 打印（临时代码，需删除）

`deepresearch.py` 第 87 行有一行调试输出：
```python
print(f"[DEBUG_CHUNK] {debug_str[:500]}", flush=True)
```
这是测试时用于观察 API chunk 结构的，确认不再需要后应删除。如果保留会导致后台进程输出大量调试信息。

### 4.3 RESEARCH_ANSWER 过滤（已永久保留）

`stream_research()` 中 `RESEARCH_ANSWER` 类型内容只写日志不写入最终结果文件——这是刻意为之，避免中间子问题答案混入最终报告。

---

## 五、运行环境

- **平台**：AWS Lambda + Claude Code（在 `/workspace/app-*/skills/deepresearch-aws` 路径下执行）
- **依赖**：Python 3 + `requests` 库（标准库外唯一依赖）
- **认证**：`INTEGRATIONS_API_KEY` 环境变量由平台自动注入
- **输出**：结果写入 `/tmp/dr_aws_XXXXXX.md`（临时文件）

---

## 六、与 deepresearch（非 AWS 版本）的区别

| 维度 | deepresearch-aws | deepresearch |
|------|-----------------|--------------|
| API 后端 | Google Gemini（通过 AWS Lambda 网关） | 另一套 API（有会话创建 + 大纲确认流程） |
| 监控间隔 | 120s 起递增 30s | 固定 30s |
| 结果格式 | Markdown 文件 | JSON（含 md/html 下载链接） |
| SKILL 语言 | 英文 | 中文 |
| 流程复杂度 | 两步（创建会话 + Start Research） | 四步（创建会话 + 初始查询 + 提取大纲 + 确认大纲） |

---

## 七、调试建议

1. **查看原始 API 返回**：暂时保留 DEBUG_CHUNK 行，启动命令改为：
   ```bash
   python3 scripts/deepresearch.py "query" --log-file /tmp/dr.log --output-file /tmp/dr.md > /tmp/dr_debug.txt 2>&1 &
   ```
   然后查看 `/tmp/dr_debug.txt` 获取完整 chunk 流。

2. **本地测试**：需设置 `INTEGRATIONS_API_KEY` 环境变量，然后直接运行：
   ```bash
   export INTEGRATIONS_API_KEY="your-key"
   python3 scripts/deepresearch.py "测试query" --log-file /tmp/test.log --output-file /tmp/test.md
   ```

3. **监控脚本单独测试**：
   ```bash
   python3 scripts/monitor.py --log-file /tmp/test.log --pid 12345
   echo $?  # 查看退出码
   ```

---

## 八、打包部署

项目根目录有 `deepresearch-aws.zip`，更新后重新打包：
```bash
cd /Users/zhangkairan/skills/miaoda
zip -r deepresearch-aws.zip deepresearch-aws/ -x "*.DS_Store" -x "*.pos"
```
部署到平台时上传该 zip 即可。
