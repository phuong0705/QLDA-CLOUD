-- ============================================================================
-- Xiangqi Web - Seed Data (Dữ liệu mẫu cho môi trường phát triển)
-- ============================================================================
-- Chạy file này SAU khi đã chạy create-database.sql và create-tables.sql.
-- Dữ liệu mẫu phục vụ kiểm thử; KHÔNG dùng cho môi trường production.

USE XiangqiDB;
GO

-- ──────────────────────────────────────────────────────────
-- 1. Thêm người dùng mẫu (password hash cho "password123")
--    Hash được tạo bằng bcryptjs với salt rounds = 10
-- ──────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE Username = N'player1')
BEGIN
    INSERT INTO dbo.Users (Username, Email, PasswordHash, EloRating, Wins, Losses, Draws)
    VALUES
        (N'player1', N'player1@xiangqi.local', N'$2a$10$dummyhashfordevtestingonly1234567890abcdef', 1200, 10, 5, 3),
        (N'player2', N'player2@xiangqi.local', N'$2a$10$dummyhashfordevtestingonly1234567890abcdef', 1050, 6, 8, 2),
        (N'player3', N'player3@xiangqi.local', N'$2a$10$dummyhashfordevtestingonly1234567890abcdef', 1500, 25, 10, 5),
        (N'player4', N'player4@xiangqi.local', N'$2a$10$dummyhashfordevtestingonly1234567890abcdef', 980, 3, 7, 1),
        (N'player5', N'player5@xiangqi.local', N'$2a$10$dummyhashfordevtestingonly1234567890abcdef', 1350, 15, 12, 4);

    PRINT N'✓ Đã thêm 5 người dùng mẫu.';
END
ELSE
BEGIN
    PRINT N'→ Người dùng mẫu đã tồn tại, bỏ qua.';
END;

-- ──────────────────────────────────────────────────────────
-- 2. Thêm ván đấu mẫu
-- ──────────────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dbo.Games)
BEGIN
    INSERT INTO dbo.Games (RedPlayerID, BlackPlayerID, WinnerID, Result, StartedAt, EndedAt)
    VALUES
        (1, 2, 1, 'CHECKMATE', DATEADD(HOUR, -2, SYSUTCDATETIME()), DATEADD(HOUR, -1, SYSUTCDATETIME())),
        (3, 1, 3, 'RESIGN',    DATEADD(HOUR, -5, SYSUTCDATETIME()), DATEADD(HOUR, -4, SYSUTCDATETIME())),
        (2, 4, NULL, 'DRAW',   DATEADD(DAY, -1, SYSUTCDATETIME()),  DATEADD(DAY, -1, DATEADD(HOUR, 1, SYSUTCDATETIME())));

    PRINT N'✓ Đã thêm 3 ván đấu mẫu.';
END
ELSE
BEGIN
    PRINT N'→ Ván đấu mẫu đã tồn tại, bỏ qua.';
END;

PRINT N'→ Hoàn tất seed dữ liệu mẫu.';
GO
