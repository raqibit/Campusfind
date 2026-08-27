import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}

export function asyncRoute(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (request, response, next) => {
    void Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export const notFound: RequestHandler = (request, _response, next) => {
  next(new AppError(404, `Route ${request.method} ${request.path} was not found`, "NOT_FOUND"));
};

export const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  void _next;
  if (error instanceof ZodError) {
    response.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Please check the submitted information.",
        fields: error.flatten().fieldErrors,
      },
    });
    return;
  }

  if (error?.code === 11000) {
    response.status(409).json({
      error: { code: "DUPLICATE_RECORD", message: "This record already exists." },
    });
    return;
  }

  if (error?.name === "CastError") {
    response.status(400).json({
      error: { code: "INVALID_IDENTIFIER", message: "The supplied record identifier is invalid." },
    });
    return;
  }

  const statusCode = error instanceof AppError ? error.statusCode : 500;
  response.status(statusCode).json({
    error: {
      code: error instanceof AppError ? error.code : "INTERNAL_ERROR",
      message: error instanceof AppError ? error.message : "An unexpected error occurred.",
    },
  });
};
