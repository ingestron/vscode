// Show generated files, when plan would stop: one line that says where the problems are.
import { describe, expect, it } from "vitest";
import { stoppedMessage } from "../src/features/stopped.js";

describe("the message when nothing is generated", () => {
  it("names the environments with problems, and says to run Plan", () => {
    expect(
      stoppedMessage(
        "prod: the definitions have problems\nproject.yaml:8:5  error  DEPLOY_VALUE\n  …",
      ),
    ).toBe("Nothing is generated while plan would stop: prod has problems. Run Plan to see them.");
    expect(stoppedMessage("dev, prod: the definitions have problems\n…")).toBe(
      "Nothing is generated while plan would stop: dev, prod have problems. Run Plan to see them.",
    );
  });

  it("gives a diagnostic's sentence, not its code line", () => {
    const refused = [
      "project.yaml:1:1  error  PACK_LOAD",
      '  The pack "broken" lists the platform field "schedule.nowhere", which the Platform document does not have.',
      "  This is a mistake in the pack, not in the project.",
    ].join("\n");
    expect(stoppedMessage(refused)).toBe(
      'Nothing is generated: The pack "broken" lists the platform field "schedule.nowhere", which the Platform document does not have.',
    );
  });
});
