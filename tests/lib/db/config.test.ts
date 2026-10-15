import { describe, expect, it } from "vitest";
import {
  DataConfigError,
  describeDatabaseUrl,
  isLocalDatabaseUrl,
  resolveDataBackend,
} from "@/lib/db/config";

describe("data backend configuration", () => {
  it("uses the built-in demo data by default", () => {
    expect(resolveDataBackend({})).toEqual({ backend: "memory" });
    expect(resolveDataBackend({ DATA_BACKEND: " Memory " })).toEqual({ backend: "memory" });
    // A DATABASE_URL alone does not switch the backend.
    expect(resolveDataBackend({ DATABASE_URL: "postgres://localhost/x" })).toEqual({
      backend: "memory",
    });
  });

  it("selects PostgreSQL only explicitly, with a valid URL", () => {
    expect(
      resolveDataBackend({ DATA_BACKEND: "postgres", DATABASE_URL: "postgresql://u@localhost/db" }),
    ).toEqual({ backend: "postgres", databaseUrl: "postgresql://u@localhost/db" });
  });

  it("refuses missing or invalid settings instead of falling back to demo data", () => {
    expect(() => resolveDataBackend({ DATA_BACKEND: "postgres" })).toThrow(DataConfigError);
    expect(() => resolveDataBackend({ DATA_BACKEND: "postgres", DATABASE_URL: "  " })).toThrow(
      "requires DATABASE_URL",
    );
    expect(() =>
      resolveDataBackend({ DATA_BACKEND: "postgres", DATABASE_URL: "mysql://localhost/db" }),
    ).toThrow("postgres://");
    expect(() => resolveDataBackend({ DATA_BACKEND: "sqlite" })).toThrow(DataConfigError);
  });

  it("never puts the connection string or password in error messages", () => {
    const secret = "postgres://admin:s3cr3t-pass@db.example.com/prod";
    try {
      resolveDataBackend({ DATA_BACKEND: "postgresql", DATABASE_URL: secret });
    } catch (error) {
      expect(String(error)).not.toContain("s3cr3t-pass");
    }
    expect(describeDatabaseUrl(secret)).toBe("postgres://admin@db.example.com/prod");
  });

  it("recognizes local development databases only", () => {
    expect(isLocalDatabaseUrl("postgres://u@localhost:5432/dev")).toBe(true);
    expect(isLocalDatabaseUrl("postgres://u@127.0.0.1/dev")).toBe(true);
    expect(isLocalDatabaseUrl("postgres://u@[::1]/dev")).toBe(true);
    expect(isLocalDatabaseUrl("postgres://u@db.example.com/prod")).toBe(false);
    expect(isLocalDatabaseUrl("postgres://u@localhost.example.com/x")).toBe(false);
    expect(isLocalDatabaseUrl("not a url")).toBe(false);
  });
});
