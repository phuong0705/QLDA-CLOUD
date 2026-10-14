-- ============================================================================
-- Xiangqi Web - Index Optimization Script (Bổ sung)
-- ============================================================================
-- Các index chính đã được tạo trong create-tables.sql.
-- File này chứa các index bổ sung để tối ưu truy vấn đặc thù.

USE XiangqiDB;
GO

-- Index hỗ trợ tìm kiếm User theo EloRating (bảng xếp hạng)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Users_EloRating' AND object_id = OBJECT_ID('dbo.Users'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Users_EloRating ON dbo.Users (EloRating DESC)
    INCLUDE (Username, Wins, Losses, Draws);
    PRINT N'✓ Index IX_Users_EloRating đã được tạo.';
END;

-- Index hỗ trợ truy vấn Game theo thời gian bắt đầu
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Games_StartedAt' AND object_id = OBJECT_ID('dbo.Games'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Games_StartedAt ON dbo.Games (StartedAt DESC);
    PRINT N'✓ Index IX_Games_StartedAt đã được tạo.';
END;

-- Index hỗ trợ truy vấn Room theo RoomCode (tìm phòng bằng mã)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Rooms_RoomCode_Status' AND object_id = OBJECT_ID('dbo.Rooms'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Rooms_RoomCode_Status ON dbo.Rooms (RoomCode, Status);
    PRINT N'✓ Index IX_Rooms_RoomCode_Status đã được tạo.';
END;

-- Index hỗ trợ sắp xếp nước đi theo thứ tự trong ván đấu
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Moves_GameID_MoveNumber' AND object_id = OBJECT_ID('dbo.Moves'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Moves_GameID_MoveNumber ON dbo.Moves (GameID, MoveNumber ASC);
    PRINT N'✓ Index IX_Moves_GameID_MoveNumber đã được tạo.';
END;

PRINT N'→ Hoàn tất tạo index bổ sung.';
GO
