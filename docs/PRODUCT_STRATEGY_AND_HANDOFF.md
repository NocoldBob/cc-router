# CC Router 产品定位与维护交接

> 面向后续维护者和 AI 编程助手。本文记录产品边界、竞争定位、可信主张和路线优先级。
>
> 竞争信息最后核对：2026-08-18。涉及第三方产品的描述在公开发布前应重新核对官方资料。

## 1. 一句话定位

CC Router 是一个面向 Windows 的 Claude Code 路由启动器：不运行本地 API 代理，通过进程级环境变量为不同 Claude Code 会话隔离 DeepSeek、Kimi 等 Anthropic 兼容 Provider，并使用 Windows Credential Manager 保存 API Key。

推荐对外表述：

> 不做代理，不改 Claude 配置，让每个 Claude Code 会话使用自己的 API 路由。

英文短句：

> Your keys stay in Windows. Your prompts never pass through the router.

## 2. 当前产品边界

### 已实现

- Windows Tauri 2 桌面应用。
- 管理 DeepSeek、Kimi Global、Kimi Code K3/K2.7 Code 和自定义 Anthropic 兼容 Provider。
- API Key 保存到 Windows Credential Manager，前端只获取“是否已配置”。
- 向新启动的 Claude Code 子进程注入路由，不修改全局环境。
- 可选地写入 Windows 用户环境，供新终端和重启后的 VS Code Claude Code 插件读取。
- 提供 Windows VS Code Companion beta，为每个本地工作区选择 Provider，并通过
  Claude Code 的受支持进程 wrapper 启动隔离的新会话。
- VS Code Companion 的 VSIX 内置同版本桌面安装器，首次启用时经用户确认后为当前
  Windows 用户安装；不要求用户预先单独下载桌面端。
- 系统写入前备份旧路由，支持一次回滚。
- 同步管理 11 个 Claude Code 路由、模型、子代理、effort 和上下文变量。
- 生成脱敏的 PowerShell 和 `settings.json` 备用配置。
- Provider 导入导出不包含 API Key。
- 启动前检查 CLI、凭据、工作目录和路由配置，并仅按名称提示将被隔离的环境变量。
- 内置 Provider 模板显示最后验证日期和官方文档入口。
- Kimi Code 提供 K3 1M、K3 256K、K2.7 Code 三种原子切换方案，避免模型角色与上下文窗口
  只修改一部分；切换仅对新会话生效。
- 不运行代理，不转发、读取或记录 prompt、代码、模型回答和 Token 明细。

### 当前未实现

- macOS 和 Linux。
- Codex、Gemini CLI、OpenCode 等其他工具的配置管理。
- Anthropic Messages 与 OpenAI Responses/Chat Completions 的协议转换。
- 本地代理、热切换、自动故障转移、熔断和健康检查。
- 用量、费用和请求日志统计。
- MCP、Skills、Prompt 和会话管理。
- 云同步、系统托盘、自动更新和商业代码签名。
- 从 UI 直接启动隔离环境下的 VS Code 工作区。

维护者不得把“未实现”功能写进现有功能列表。

## 3. 信任模型

推荐模式的数据路径：

```text
Windows Credential Manager
          |
          | Rust 后端读取 Key
          v
CC Router 启动 Claude Code 子进程
          |
          | 子进程环境变量
          v
Claude Code --------------------> Provider 官方 Anthropic 兼容接口
```

CC Router 不在 HTTP 请求路径中。应用关闭后，已经启动的 Claude Code 仍保留自己的进程环境。

### 可以公开声明

- Key 不写入 Provider JSON、`localStorage` 或项目文件。
- Key 不返回给 WebView 前端。
- Key 不出现在应用生成的状态输出和 Provider 导出文件中。
- 进程隔离模式不修改 Windows 用户环境或 Claude Code 配置文件。
- 应用不经过模型请求，因此无法记录通过该路径发送的 prompt、代码和回答。

### 必须附带限制

- “设为 Windows 默认”会把 Key 写入用户级 `ANTHROPIC_AUTH_TOKEN`，这是明文用户环境变量；UI 和文档必须继续明确提示。
- 同一 Windows 用户权限下的恶意进程仍可能读取目标进程环境或调用系统凭据接口；Credential Manager 不是对本机同权限恶意软件的绝对隔离。
- 软件未代码签名时，Windows 可能显示未知发布者或 SmartScreen 提示。
- VS Code Companion 不得无提示安装桌面程序；首次安装必须明确征得用户确认，并
  保留已有安装自动发现和手动选择程序路径的恢复入口。
