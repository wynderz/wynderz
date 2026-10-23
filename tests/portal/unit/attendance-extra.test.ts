import { describe, expect, it } from "vitest";
import { parseAttendanceRows, type AttendancePolicy } from "@/lib/portal/attendance-engine";

const policy: AttendancePolicy = {
  shiftStart: "09:30",
  graceMinutes: 10,
  halfDayMinHours: 4,
  fullDayMinHours: 8,
  punchPolicy: "first_last",
  duplicatePunchMinutes: 2,
  dayCutoff: "00:00",
  weeklyOffDays: [0],
};
const employees = [{ id: 1, name: "Pappu Prasad", employeeCode: "EMP-001", deviceUserId: "101" }];

describe("daily layout reversed times", () => {
  it("does not count a reversed in/out span as worked time", () => {
    const rows = [
      ["Code", "Date", "In", "Out"],
      ["EMP-001", "05/04/2026", "18:00", "09:00"],
    ];
    const r = parseAttendanceRows(
      rows,
      { sheet: "S", headerRow: 1, layout: "daily", employeeMatch: "employee_code", dateOrder: "auto", columns: { employee: 0, date: 1, inTime: 2, outTime: 3 } },
      employees,
      policy,
    );
    expect(r.daily[0].status).toBe("missing_punch");
    expect(r.daily[0].workedMinutes).toBeNull();
    expect(r.daily[0].firstIn).toBe("18:00:00");
    expect(r.issues.some((i) => i.message.includes("before in time"))).toBe(true);
  });
});
