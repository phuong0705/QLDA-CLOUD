-- ============================================================================
-- Xiangqi Web - Database Initialization Script
-- Script tạo bảng Users, Rooms, Games, Moves và GameSaves cho cơ sở dữ liệu XiangqiDB (SQL Server)
-- ============================================================================

-- Bảng Users: Quản lý tài khoản, thông tin người dùng và chỉ số Elo
IF OBJECT_ID('dbo.Users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        UserID          INT IDENTITY(1,1)   NOT NULL,
        Username        NVARCHAR(50)        NOT NULL,
        Email           NVARCHAR(100)       NOT NULL,
        PasswordHash    NVARCHAR(255)       NOT NULL,
        Avatar          NVARCHAR(500)       NULL,
        EloRating       INT                 NOT NULL CONSTRAINT DF_Users_EloRating DEFAULT 1000,
        Wins            INT                 NOT NULL CONSTRAINT DF_Users_Wins DEFAULT 0,
        Losses          INT                 NOT NULL CONSTRAINT DF_Users_Losses DEFAULT 0,
        Draws           INT                 NOT NULL CONSTRAINT DF_Users_Draws DEFAULT 0,
        CreatedAt       DATETIME2(7)        NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt       DATETIME2(7)        NOT NULL CONSTRAINT DF_Users_UpdatedAt DEFAULT SYSUTCDATETIME(),

        -- Khóa chính và ràng buộc Unique
        CONSTRAINT PK_Users_UserID PRIMARY KEY CLUSTERED (UserID),
        CONSTRAINT UQ_Users_Username UNIQUE (Username),
        CONSTRAINT UQ_Users_Email UNIQUE (Email)
    );
END;