- Provider 最终会接收用户发送给模型的数据；“不上传数据”仅指 CC Router 自身没有项目运营的后端和额外上传行为。

## 4. 与 CC Switch 的主要差异

CC Switch 是综合型 AI 工具控制平台。其官方 README 在调研日期列出 8 类工具、50+ Provider、代理与故障转移、用量统计、MCP/Skills、云同步、系统托盘和跨平台支持。

| 维度 | CC Router | CC Switch |
| --- | --- | --- |
| 核心定位 | Windows Claude Code 隔离启动器 | 多工具综合管理平台 |
| 路由方式 | 直接注入进程环境 | 配置切换，可选本地代理接管 |
| 请求路径 | 不经过 CC Router | 代理模式经过本地路由服务 |
| 协议转换 | 不支持 | 支持多种协议转换 |
| Provider 并行 | 每个新进程可使用独立 Provider | 主要围绕激活当前 Provider 和热切换 |
| Key 存储 | Windows Credential Manager | Provider 数据由本地应用数据和 SQLite 管理 |
| 配置修改 | 推荐模式不改全局配置 | 管理各 CLI 的 live 配置或本地路由地址 |
| 范围 | Claude Code、Anthropic 兼容接口 | 多工具、多协议、大量 Provider |
| 平台 | Windows | Windows、macOS、Linux |
| 学习成本 | 单页、低配置面 | 能力更广，配置面更大 |

CC Switch 的协议转换和综合管理能力明显更强。CC Router 不应宣传为“更强的 CC Switch”或“CC Switch 替代品”。

## 5. 可持续的差异化亮点

### 5.1 进程级隔离和并行会话

这是当前最有价值的差异点。用户可以同时运行：

- 项目 A：DeepSeek Claude Code。
- 项目 B：Kimi K3 Claude Code。
- 现有 Codex、终端和 VS Code 窗口保持不变。

产品语言应使用“为每个工作会话选择 Provider”，而不只是“切换当前 Provider”。

### 5.2 无代理直连

对于已经提供 Anthropic 兼容接口的 Provider，不增加本地端口、协议转换、请求日志和代理故障点。它不能替代协议转换，但更容易理解、审计和排错。

### 5.3 Windows 原生凭据边界

Key 由 Credential Manager 保存并由 Rust 后端按需读取。配置导出、UI 状态和手动命令默认不包含真实 Key。

### 5.4 修改行为透明且可逆

用户可以看到 Base URL、模型映射、上下文和 effort。系统级写入必须经过确认，写入前保存备份，并提供清除与回滚。

### 5.5 官方直连模板

建议只内置能够链接到官方文档的 Provider 模板：

- 不默认加入社区中转站。
- 不在模板中加入推广或充值链接。
- 标注模板最后验证日期。
- 模型和环境变量更新后及时发布模板修订。

## 6. 目标用户

### 核心用户

- 主要使用 Windows、Claude Code 或 VS Code Claude Code 插件。
- 只管理少量官方 API Key，例如 DeepSeek 和 Kimi。
- 不需要跨协议代理和完整 AI 工具控制平台。
- 重视 Key 存放位置、配置修改范围和请求路径透明度。
- 希望不同项目同时使用不同 Provider。

### 不适合的用户

- 需要把 OpenAI Responses 或 Chat Completions 转换成 Anthropic Messages。
- 需要多个 AI CLI、MCP、Skills、云同步和用量看板的一站式管理。
- 需要 macOS/Linux 或企业多用户集中策略。
- 需要自动故障转移和长期常驻网关。

对这些用户应坦率推荐更完整的工具，而不是扩大当前项目承诺。

## 7. 对外表达原则

### 推荐表达

- 无代理、进程隔离、Windows 原生凭据管理。
- 同时启动多个不同 Provider 的 Claude Code 会话。
- 只管理路由，不接触模型请求内容。
- 系统修改可见、确认后执行、可以回滚。
- 小而专注，适合 DeepSeek/Kimi 官方直连。

### 避免表达

