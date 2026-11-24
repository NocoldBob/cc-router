# CC Router 路由助手 / CC Router Companion

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/NocoldBob.cc-router-companion?label=VS%20Code%20Marketplace&color=0078d4)](https://marketplace.visualstudio.com/items?itemName=NocoldBob.cc-router-companion)
[![Marketplace installs](https://img.shields.io/visual-studio-marketplace/i/NocoldBob.cc-router-companion?label=installs&color=2f6f50)](https://marketplace.visualstudio.com/items?itemName=NocoldBob.cc-router-companion)

为每个本地 Windows 或 Ubuntu VS Code 工作区选择独立的 Claude Code Provider。内置
DeepSeek、Kimi、GLM 智谱、Qwen、MiniMax、本地/局域网部署模板，也支持自定义
Anthropic 兼容接口。**自 1.3.0 起扩展自包含，无需安装桌面端。**

> 无代理，不改 Claude 配置。API Key 保留在系统凭据存储中，仅在
> 启动新的 Claude Code 子进程时注入。

## 中文说明

### 它能做什么

- 内置完整 Provider 管理界面（命令 **CC Router：管理 Provider**）：添加/编辑
  Provider、切换官方预设、保存 API Key 到系统凭据库、探测连接、导出脱敏诊断。
- 在 VS Code 侧边栏直接查看并切换当前工作区的 Provider。
- 一键启动使用所选路由的官方 Claude Code 新会话，或打开注入路由的隔离终端。
- 可选地把某个 Provider 设为 Windows 默认路由（写入前自动备份，可回滚）。
- 不同 VS Code 工作区可以同时使用不同 Provider。
- 显示模型、Endpoint 和凭据是否已配置，但绝不读取或显示 API Key。

### 快速开始

1. 从 [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=NocoldBob.cc-router-companion)
   安装扩展（会自动带上 Anthropic 官方 Claude Code 扩展）。
2. 执行命令 **CC Router：管理 Provider**，选择内置模板或新建 Provider，填入 API Key
   后先点击“保存凭据”，再点击“保存配置”。Key 只写入 Windows Credential Manager /
   Linux Secret Service；Provider 参数由扩展保存。
3. 在 VS Code 左侧活动栏打开 **CC Router**，点击一个 Provider 绑定当前工作区。
4. 点击 **启动 Claude Code 新会话**，用 `/status` 确认路由生效。

不需要安装任何其他组件。如果电脑上已安装 CC Router 桌面端，首次激活会导入其已有的
Provider 目录；桌面端可以继续独立使用，但无需升级或卸载，也不再是插件运行的前提。
旧版用户加载新模板及处理旧管理面板缓存的步骤见 [1.3.0 升级说明](CHANGELOG.md#130)。

常用命令（`Ctrl+Shift+P`）：

- `CC Router：管理 Provider`
- `CC Router：为工作区选择 Provider`
- `CC Router：启动 Claude Code 新会话`
- `CC Router：保存 API Key 到凭据库`

只有新启动的 Claude Code 会话使用所选路由，已有会话不会热切换。

[完整中文图文指南](https://github.com/NocoldBob/cc-router/blob/main/docs/VSCODE_COMPANION_GUIDE.md)

当前支持本地 Windows 10/11 x64 与 Ubuntu Desktop 22.04/24.04 x64 工作区，暂不支持
WSL、SSH 和 Dev Containers。

### 安全边界

扩展通过 Claude Code 官方支持的进程 wrapper 启动会话。内置原生 helper 仅在启动
Claude Code 时从系统凭据库读取所选 Provider 的 Key，并注入该子进程环境；Key 不写入
VS Code 设置、工作区文件、日志或扩展状态，webview 管理界面也只能看到“是否已配置”。
CC Router 不运行 HTTP 代理，不接触模型流量。

---

## English

CC Router Companion selects a process-isolated, Anthropic-compatible Provider for each local
Windows or Ubuntu VS Code workspace. **Since 1.3.0 the extension is self-contained** — no
desktop app required.

### Features

- Full Provider management UI inside VS Code (**CC Router: Manage Providers**): built-in
  official templates (DeepSeek, Kimi, GLM, Qwen, MiniMax, local/LAN), atomic model presets,
  API keys stored in the OS credential store, connection probes, isolated terminals, the
  optional Windows default route with backup/rollback, and redacted diagnostics export.
- View and switch the current workspace Provider from a native VS Code sidebar.
- Start a new official Claude Code session with the selected route in one click.
- Use different Providers in multiple VS Code workspaces at the same time.
- See model, endpoint and credential status without exposing the API Key.

### Quick start

1. Install the extension from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=NocoldBob.cc-router-companion).
   The official Anthropic Claude Code extension is installed automatically as a dependency.
2. Run **CC Router: Manage Providers**, pick a built-in template or create a Provider, paste
   the API Key, click **Save Credential**, then click **Save Configuration**. Keys are written
   only to Windows Credential Manager or Linux Secret Service; Provider settings are stored by
   the extension.
3. Open **CC Router** from the Activity Bar and click a Provider to bind the workspace.
4. Click **Start New Claude Code Session** and confirm the route with `/status`.

No other components are required. An existing CC Router desktop installation keeps working;
its Provider catalog is imported automatically. The desktop app remains an optional,
independently maintained product.

Only new Claude Code sessions use the selected route. Existing sessions are not hot-switched.

### Security boundary

The extension configures Claude Code's supported process-wrapper setting. Its bundled native
helper reads the selected credential from Windows Credential Manager or Linux Secret Service
only when launching Claude Code, then injects it into that child process. Keys are never
written to VS Code settings, workspace files, logs, or extension state, and the management
webview can only see whether a key exists. CC Router does not run an HTTP proxy and does not
inspect model traffic.

Remote workspaces including WSL, SSH and Dev Containers are not supported.

This project is not affiliated with Anthropic, DeepSeek, Moonshot AI, Microsoft, or VS Code.