-- Bảng Rooms: Quản lý phòng chơi Cờ Tướng trực tuyến
IF OBJECT_ID('dbo.Rooms', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Rooms (
        RoomID          INT IDENTITY(1,1)   NOT NULL,
        RoomCode        NVARCHAR(20)        NOT NULL,
        HostUserID      INT                 NOT NULL,
        Status          NVARCHAR(20)        NOT NULL CONSTRAINT DF_Rooms_Status DEFAULT 'WAITING',
        MaxPlayers      INT                 NOT NULL CONSTRAINT DF_Rooms_MaxPlayers DEFAULT 2,
        CreatedAt       DATETIME2(7)        NOT NULL CONSTRAINT DF_Rooms_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt       DATETIME2(7)        NOT NULL CONSTRAINT DF_Rooms_UpdatedAt DEFAULT SYSUTCDATETIME(),

        -- Khóa chính, ràng buộc Unique, Khóa ngoại và Kiểm tra miền giá trị
        CONSTRAINT PK_Rooms_RoomID PRIMARY KEY CLUSTERED (RoomID),
        CONSTRAINT UQ_Rooms_RoomCode UNIQUE (RoomCode),
        CONSTRAINT FK_Rooms_HostUserID FOREIGN KEY (HostUserID) REFERENCES dbo.Users (UserID),
        CONSTRAINT CK_Rooms_Status CHECK (Status IN ('WAITING', 'PLAYING', 'FINISHED', 'CLOSED')),
        CONSTRAINT CK_Rooms_MaxPlayers CHECK (MaxPlayers >= 1 AND MaxPlayers <= 2)
    );
END;

-- Bảng Games: Quản lý các ván đấu cờ tướng (Online nhiều người chơi và Chơi với AI)
-- Ghi chú: Không lưu board JSON vào Games (tái tạo qua bảng Moves hoặc snapshot qua GameSaves)
IF OBJECT_ID('dbo.Games', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Games (
        GameID          INT IDENTITY(1,1)   NOT NULL,
        RoomID          INT                 NULL,
        RedPlayerID     INT                 NULL,
        BlackPlayerID   INT                 NULL,
        WinnerID        INT                 NULL,
        GameMode        NVARCHAR(20)        NOT NULL CONSTRAINT DF_Games_GameMode DEFAULT 'ONLINE',
        Status          NVARCHAR(20)        NOT NULL CONSTRAINT DF_Games_Status DEFAULT 'WAITING',
        CurrentTurn     NVARCHAR(10)        NOT NULL CONSTRAINT DF_Games_CurrentTurn DEFAULT 'RED',
        Result          NVARCHAR(20)        NULL,
        StartedAt       DATETIME2(7)        NULL,
        EndedAt         DATETIME2(7)        NULL,
        CreatedAt       DATETIME2(7)        NOT NULL CONSTRAINT DF_Games_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt       DATETIME2(7)        NOT NULL CONSTRAINT DF_Games_UpdatedAt DEFAULT SYSUTCDATETIME(),

        -- Khóa chính
        CONSTRAINT PK_Games_GameID PRIMARY KEY CLUSTERED (GameID),

        -- Khóa ngoại: Red/Black/Winner tham chiếu Users; RoomID tham chiếu Rooms (nullable cho AI)
        CONSTRAINT FK_Games_RoomID FOREIGN KEY (RoomID) REFERENCES dbo.Rooms (RoomID),
        CONSTRAINT FK_Games_RedPlayerID FOREIGN KEY (RedPlayerID) REFERENCES dbo.Users (UserID),
        CONSTRAINT FK_Games_BlackPlayerID FOREIGN KEY (BlackPlayerID) REFERENCES dbo.Users (UserID),
        CONSTRAINT FK_Games_WinnerID FOREIGN KEY (WinnerID) REFERENCES dbo.Users (UserID),

        -- Ràng buộc kiểm tra miền giá trị (Check constraints)
        CONSTRAINT CK_Games_GameMode CHECK (GameMode IN ('ONLINE', 'AI')),
        CONSTRAINT CK_Games_Status CHECK (Status IN ('WAITING', 'PLAYING', 'FINISHED', 'SAVED')),
        CONSTRAINT CK_Games_CurrentTurn CHECK (CurrentTurn IN ('RED', 'BLACK')),
        CONSTRAINT CK_Games_Players CHECK (RedPlayerID IS NOT NULL OR BlackPlayerID IS NOT NULL)
    );
END;

-- Bảng Moves: Quản lý từng nước đi trong ván đấu
-- Mỗi nước đi thuộc về một GameID cụ thể với MoveNumber duy nhất tăng dần.
-- Nước đi của AI có PlayerID = NULL (thể hiện nước đi do AI/hệ thống thực hiện).
IF OBJECT_ID('dbo.Moves', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Moves (
        MoveID          INT IDENTITY(1,1)   NOT NULL,
        GameID          INT                 NOT NULL,
        MoveNumber      INT                 NOT NULL,
        PlayerID        INT                 NULL, -- Nullable cho AI (system move)
        PieceType       NVARCHAR(20)        NOT NULL,
        PieceColor      NVARCHAR(10)        NOT NULL,
        FromPosition    NVARCHAR(20)        NOT NULL,
        ToPosition      NVARCHAR(20)        NOT NULL,
        CapturedPiece   NVARCHAR(20)        NULL,
        CreatedAt       DATETIME2(7)        NOT NULL CONSTRAINT DF_Moves_CreatedAt DEFAULT SYSUTCDATETIME(),

        -- Khóa chính
        CONSTRAINT PK_Moves_MoveID PRIMARY KEY CLUSTERED (MoveID),

        -- Khóa ngoại
        CONSTRAINT FK_Moves_GameID FOREIGN KEY (GameID) REFERENCES dbo.Games (GameID) ON DELETE CASCADE,
        CONSTRAINT FK_Moves_PlayerID FOREIGN KEY (PlayerID) REFERENCES dbo.Users (UserID),

        -- Ràng buộc kiểm tra miền giá trị
        CONSTRAINT CK_Moves_MoveNumber CHECK (MoveNumber >= 1),
        CONSTRAINT CK_Moves_PieceColor CHECK (PieceColor IN ('RED', 'BLACK'))
    );
END;

-- Bảng GameSaves: Quản lý snapshot trạng thái ván cờ (BoardState JSON versioned, CurrentTurn, MoveNumber, SavedAt)
-- Phục vụ tính năng lưu ván cờ (snapshot) theo kiến trúc đã thống nhất
IF OBJECT_ID('dbo.GameSaves', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.GameSaves (
        SaveID          INT IDENTITY(1,1)   NOT NULL,
        GameID          INT                 NOT NULL,
        UserID          INT                 NOT NULL,
        BoardState      NVARCHAR(MAX)       NOT NULL,
        CurrentTurn     NVARCHAR(10)        NOT NULL CONSTRAINT DF_GameSaves_CurrentTurn DEFAULT 'RED',
        MoveNumber      INT                 NOT NULL CONSTRAINT DF_GameSaves_MoveNumber DEFAULT 0,
        SavedAt         DATETIME2(7)        NOT NULL CONSTRAINT DF_GameSaves_SavedAt DEFAULT SYSUTCDATETIME(),

        -- Khóa chính
        CONSTRAINT PK_GameSaves_SaveID PRIMARY KEY CLUSTERED (SaveID),

        -- Khóa ngoại
        CONSTRAINT FK_GameSaves_GameID FOREIGN KEY (GameID) REFERENCES dbo.Games (GameID) ON DELETE CASCADE,
        CONSTRAINT FK_GameSaves_UserID FOREIGN KEY (UserID) REFERENCES dbo.Users (UserID),

        -- Ràng buộc kiểm tra miền giá trị
        CONSTRAINT CK_GameSaves_CurrentTurn CHECK (CurrentTurn IN ('RED', 'BLACK')),
        CONSTRAINT CK_GameSaves_MoveNumber CHECK (MoveNumber >= 0)
    );
END;

-- Chỉ mục (Indexes) tối ưu hóa truy vấn cho Games
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Games_RedPlayerID' AND object_id = OBJECT_ID('dbo.Games'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Games_RedPlayerID ON dbo.Games (RedPlayerID);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Games_BlackPlayerID' AND object_id = OBJECT_ID('dbo.Games'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Games_BlackPlayerID ON dbo.Games (BlackPlayerID);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Games_WinnerID' AND object_id = OBJECT_ID('dbo.Games'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Games_WinnerID ON dbo.Games (WinnerID);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Games_RoomID' AND object_id = OBJECT_ID('dbo.Games'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Games_RoomID ON dbo.Games (RoomID);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Games_Status' AND object_id = OBJECT_ID('dbo.Games'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Games_Status ON dbo.Games (Status);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Games_CreatedAt' AND object_id = OBJECT_ID('dbo.Games'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Games_CreatedAt ON dbo.Games (CreatedAt DESC);
END;

-- Unique Index đảm bảo MoveNumber là duy nhất trong cùng một ván đấu (GameID, MoveNumber)
-- Ngăn chặn tuyệt đối việc insert trùng MoveNumber cho cùng một ván cờ
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Moves_GameID_MoveNumber' AND object_id = OBJECT_ID('dbo.Moves'))
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX UQ_Moves_GameID_MoveNumber ON dbo.Moves (GameID, MoveNumber);
END;

-- Chỉ mục tối ưu hóa truy vấn nước đi theo người chơi
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Moves_PlayerID' AND object_id = OBJECT_ID('dbo.Moves'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Moves_PlayerID ON dbo.Moves (PlayerID);
END;

-- Unique Index cho GameSaves: Đảm bảo mỗi cặp (GameID, UserID) duy trì bản snapshot mới nhất khi upsert
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_GameSaves_GameID_UserID' AND object_id = OBJECT_ID('dbo.GameSaves'))
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX UQ_GameSaves_GameID_UserID ON dbo.GameSaves (GameID, UserID);
END;

-- Chỉ mục tối ưu hóa truy vấn GameSaves theo thời gian lưu
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_GameSaves_SavedAt' AND object_id = OBJECT_ID('dbo.GameSaves'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_GameSaves_SavedAt ON dbo.GameSaves (SavedAt DESC);
END;
