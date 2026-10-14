-- ============================================================================
-- Xiangqi Web - Script tạo Database XiangqiDB
-- Chạy trên SQL Server Management Studio (SSMS) hoặc sqlcmd
-- ============================================================================

-- Kiểm tra và tạo database nếu chưa tồn tại
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = N'XiangqiDB')
BEGIN
    CREATE DATABASE XiangqiDB;
    PRINT N'✓ Database XiangqiDB đã được tạo thành công.';
END
ELSE
BEGIN
    PRINT N'→ Database XiangqiDB đã tồn tại, bỏ qua bước tạo.';
END;
GO

-- Chuyển sang sử dụng database XiangqiDB
USE XiangqiDB;
GO

PRINT N'→ Đang sử dụng database XiangqiDB.';

-- Tạo Login chuyên dụng cho ứng dụng (thay thế tài khoản sa)
USE master;
GO
IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = 'xiangqi_app')
BEGIN
    CREATE LOGIN [xiangqi_app] WITH PASSWORD = 'XiangqiAppPassword2026!', CHECK_POLICY = OFF;
    PRINT N'✓ Đã tạo login [xiangqi_app].';
END
ELSE
BEGIN
    PRINT N'→ Login [xiangqi_app] đã tồn tại.';
END
GO

USE XiangqiDB;
GO
IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = 'xiangqi_app')
BEGIN
    CREATE USER [xiangqi_app] FOR LOGIN [xiangqi_app];
    ALTER ROLE db_owner ADD MEMBER [xiangqi_app];
    PRINT N'✓ Đã gán quyền db_owner cho user [xiangqi_app] trên XiangqiDB.';
END
GO

PRINT N'→ Tiếp tục chạy script create-tables.sql để tạo các bảng.';
GO
