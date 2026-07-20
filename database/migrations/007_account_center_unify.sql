-- 007: IC 归入账号中心(account-center)统一身份 + 钱包
-- 变更原因: IC 退役本地密码/积分体系, 全量改用账号中心。
--   - user_id 列语义变更: 从"IC 本地 users.id"改为"账号中心 user_id"(保留列, 解除外键)
--   - drop 本地 users / credit_logs 表(积分移交账号中心钱包; 无真实用户, 直接清掉)
--   - task_logs 加 request_id(钱包扣费幂等键, 供退款引用 original_request_id)
-- 影响范围: task_logs / credit_logs / prompt_enhance_logs / prompt_templates / canvases / workflow_templates
-- 幂等: 全部 IF EXISTS / IF NOT EXISTS, 可重复执行

-- 1. 解除所有指向 users 的外键(否则无法 drop users)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tc.constraint_name, tc.table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'users'
    LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
    END LOOP;
END $$;

-- 2. task_logs 加钱包幂等键
ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS request_id TEXT DEFAULT '';

-- 3. drop 本地积分/用户表(积分已移交账号中心钱包)
DROP TABLE IF EXISTS credit_logs;
DROP TABLE IF EXISTS users;
