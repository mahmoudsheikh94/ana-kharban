import { describe, expect, it } from "vitest";
import { inferJordanArea } from "../jordan";

describe("Jordan geocoding helper", () => {
  it("infers the nearest configured Jordan city from coordinates", () => {
    expect(inferJordanArea(31.9539, 35.9106)).toMatchObject({
      city: "عمان"
    });
  });
});
