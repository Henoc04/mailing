import { AppError } from "./AppError";

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  public readonly details?: unknown;

  constructor(message = "Invalid request", details?: unknown) {
    super(message, 400);
    this.details = details;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409);
  }
}

export class SmtpError extends AppError {
  constructor(message = "SMTP operation failed") {
    super(message, 502);
  }
}

export class ExternalApiError extends AppError {
  constructor(message = "External service error") {
    super(message, 502);
  }
}
