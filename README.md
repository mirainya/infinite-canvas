# Infinite Canvas V2

面向 AI 图像创作的可视化工作台。V2 使用云端项目、服务端任务、统一素材库与账号中心钱包。

## 核心能力

- 十种正式节点：图像输入、文本输入、图像集合、文本集合、AI 图像、文本生成、提示词增强、图像切分、图像输出、文本输出。
- AI 图像统一处理文生图、参考图创作、多图融合和带独立蒙版的局部编辑。
- PostgreSQL 任务队列；页面关闭后任务继续执行。
- XFS 素材存储、缩略图、成果预览和图片下载。
- 幂等扣费、失败退款和异常任务恢复。
- 增量自动保存、差异撤销记录、可视区域渲染和 Web Worker 自动排列。
- 系统模板：商品影棚套图、灵感生图、分镜切分。
- 账号中心统一登录、资料、权限和钱包。

完整产品定义见 `docs/V2_PRODUCT_SPEC.md`。

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
