import { describe, expect, it } from "vitest";
import { extractFirstGitUrl } from "./read-git-remote";

describe("git.txt url extraction", () => {
  it("extracts https github remotes", () => {
    expect(extractFirstGitUrl("repo: https://github.com/J-Pantaroto/Sparta.git")).toBe(
      "https://github.com/J-Pantaroto/Sparta.git"
    );
  });

  it("extracts ssh github remotes", () => {
    expect(extractFirstGitUrl("git@github.com:J-Pantaroto/Sparta.git")).toBe("git@github.com:J-Pantaroto/Sparta.git");
  });
});
