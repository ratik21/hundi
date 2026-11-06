import { expect, test } from "bun:test";
import { MAX_HOPS } from "./index";

test("MAX_HOPS is 4", () => {
  expect(MAX_HOPS).toBe(4);
});
