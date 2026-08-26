# CC Router 路由助手 / CC Router Companion

[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/NocoldBob.cc-router-companion?label=VS%20Code%20Marketplace&color=0078d4)](https://marketplace.visualstudio.com/items?itemName=NocoldBob.cc-router-companion)
[![Marketplace installs](https://img.shields.io/visual-studio-marketplace/i/NocoldBob.cc-router-companion?label=installs&color=2f6f50)](https://marketplace.visualstudio.com/items?itemName=NocoldBob.cc-router-companion)

为每个本地 Windows VS Code 工作区选择独立的 Claude Code Provider。支持 CC Router
桌面端中配置的 DeepSeek、Kimi 和自定义 Anthropic 兼容接口。

> 无代理，不改 Claude 配置。API Key 保留在 Windows Credential Manager 中，仅在
> 启动新的 Claude Code 子进程时注入。

## 中文说明

### 它能做什么

- 在 VS Code 侧边栏直接查看并切换当前工作区的 Provider。
- 一键启动使用所选路由的官方 Claude Code 新会话。
- 不同 VS Code 工作区可以同时使用不同 Provider。
- 显示模型、Endpoint 和凭据是否已配置，但绝不读取或显示 API Key。
- 保留状态栏和命令面板入口，适合键盘快速操作。

### 快速开始

1. 从 [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=NocoldBob.cc-router-companion)
   安装扩展。首次启用时点击 **立即安装**，扩展会安装内置的匹配版本桌面端。
2. 在自动打开的桌面端配置 Provider 与 API Key，然后点击一次“保存配置”；不需要先设置
   Windows 默认路由。
3. 在 VS Code 左侧活动栏打开 **CC Router**。
4. 点击一个 Provider，为当前工作区启用该路由。
5. 点击 **启动 Claude Code 新会话**。

不需要预先单独下载桌面程序。若电脑上已经安装过 CC Router，扩展会自动查找并
直接打开；也可以在设置中指定已有的 `cc-router.exe`。

[完整中文图文指南](https://github.com/NocoldBob/cc-router-windows/blob/main/docs/VSCODE_COMPANION_GUIDE.md)

也可以按 `Ctrl+Shift+P`，执行：

- `CC Router：为工作区选择 Provider`
- `CC Router：启动 Claude Code 新会话`
- `CC Router：清除工作区 Provider`
- `CC Router：修复或更新桌面端`

只有新启动的 Claude Code 会话使用所选路由，已有会话不会热切换。

### 内置桌面管理工具

VS Code 扩展负责工作区选择和快捷启动；桌面端负责编辑 Provider，并通过 Windows
Credential Manager 安全保存 API Key。扩展不会把 Key 写入 VS Code 用户设置、
工作区文件、日志或扩展状态。桌面安装器包含在 VSIX 中，但只会在用户明确确认后
为当前 Windows 用户安装。

当前 beta 仅支持本地 Windows 10/11 x64 工作区，暂不支持 WSL、SSH 和 Dev
Containers。需要同时安装 Anthropic 官方 Claude Code 扩展。

### 配置保存后仍然不显示

如果桌面端可以保存，但侧边栏一直显示“尚未找到共享 Provider 配置”，通常是电脑上
残留的旧版桌面端被插件优先打开。点击侧边栏中的 **修复或更新桌面端**，确认后插件会
关闭旧桌面端，并用 VSIX 内置的匹配版本覆盖安装。Provider 配置会保留，API Key 仍在
Windows Credential Manager 中。

修复完成后，插件会自动等待共享配置；若仍未出现，请在重新打开的桌面端点击一次
**保存配置**，再点击刷新。桌面端和 VS Code 还必须运行在同一个 Windows 用户账户下。

---

## English

CC Router Companion selects a process-isolated, Anthropic-compatible Provider for each local
Windows VS Code workspace. It works with CC Router desktop and the official Anthropic Claude
Code extension.

### Features

- View and switch the current workspace Provider from a native VS Code sidebar.
- Start a new official Claude Code session with the selected route in one click.
- Use different Providers in multiple VS Code workspaces at the same time.
- See model, endpoint and credential status without exposing the API Key.
- Keep status bar and Command Palette shortcuts for keyboard-first workflows.

### Quick start

1. Install the extension from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=NocoldBob.cc-router-companion).
   On first activation, click **Install Now** to install the bundled, matching desktop manager.
2. Configure Providers and API Keys in the desktop app that opens, then save once. Setting a
   Windows default route first is not required.
3. Open **CC Router** from the VS Code Activity Bar.
4. Click a Provider to bind it to the current workspace.
5. Click **Start New Claude Code Session**.

No separate desktop download is required. An existing CC Router installation is discovered
automatically, and a custom executable can still be selected as a recovery option.

If settings save in the desktop app but the sidebar still cannot find the shared Provider catalog,
run **CC Router: Repair or Update Desktop App**. After confirmation, the extension closes the old
desktop process and reinstalls the matching bundled version. Provider settings and Credential
Manager entries are preserved. The desktop app and VS Code must run under the same Windows user.

Only new Claude Code sessions use the selected route. Existing sessions are not hot-switched.

### Security boundary

The extension configures Claude Code's supported process-wrapper setting. Its bundled native
helper reads the selected credential from Windows Credential Manager only when launching Claude
Code, then injects it into that child process. CC Router does not run an HTTP proxy and does not
inspect model traffic. The VSIX also bundles the matching desktop installer; installation is
confirmation-gated and scoped to the current Windows user.

Remote workspaces including WSL, SSH and Dev Containers are not supported in this beta.

This project is not affiliated with Anthropic, DeepSeek, Moonshot AI, Microsoft, or VS Code.
