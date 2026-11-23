# 在 VS Code 中使用 CC Router 与 Claude Code

本指南适用于希望在本地 Windows 或 Ubuntu VS Code 工作区中，通过 CC Router 为 Anthropic
官方 Claude Code 扩展选择 DeepSeek、Kimi、GLM、Qwen、MiniMax 或自定义 Anthropic
兼容 Provider 的用户。

CC Router Companion 不运行 HTTP 代理。它为每个工作区保存 Provider 选择，并在
启动新的 Claude Code 子进程时注入对应路由。API Key 始终保存在 Windows
Credential Manager 或 Linux Secret Service 中，不会写入 VS Code 设置或项目文件。

> 自 1.3.0 起，扩展**自包含**：Provider 管理、API Key 保存、隔离终端、
> Windows 默认路由和诊断导出都可以在扩展内完成，不需要安装桌面端。
> CC Router 桌面端继续作为独立产品维护，适合不使用 VS Code 的终端用户。

## 使用前准备

- Windows 10/11 x64，或 Ubuntu Desktop 22.04/24.04 x64。
- 本地 VS Code 工作区。WSL、SSH 和 Dev Containers 暂不支持。
- 一个可用的 Provider API Key。
- Anthropic 官方 `Claude Code` VS Code 扩展（安装 Companion 时会自动带上）。

## 第一步：安装 CC Router Companion

### 从 VS Code Marketplace 安装（推荐）

