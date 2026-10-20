import { describe, expect, it } from "vitest";
import {
  DEFAULT_PANEL_SETTINGS,
  readPanelSettings,
} from "../../../src/frontend/terminal/panel-settings";

const hostWith = (values: Record<string, unknown>) => ({
  pluginSettings: { "ssh-terminal": values },
});

describe("readPanelSettings", () => {
  it("falls back to defaults", () => {
    expect(readPanelSettings({})).toEqual(DEFAULT_PANEL_SETTINGS);
    expect(readPanelSettings(null)).toEqual(DEFAULT_PANEL_SETTINGS);
  });

  it("reads saved values", () => {
    expect(
      readPanelSettings(
        hostWith({
          enableTerminalPanels: false,
          terminalPanelSide: "bottom",
          terminalPanelButtons: { order: ["b", "a"], hidden: ["c"] },
        }),
      ),
    ).toEqual({
      enabled: false,
      side: "bottom",
      buttons: { order: ["b", "a"], hidden: ["c"] },
    });
  });

  it("ignores an unknown side", () => {
    expect(readPanelSettings(hostWith({ terminalPanelSide: "up" })).side).toBe(
      "right",
    );
  });
});
