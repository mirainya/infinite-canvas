# Infinite Canvas

可视化节点画布，用于编排 AI 工作流 —— 在无限缩放的画布上拖拽、连接、执行生成式任务。基于 React Flow + FastAPI 构建。

## 当前能力

- 无限画布：拖拽、缩放、连线、小地图
- AI 节点：生图、改图、合成、九宫格切图
- 分组区域：节点加入/移出分组
- 分类管理：颜色、标签、搜索、定位
- 画布管理：自动保存、历史版本、本地项目列表
- 导入导出：画布 JSON、完整项目包
- 插件系统：热加载、SSE 实时通知前端
- Meta Prompt：视觉模型自动生成改图提示词
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
  db.py                   # PostgreSQL 连接与建表
  models.py               # Pydantic 模型
  plugin_loader.py        # 插件热加载
  xfs.py                  # X-File-Storage 上传
  routers/                # API 路由（sources、nodes、execute、meta_prompt）
  plugins/                # 节点插件（image_gen、image_edit、image_compose、grid_split）
```

## 后端接口

- `GET /api/health` — 健康检查
- `GET /api/plugins` — 已加载插件列表
- `GET /api/nodes` — 节点定义列表
- `GET /api/nodes/events` — SSE 插件变更通知
- `POST /api/execute` — 执行节点
- `GET /api/sources` — API 来源列表
- `POST /api/sources` — 添加来源
- `PUT /api/sources/:id` — 更新来源
- `DELETE /api/sources/:id` — 删除来源
- `GET /api/task-logs` — 任务日志
- `POST /api/meta-prompt` — 自动生成改图提示词
