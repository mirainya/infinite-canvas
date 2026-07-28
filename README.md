# Infinite Canvas

面向 AI 图像创作的自由无限画布。登录后直接进入画布，通过图片、文字、画板和 AI 创作栏完成创作，不使用节点连线工作流。

## 核心能力

- 自由缩放、移动、多选、画笔、文字与画板。
- 图片上传、拖放、粘贴、素材库、蒙版、裁剪、切分和下载。
- AI 绘图统一处理文生图、多图参考与带蒙版的局部修改。
- 批量结果按二维网格放入画板，不显示节点端口或默认连线。
- PostgreSQL 任务队列；页面关闭后任务继续执行。
- XFS 素材存储、缩略图、成果预览和图片下载。
- 幂等扣费、失败退款和异常任务恢复。
- 项目自动保存、历史版本和可视区域渲染。
- 商品套图、灵感板和分镜画板创作方案。
- 账号中心统一登录、资料、权限和钱包。

自由画布定义见 `docs/FREE_CANVAS_REDESIGN.md`。

## 本地启动

安装依赖：

```bash
npm install
python -m pip install -r server/requirements.txt
```

将 `.env.example` 复制为 `server/.env` 并填写数据库、账号中心配置。Prism 与 XFS 在管理后台配置。

开发模式：

```bash
cd server
uvicorn main:app --port 7391
```

```bash
npm run dev
```

正式环境使用 tldraw 商业许可证时设置 `VITE_TLDRAW_LICENSE_KEY`。

开发模式默认在 API 进程内运行一个 worker。正式环境设置：

```env
APP_ENV=production
PLUGIN_HOT_RELOAD=false
V2_EMBEDDED_WORKER=false
```

并单独启动任务服务：

```bash
cd server
python v2_worker.py
```

## 检查

```bash
npm run build
npm run lint
npm test
python -m pytest server/tests -q
```

## V2 接口

- `GET/POST /api/v2/projects`
- `GET/PATCH/DELETE /api/v2/projects/{id}`
- `GET /api/v2/projects/{id}/versions`
- `GET/POST /api/v2/assets`
- `GET /api/v2/templates`
- `POST /api/v2/templates/{id}/instantiate`
- `GET/POST /api/v2/runs`
- `GET /api/v2/runs/{id}`
- `POST /api/v2/runs/{id}/cancel`
- `GET /api/v2/admin/overview`
- `GET /api/v2/admin/extensions`
- `POST /api/v2/admin/extensions/reload`

V1 接口暂时保留，V2 不读取旧画布数据。
