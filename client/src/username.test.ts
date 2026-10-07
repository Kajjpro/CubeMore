import { describe, expect, it } from "vitest";
import { suggestUsername, usernameProblem } from "./username";

describe("usernames", () => {
  it("4 to 20 letters, numbers or _", () => {
    expect(usernameProblem("anar_2")).toBeNull();
    expect(usernameProblem("ana")).toMatch(/at least/i);
    expect(usernameProblem("a".repeat(21))).toMatch(/at most/i);
    expect(usernameProblem("anar b")).toMatch(/only/i);
    expect(usernameProblem("анар")).toMatch(/only/i);
  });

  it("suggests one from the name or the email", () => {
    expect(suggestUsername(["Anar B.", "x@y.z"])).toBe("anarb");
    expect(suggestUsername([null, "khulan.t@gmail.com"])).toBe("khulant");
    expect(suggestUsername(["Bo", "bo@x.io"])).toBe(""); // too short either way
    expect(suggestUsername(["Zoë Ann"])).toBe("zoeann");
  });
});
