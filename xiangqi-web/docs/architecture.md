# Kiến trúc hệ thống

## Frontend

HTML5, CSS3 và Vanilla JavaScript chịu trách nhiệm hiển thị giao diện, nhận tương tác và gọi backend. Frontend không chứa thông tin đăng nhập SQL Server.

## Backend

Node.js và Express.js được tổ chức theo các tầng Route, Controller, Service và Repository.

## REST API

REST API là ranh giới giao tiếp giữa frontend và backend. Luồng xử lý dự kiến:

```text
Frontend -> REST API -> Route -> Controller -> Service -> Repository -> SQL Server
```

## SQL Server

Database dự kiến có tên `XiangqiDB`. Chỉ tầng Repository được chuẩn bị để truy vấn dữ liệu thông qua package `mssql`.

## Socket.IO

Socket.IO sẽ được bổ sung sau cho chế độ chơi online, đồng bộ nước đi, timer và trạng thái phòng. Hiện tại chưa triển khai realtime.
