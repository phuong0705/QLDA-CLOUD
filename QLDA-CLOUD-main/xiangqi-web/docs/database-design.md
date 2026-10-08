# Thiết kế database dự kiến

Database dự kiến: `XiangqiDB`. Nội dung này chỉ mô tả thiết kế, chưa tạo bảng thực tế.

## Users

- UserID
- Username
- Email
- PasswordHash
- Avatar
- EloRating
- Wins
- Losses
- Draws
- CreatedAt

## Games

- GameID
- RedPlayerID
- BlackPlayerID
- WinnerID
- Result
- StartedAt
- EndedAt
- CreatedAt

## Moves

- MoveID
- GameID
- PlayerID
- PieceType
- FromPosition
- ToPosition
- MoveNumber
- CreatedAt

## Primary Keys

- `Users.UserID`
- `Games.GameID`
- `Moves.MoveID`

## Foreign Keys

- `Games.RedPlayerID`, `Games.BlackPlayerID` và `Games.WinnerID` dự kiến tham chiếu `Users.UserID`.
- `Moves.GameID` dự kiến tham chiếu `Games.GameID`.
- `Moves.PlayerID` dự kiến tham chiếu `Users.UserID`.

## Relationships

- Users 1 --- N Games.
- Games 1 --- N Moves.
- Users 1 --- N Moves.
