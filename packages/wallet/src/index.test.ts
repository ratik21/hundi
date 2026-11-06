import { expect, test } from "bun:test";
import { WALLET_VERSION } from "./index";

test("wallet version is set", () => {
  expect(WALLET_VERSION).toBe(1);
});
