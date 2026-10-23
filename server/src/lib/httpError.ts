// 轻量 HTTP 错误：服务层抛出，路由/错误中间件据 statusCode 统一响应。
// 注意：不使用「参数属性」语法（Node type-stripping 不支持），显式声明字段 + 构造器赋值。
export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}
