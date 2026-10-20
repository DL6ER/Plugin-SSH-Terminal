import { describe, expect, it } from "vitest";
import { SHELL_CWD_COMMAND } from "../../src/backend/shell-cwd.js";

describe("SHELL_CWD_COMMAND", () => {
  it("runs under sh so any login shell can start it", () => {
    expect(SHELL_CWD_COMMAND.startsWith("sh -c '")).toBe(true);
    expect(SHELL_CWD_COMMAND.endsWith("pwd'")).toBe(true);
  });

  it("keeps single quotes only as escaped pairs around the awk program", () => {
    const body = SHELL_CWD_COMMAND.slice(7, -1);
    expect(body.replace(/'\\''/g, "")).not.toContain("'");
  });

  it("matches the shell by SSH_CONNECTION first, then /proc, then ps", () => {
    const c = SHELL_CWD_COMMAND;
    expect(c).toContain("SSH_CONNECTION=$SSH_CONNECTION");
    expect(c).toContain("/proc/[0-9]*/stat");
    expect(c).toContain('readlink "/proc/$c/cwd"');
    expect(c.indexOf("SSH_CONNECTION=$SSH_CONNECTION")).toBeLessThan(
      c.indexOf("/proc/[0-9]*/stat"),
    );
    expect(c.indexOf("/proc/[0-9]*/stat")).toBeLessThan(c.indexOf("ps -o"));
  });

  it("feeds awk through cat so a process that vanishes cannot stop it", () => {
    expect(SHELL_CWD_COMMAND).toContain("cat /proc/[0-9]*/stat");
  });
});