- “绝对安全”或“Key 永远不可能泄露”。
- “不上传任何数据”，而不解释 Provider 仍会收到模型请求。
- “CC Switch 不安全”或直接使用竞争项目的未决 Issue 作为宣传材料。
- “支持所有 Claude Code Provider”，因为当前只适合 Anthropic 兼容接口。
- “热切换现有会话”，当前路由只对新启动进程生效。
- 暗示与 Anthropic、DeepSeek 或 Moonshot AI 存在官方隶属关系。

## 8. 路线优先级

### P0：公开测试版之前

- 添加 `LICENSE`、`SECURITY.md`、商标与非隶属声明。
- 在无 Node/Rust 开发环境的干净 Windows 电脑完成安装、运行和卸载测试。
- 建立 GitHub Actions：前端 lint/test/build、Rust fmt/test/check、Windows bundle。
- 使用 GitHub Release 发布安装包和 SHA-256。
- 增加应用图标，并明确未签名安装包的 SmartScreen 行为。
- 给内置模板增加“最后验证日期”。

### P1：强化独有价值

- 一键使用指定 Provider 打开 VS Code 工作区。
- 显示由 CC Router 启动的隔离会话及其 Provider，但不读取会话内容。
- 增加 endpoint、鉴权和模型可用性测试，测试请求不得包含项目内容。
- 增加环境冲突诊断和脱敏诊断报告。
- 增加系统托盘中的“用 Provider 打开终端/项目”。
- 增加仅允许官方 HTTPS endpoint 的可选安全模式。

### P2：谨慎扩展

- Windows ARM64。
- Provider 模板签名或可验证更新机制。
- 多语言 UI。
- 自动更新和代码签名。

除非产品定位正式改变，否则不要优先开发协议转换代理、用量日志、MCP/Skills 或云同步。这些功能会扩大请求面、数据面和维护面，并削弱当前差异。

## 9. 开源发布建议

首个公开版本建议使用 `v0.1.0-beta.1`，不要标为稳定生产版。README 第一屏应直接说明：

1. Windows only。
2. Claude Code only。
3. Anthropic-compatible providers only。
4. 推荐进程隔离模式。
5. Key 保存在 Credential Manager。
6. 应用不运行 API 代理。

建议的 README 标题副文案：

> A no-proxy, process-isolated Claude Code provider launcher for Windows.

## 10. 当前代码入口

- `src/App.tsx`：Provider 编辑、凭据状态和路由控制 UI。
- `src/defaultProviders.ts`：DeepSeek/Kimi 内置模板。
- `src/nativeRouter.ts`：Tauri IPC 数据边界。
- `src/routerCommands.ts`：脱敏手动命令生成。
- `src-tauri/src/credentials.rs`：Windows Credential Manager。
- `src-tauri/src/system_env.rs`：用户环境变量读写。
- `src-tauri/src/commands.rs`：进程启动、系统应用、清除与回滚。
- `src-tauri/src/backup.rs`：不含明文 Key 的回滚备份。
- `src-tauri/src/models.rs`：路由校验和 11 个环境变量定义。
- `src-tauri/src/provider_store.rs`：桌面端与 VS Code Companion 共享的无密钥配置。
- `src-tauri/src/bin/cc-router-helper.rs`：Credential Manager 支持的 Claude wrapper。
- `vscode-extension/src/extension.ts`：VS Code 状态栏、工作区选择与 Claude Code 集成。

接手修改前，至少运行：

```powershell
pnpm lint
pnpm test
pnpm build
cd src-tauri
cargo fmt --all -- --check
cargo test
cargo check
```

涉及凭据、进程环境、PowerShell 或备份格式的改动必须增加对应测试。验收时不得使用真实 API Key，也不得在没有明确确认的情况下修改维护者的 Windows 用户环境。

## 11. 对比资料来源

- CC Switch 官方仓库与功能列表：<https://github.com/farion1231/cc-switch>
- CC Switch Claude/Responses 本地路由说明：<https://github.com/farion1231/cc-switch/blob/main/docs/guides/claude-codex-routing-guide-en.md>
- DeepSeek 接入 Claude Code：<https://api-docs.deepseek.com/zh-cn/guides/agent_integrations/claude_code>
- Kimi Code 接入 Claude Code：<https://www.kimi.com/code/docs/third-party-tools/claude-code.html>

第三方功能会变化。后续维护者引用比较结论时，应注明核对日期并优先使用官方仓库和官方文档。
