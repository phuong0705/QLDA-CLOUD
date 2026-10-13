-- ============================================================================
-- Xiangqi Web - Database Initialization Script
-- Script tạo bảng Users, Rooms và RoomPlayers cho cơ sở dữ liệu XiangqiDB (SQL Server)
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

-- Bảng RoomPlayers: Quản lý thành viên đang tham gia trong từng phòng chơi
IF OBJECT_ID('dbo.RoomPlayers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.RoomPlayers (
        RoomPlayerID    INT IDENTITY(1,1)   NOT NULL,
        RoomID          INT                 NOT NULL,
        UserID          INT                 NOT NULL,
        Side            NVARCHAR(10)        NULL,
        IsHost          BIT                 NOT NULL CONSTRAINT DF_RoomPlayers_IsHost DEFAULT 0,
        IsReady         BIT                 NOT NULL CONSTRAINT DF_RoomPlayers_IsReady DEFAULT 0,
        JoinedAt        DATETIME2(7)        NOT NULL CONSTRAINT DF_RoomPlayers_JoinedAt DEFAULT SYSUTCDATETIME(),

        -- Khóa chính, Khóa ngoại, Unique constraint và Check
        CONSTRAINT PK_RoomPlayers_RoomPlayerID PRIMARY KEY CLUSTERED (RoomPlayerID),
        CONSTRAINT FK_RoomPlayers_RoomID FOREIGN KEY (RoomID) REFERENCES dbo.Rooms (RoomID) ON DELETE CASCADE,
        CONSTRAINT FK_RoomPlayers_UserID FOREIGN KEY (UserID) REFERENCES dbo.Users (UserID),
        CONSTRAINT UQ_RoomPlayers_Room_User UNIQUE (RoomID, UserID),
        CONSTRAINT CK_RoomPlayers_Side CHECK (Side IS NULL OR Side IN ('RED', 'BLACK'))
    );
END;

-- Tạo Index tối ưu hóa truy vấn
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Rooms_Status' AND object_id = OBJECT_ID('dbo.Rooms'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Rooms_Status ON dbo.Rooms (Status);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Rooms_HostUserID' AND object_id = OBJECT_ID('dbo.Rooms'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Rooms_HostUserID ON dbo.Rooms (HostUserID);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RoomPlayers_RoomID' AND object_id = OBJECT_ID('dbo.RoomPlayers'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_RoomPlayers_RoomID ON dbo.RoomPlayers (RoomID);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_RoomPlayers_UserID' AND object_id = OBJECT_ID('dbo.RoomPlayers'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_RoomPlayers_UserID ON dbo.RoomPlayers (UserID);
END;
