import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from "@nestjs/common";
import { HttpExceptionFilter } from "../../../src/common/filters/http-exception.filter";

describe("HttpExceptionFilter", () => {
  let filter: HttpExceptionFilter;
  let mockResponse: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  let mockRequest: { url: string; method: string };
  let mockHost: {
    switchToHttp: () => {
      getResponse: () => typeof mockResponse;
      getRequest: () => typeof mockRequest;
    };
  };

  beforeEach(() => {
    filter = new HttpExceptionFilter();

    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    mockRequest = {
      url: "/api/test",
      method: "GET",
    };

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
  });

  it("should handle HttpException with string response", () => {
    const exception = new HttpException("Test error", HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost as never);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: "Test error",
        path: "/api/test",
      }),
    );
  });

  it("should handle BadRequestException", () => {
    const exception = new BadRequestException("Invalid input");

    filter.catch(exception, mockHost as never);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: "Invalid request. Please check your input.",
        error: "Bad Request",
      }),
    );
  });

  it("should handle NotFoundException", () => {
    const exception = new NotFoundException("Resource not found");

    filter.catch(exception, mockHost as never);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
  });

  it("should handle InternalServerErrorException", () => {
    const exception = new InternalServerErrorException("Server error");

    filter.catch(exception, mockHost as never);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });

  it("should handle generic Error", () => {
    const exception = new Error("Generic error");

    filter.catch(exception, mockHost as never);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: "An unexpected error occurred. Please try again.",
        error: "Error",
      }),
    );
  });

  it("should handle non-Error exceptions", () => {
    const exception = "String exception";

    filter.catch(exception, mockHost as never);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });

  it("should include timestamp in response", () => {
    const exception = new BadRequestException("Test");

    filter.catch(exception, mockHost as never);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        timestamp: expect.any(String),
      }),
    );
  });

  it("should include path in response", () => {
    mockRequest.url = "/api/users/123";
    const exception = new NotFoundException();

    filter.catch(exception, mockHost as never);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/users/123",
      }),
    );
  });

  it("should handle HttpException with object response", () => {
    const exception = new HttpException(
      { message: "Object message", error: "Custom Error" },
      HttpStatus.FORBIDDEN,
    );

    filter.catch(exception, mockHost as never);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Object message",
        error: "Custom Error",
      }),
    );
  });

  it("should handle HttpException with array message", () => {
    const exception = new HttpException(
      { message: ["Error 1", "Error 2"] },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, mockHost as never);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Error 1, Error 2",
      }),
    );
  });
});
