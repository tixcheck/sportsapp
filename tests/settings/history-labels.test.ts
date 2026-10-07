import { describe, expect, it } from "vitest";

import {
  describeChange,
  fieldLabel,
  formatSettingValue,
} from "@/lib/settings/history-labels";

const TZ = "America/Toronto";

describe("describeChange", () => {
  it("a moved deadline reads in the league's own time", () => {
    expect(
      describeChange(
        {
          field: "registration_deadline",
          oldValue: "2026-10-04T03:59:59.999+00:00",
          newValue: "2026-10-11T03:59:59.999+00:00",
        },
        TZ,
      ),
    ).toBe("Registration deadline: Sat Oct 3, 11:59 PM → Sat Oct 10, 11:59 PM");
  });

  it("money in dollars, switches as open/closed or on/off", () => {
    expect(
      describeChange(
        { field: "registration_fee_cents", oldValue: 8000, newValue: 9000 },
        TZ,
      ),
    ).toBe("Registration fee: $80.00 → $90.00");
    expect(
      describeChange(
        { field: "registration_open", oldValue: true, newValue: false },
        TZ,
      ),
    ).toBe("Registration: open → closed");
    expect(
      describeChange(
        { field: "allow_split_payment", oldValue: false, newValue: true },
        TZ,
      ),
    ).toBe("Players can split the fee: off → on");
  });

  it("a waiver reads as required or removed", () => {
    expect(
      describeChange(
        { field: "waiver_id", oldValue: null, newValue: "w1" },
        TZ,
      ),
    ).toBe("Waiver required");
    expect(
      describeChange(
        { field: "waiver_id", oldValue: "w1", newValue: null },
        TZ,
      ),
    ).toBe("Waiver removed");
  });

  it("no cap reads as none", () => {
    expect(
      describeChange({ field: "max_teams", oldValue: null, newValue: 24 }, TZ),
    ).toBe("Maximum teams: none → 24");
  });

  it("skipped dates as a short list", () => {
    expect(
      formatSettingValue("blackout_dates", ["2026-10-27", "2026-12-22"], TZ),
    ).toBe("Oct 27, Dec 22");
  });

  it("an unknown field still says something", () => {
    expect(fieldLabel("some_new_field")).toBe("some new field");
  });
});
