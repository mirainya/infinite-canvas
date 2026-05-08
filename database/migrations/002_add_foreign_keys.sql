-- 外键约束
-- task_logs.user_id 允许 NULL（匿名任务），所以不加 NOT NULL

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_task_logs_user' AND table_name = 'task_logs'
    ) THEN
        ALTER TABLE task_logs
            ADD CONSTRAINT fk_task_logs_user
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_credit_logs_user' AND table_name = 'credit_logs'
    ) THEN
        ALTER TABLE credit_logs
            ADD CONSTRAINT fk_credit_logs_user
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;
