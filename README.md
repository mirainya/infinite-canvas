# Infinite Canvas

可视化节点画布，用于编排 AI 工作流 —— 在无限缩放的画布上拖拽、连接、执行生成式任务。基于 React Flow + FastAPI 构建。

## 当前能力

- 无限画布：拖拽、缩放、连线、小地图
- AI 节点：生图、改图、合成、九宫格切图
- 图片下载：查看器内下载生成图、上传图和多图结果
- 分组区域：节点加入/移出分组
- 分类管理：颜色、标签、搜索、定位
- 画布管理：自动保存、历史版本、本地项目列表
- 云端同步：按账号中心用户隔离保存画布
- 导入导出：画布 JSON、完整项目包
- 插件系统：热加载、SSE 实时通知前端
- Meta Prompt：视觉模型自动生成改图提示词
- 商品套图：分步生成提示词、人工检查、批量生图
- 统一账号：账号中心登录、资料、钱包余额与扣费
- 体验增强：右键菜单、快捷键说明、明暗主题、网格设置

## 启动

安装前端依赖：

```bash
npm install
```

安装后端依赖：

```bash
cd server
pip install -r requirements.txt
```

根据 `.env.example` 创建 `server/.env`。账号中心配置是必填项；后端启动时会自动执行 `database/migrations/` 中尚未应用的迁移。

启动前端：

```bash
npm run dev
```

启动后端：

```bash
cd server
uvicorn main:app --port 7391
```

构建检查：

```bash
npm run build
```

运行前端测试：

```bash
npm test
```

运行后端测试：

```bash
cd server
python -m pytest tests/ -v
```

## 快捷键

- `?`：快捷键说明
- `Ctrl/Cmd + S`：保存画布并创建历史版本
- `Ctrl/Cmd + F`：搜索节点
- `Ctrl/Cmd + D`：复制所选节点
- `Ctrl/Cmd + Z`：撤销
- `Ctrl/Cmd + Y`：重做
- `Delete/Backspace`：删除所选
- `Esc`：关闭菜单、详情和说明

## 代码结构

```text
src/
  App.tsx                 # 主流程和状态装配
  constants.ts            # 常量、模板、默认配置
  storage.ts              # localStorage 读写和快照
  types.ts                # 共享类型
  components/             # 节点、菜单、抽屉、侧边栏面板
  hooks/                  # 画布历史、项目、搜索、导入导出等逻辑
server/
  main.py                 # FastAPI 入口
  account_center.py       # 账号中心身份与资料接口
  wallet.py               # 账号中心钱包扣费与退款
  db.py                   # PostgreSQL 连接与迁移
  models.py               # Pydantic 模型
  plugin_loader.py        # 插件热加载
  xfs.py                  # X-File-Storage 上传
  routers/                # 认证、画布、节点、模型、模板与执行 API
  plugins/                # 图像、文本、提示词与商品套图节点
```

## 后端接口

- `GET /api/health` — 健康检查
- `GET /api/plugins` — 已加载插件列表
- `GET /api/nodes` — 节点定义列表
- `GET /api/nodes/events` — SSE 插件变更通知
- `POST /api/execute` — 执行节点
- `POST /api/execute/stream` — 流式执行节点
- `POST /api/download-image` — 安全代理并下载公网图片
- `POST /api/auth/login` — 账号中心登录
- `GET /api/auth/me` — 当前账号资料与余额
- `GET /api/canvases` — 当前账号的云端画布
- `GET /api/models` — 可用模型列表
- `GET /api/templates` — 工作流模板
- `GET /api/prompt-templates` — 提示词模板
- `GET /api/task-logs` — 任务日志
- `POST /api/meta-prompt` — 自动生成改图提示词