1. 打开 [CC Router Companion 商店页面](https://marketplace.visualstudio.com/items?itemName=NocoldBob.cc-router-companion)。
2. 点击 **Install / 安装**，允许页面打开 VS Code。
3. 在 VS Code 中确认安装，完成后根据提示重新加载窗口。

也可以直接在 VS Code 中按 `Ctrl+Shift+X` 打开扩展面板，搜索
`CC Router Companion`，确认发布者为 `NocoldBob` 后点击安装。从 Marketplace
安装可以自动接收后续版本更新。

### 从 VSIX 手动安装（备用）

1. 从本项目 [GitHub Releases](https://github.com/NocoldBob/cc-router/releases)
下载与你的平台匹配的 `cc-router-companion-win32-x64-*.vsix` 或
`cc-router-companion-linux-x64-*.vsix`。
2. 在 VS Code 扩展面板右上角点击 `...`。
3. 选择 **从 VSIX 安装... / Install from VSIX...**。
4. 选择下载的 VSIX，等待 VS Code 显示安装成功。
5. 根据提示重新加载 VS Code 窗口。

## 第二步：配置 Provider 与 API Key

按 `Ctrl+Shift+P` 执行 **CC Router：管理 Provider**（或点击 CC Router 侧栏标题栏的
齿轮图标），打开内置的管理面板。

1. 在左侧选择一个内置模板（DeepSeek、Kimi Global、Kimi Code、GLM 智谱、Qwen、
   MiniMax），或通过“＋ 新建 / 模板”添加。
2. 需要时切换“模型方案”预设（例如 DeepSeek 的 Flash/Pro、Kimi Code 的
   K3.1 Pro 256K/1M），预设会一次性写入全部模型映射与上下文参数。
3. 在 API Key 区域只粘贴原始令牌，不要添加 `Bearer`，也不要粘贴说明文字或引号。
4. 点击保存 API Key，将其写入系统凭据存储（面板只显示“是否已配置”，
   绝不回显 Key）。
5. 点击页面顶部的 **保存配置**。扩展会把无密钥的 Provider 目录同步给后台 helper。

## 第三步：为当前工作区选择 Provider

先在 VS Code 中打开一个本地文件夹或 `.code-workspace`，然后点击活动栏中的
**CC Router** 图标。

侧栏分为三个区域：

| 区域 | 作用 |
| --- | --- |
| 当前工作区 | 显示已选择的 Provider、主模型、Endpoint 和凭据状态 |
| 选择 Provider | 点击一个 Provider，将它绑定到当前工作区 |
| 快捷操作 | 启动新会话、清除工作区路由或打开管理面板 |

Provider 左侧图标的含义：

| 图标 | 含义 |
| --- | --- |
| 对勾 | 当前工作区正在选择该 Provider |
| 服务器 | Provider 可用，凭据已配置 |
| 警告 | 尚未配置 API Key，需要在管理面板中保存 |

不同工作区可以同时选择不同 Provider。例如，工作区 A 使用 DeepSeek，工作区 B
使用 Kimi Code，它们不会相互覆盖。

## 第四步：启动 Claude Code 新会话

1. 在 **选择 Provider** 区域点击目标 Provider。
2. 首次使用时，确认让 CC Router 配置 Claude Code 的进程 wrapper。
3. 点击 **启动 Claude Code 新会话**。
4. Claude Code 面板打开后开始对话。

也可以按 `Ctrl+Shift+P` 使用以下命令：

```text
CC Router: Manage Providers
CC Router: Save API Key to Credential Store
CC Router: Select Provider for Workspace
CC Router: Start Claude Code Session
CC Router: Clear Provider for Workspace
CC Router: Restore Previous Claude Wrapper
```

只有通过 CC Router 新启动的 Claude Code 会话会获得所选路由。已经打开的会话不会
热切换；切换 Provider 后必须点击 **启动 Claude Code 新会话**。

## 第五步：确认路由已经生效

可以用以下方式交叉确认：

1. VS Code 状态栏显示当前 Provider 名称。
2. CC Router 侧栏的“当前工作区”显示预期模型和 Endpoint。
3. 在新 Claude Code 会话中运行 `/status`，检查实际 Base URL 和模型。
4. 运行 `/model`，确认当前模型名称与管理面板中的主模型配置一致。

如果 Claude Code 仍显示旧 Provider，先关闭旧会话，再通过 CC Router 的
**启动 Claude Code 新会话**按钮重新创建会话。

## 修改模型或新增 Provider

1. 打开 **CC Router：管理 Provider**。
2. 修改模型映射，或添加自定义 Anthropic 兼容 HTTPS / 可信内网 HTTP Provider。
3. 点击 **保存配置**。
4. 回到侧栏重新选择 Provider（如需），并启动新会话。

Claude Code 对话框中的上下文标识来自所选模型名称，例如 `k3.1-pro[1m]`。需要调整时
应在管理面板中修改模型配置，而不是在已有 Claude Code 会话中寻找 CC Router 设置。

## 常见问题

### 提示没有配置 API Key

打开 **管理 Provider** 面板，选择对应 Provider，重新粘贴原始 API Key 并保存。
不要输入 `Bearer` 前缀、空格、中文说明或整段聊天内容。

### 出现 `Header 'Authorization' has invalid value`

通常是 API Key 字段中混入了 `Bearer`、引号、换行或说明文字。删除旧凭据，只粘贴
Provider 提供的原始令牌并重新保存。

### 切换 Provider 后模型没有变化

路由只对新进程生效。不要继续复用旧对话，使用侧栏的 **启动 Claude Code 新会话**。

### Claude Code 已配置其他 wrapper

插件会在替换前提示，并记录原来的设置。需要退出 CC Router 时，运行
`CC Router: Restore Previous Claude Wrapper` 恢复原配置。

### 我之前一直用桌面端管理配置

升级到 1.3.0 后首次激活扩展时，扩展会自动导入桌面端写过的 Provider 目录，
之后以扩展内的管理面板为准（两边写入同一份无密钥目录，后保存者生效）。
桌面端可以继续使用，但不是必须的。

## 卸载与恢复

卸载扩展前，建议先运行 `CC Router: Restore Previous Claude Wrapper`。

移除扩展不会删除系统凭据存储中的 Provider 凭据。如需清除凭据，可在卸载前于管理
面板中逐个删除；桌面端用户也可以继续使用桌面端管理。Provider 目录文件位于：

```text
%APPDATA%\local.ccrouter.desktop\providers.json
Ubuntu: ~/.config/local.ccrouter.desktop/providers.json
```

该文件只包含 Provider 名称、Endpoint 和模型等非敏感配置，不包含 API Key。

## 安全边界

- 扩展状态、VS Code 设置和工作区文件中不保存 API Key。
- 原生 helper 只在启动新的 Claude Code 子进程时读取所选凭据。
- CC Router 不运行 HTTP 代理，不读取或记录 prompt、代码、回答和 Token 用量。
- 所选 Provider 仍会接收 Claude Code 发出的模型请求。
- 当前支持本地 Windows 和 Ubuntu 工作区。

更多边界说明见[安全模型](SECURITY_MODEL.md)。
