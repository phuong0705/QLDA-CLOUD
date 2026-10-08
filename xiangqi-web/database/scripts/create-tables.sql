-- ============================================================================
-- Xiangqi Web - Database Initialization Script
-- Script tạo bảng Users cho cơ sở dữ liệu XiangqiDB (SQL Server)
-- ============================================================================

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
