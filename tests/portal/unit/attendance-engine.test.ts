import { describe, expect, it } from "vitest";
import { mapStatusText, parseAttendanceRows, suggestMapping, summarizeDay, type AttendanceMapping, type AttendancePolicy } from "@/lib/portal/attendance-engine";
import { computeWorkedMinutes, defaultFinancialYear, fyStartYearFor, monthsBetween } from "@/lib/portal/dates";
import { parseDateCell, parseDateTimeCell, parseTimeCell } from "@/lib/portal/spreadsheet";

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

const employees = [
  { id: 1, name: "Pappu Prasad", employeeCode: "EMP-001", deviceUserId: "101" },
  { id: 2, name: "Manish Kumar", employeeCode: "EMP-002", deviceUserId: "102" },
  { id: 3, name: "Deepak", employeeCode: "EMP-003", deviceUserId: "103" },
];

describe("cell parsing", () => {
  it("parses common device date formats (day-first by default)", () => {
    expect(parseDateCell("05/04/2026")).toBe("2026-04-05");
    expect(parseDateCell("05/04/2026", "MDY")).toBe("2026-05-04");
    expect(parseDateCell("2026-04-05")).toBe("2026-04-05");
    expect(parseDateCell("5-Apr-2026")).toBe("2026-04-05");
    expect(parseDateCell(46117)).toBe("2026-04-05"); // Excel serial
    expect(parseDateCell("31/02/2026")).toBeNull();
    expect(parseDateCell("hello")).toBeNull();
  });

  it("parses times", () => {
    expect(parseTimeCell("09:05")).toBe(545);
    expect(parseTimeCell("9:05 PM")).toBe(21 * 60 + 5);
    expect(parseTimeCell("12:10 AM")).toBe(10);
    expect(parseTimeCell(0.5)).toBe(720);
    expect(parseTimeCell("25:00")).toBeNull();
  });

  it("parses combined punch timestamps", () => {
    expect(parseDateTimeCell("05/04/2026 09:12:33")).toEqual({ date: "2026-04-05", minutes: 552 });
    expect(parseDateTimeCell(new Date(Date.UTC(2026, 3, 5, 18, 2)))).toEqual({ date: "2026-04-05", minutes: 1082 });
  });
});

describe("day summary policy", () => {
  it("first/last punch, de-duplicates double scans, flags late", () => {
    const r = summarizeDay(1, "2026-04-06", [9 * 60 + 45, 9 * 60 + 46, 18 * 60 + 30], policy);
    expect(r.punchCount).toBe(2);
    expect(r.workedMinutes).toBe(525);
    expect(r.status).toBe("present");
    expect(r.isLate).toBe(true);
    expect(r.firstIn).toBe("09:45:00");
  });

  it("single punch is a missing punch, not a full day", () => {
    expect(summarizeDay(1, "2026-04-06", [570], policy).status).toBe("missing_punch");
  });

  it("half day and short day thresholds are configurable", () => {
    expect(summarizeDay(1, "d", [540, 540 + 300], policy).status).toBe("half_day");
    expect(summarizeDay(1, "d", [540, 540 + 120], policy).status).toBe("absent");
    expect(summarizeDay(1, "d", [540, 540 + 300], { ...policy, fullDayMinHours: 5 }).status).toBe("present");
  });

  it("pairs policy sums in/out pairs and flags odd punches", () => {
    const pairs = { ...policy, punchPolicy: "pairs" as const };
    expect(summarizeDay(1, "d", [540, 780, 840, 1080], pairs).workedMinutes).toBe(480);
    expect(summarizeDay(1, "d", [540, 780, 840], pairs).status).toBe("missing_punch");
  });

  it("maps device status codes", () => {
    expect(mapStatusText("P")).toBe("present");
    expect(mapStatusText("A")).toBe("absent");
    expect(mapStatusText("CL")).toBe("leave");
    expect(mapStatusText("weird")).toBeNull();
  });
});

describe("parseAttendanceRows", () => {
  const rows = [
    ["Biometric Export"],
    ["AC-No.", "Name", "Date Time", "Device"],
    ["101", "Pappu", "06/04/2026 09:20", "D1"],
    ["101", "Pappu", "06/04/2026 18:00", "D1"],
    ["101", "Pappu", "06/04/2026 18:00", "D1"], // in-file duplicate
    ["102", "Manish", "06/04/2026 09:50", "D1"],
    ["999", "Ghost", "06/04/2026 09:00", "D1"], // unmatched
    ["103", "Deepak", "not a date", "D1"], // error
    [null, null, null, null], // blank
  ];
  const mapping: AttendanceMapping = {
    sheet: "S",
    headerRow: 2,
    layout: "punches",
    employeeMatch: "device_user_id",
    dateOrder: "auto",
    columns: { employee: 0, dateTime: 2, deviceId: 3 },
  };

  it("matches employees, reports unmatched and invalid rows, never invents employees", () => {
    const r = parseAttendanceRows(rows, mapping, employees, policy);
    expect(r.punches).toHaveLength(3);
    expect(r.inFileDuplicates).toBe(1);
    expect([...r.unmatched.keys()]).toEqual(["999"]);
    expect(r.issues.filter((i) => i.level === "error")).toHaveLength(1);
    expect(r.skippedRows).toBe(1);
    expect(r.period).toEqual({ start: "2026-04-06", end: "2026-04-06" });
    const pappu = r.daily.find((d) => d.employeeId === 1)!;
    expect(pappu.status).toBe("present");
    expect(pappu.workedMinutes).toBe(520);
    expect(r.daily.find((d) => d.employeeId === 2)!.status).toBe("missing_punch");
  });

  it("supports daily in/out layouts with status columns", () => {
    const daily = [
      ["Emp Code", "Date", "In", "Out", "Status"],
      ["EMP-001", "2026-04-07", "09:00", "17:30", "P"],
      ["EMP-002", "2026-04-07", null, null, "CL"],
      ["EMP-002", "2026-04-07", null, null, "CL"],
    ];
    const r = parseAttendanceRows(
      daily,
      { sheet: "S", headerRow: 1, layout: "daily", employeeMatch: "employee_code", dateOrder: "auto", columns: { employee: 0, date: 1, inTime: 2, outTime: 3, status: 4 } },
      employees,
      policy,
    );
    expect(r.daily).toHaveLength(2);
    expect(r.daily[0].status).toBe("present");
    expect(r.daily[1].status).toBe("leave");
    expect(r.inFileDuplicates).toBe(1);
  });

  it("suggests mappings from common header names", () => {
    expect(suggestMapping(["AC-No.", "Name", "Date Time"]).dateTime).toBe(2);
    expect(suggestMapping(["Emp ID", "Date", "In Time", "Out Time"]).layout).toBe("daily");
  });
});

describe("dates", () => {
  it("uses the April–March Indian financial year", () => {
    expect(defaultFinancialYear(2026)).toEqual({ label: "FY 2026-27", startDate: "2026-04-01", endDate: "2027-03-31" });
    expect(fyStartYearFor("2027-03-31")).toBe(2026);
    expect(fyStartYearFor("2027-04-01")).toBe(2027);
    expect(monthsBetween("2026-04-01", "2027-03-31")).toHaveLength(12);
  });

  it("computes timesheet hours and rejects bad ranges (no overtime assumptions)", () => {
    expect(computeWorkedMinutes("09:00", "18:00", 60)).toBe(480);
    expect(() => computeWorkedMinutes("18:00", "09:00")).toThrow();
    expect(() => computeWorkedMinutes("09:00", "10:00", 90)).toThrow();
  });
});
