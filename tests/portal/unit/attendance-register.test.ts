import { describe, expect, it } from "vitest";
import { classifyRegisterMark, findRegisterBlocks, parseRegister, type EmployeeRef } from "@/lib/portal/attendance-engine";
import type { Cell, Sheet } from "@/lib/portal/spreadsheet";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const time = (hhmm: string) => new Date(`1899-12-30T${hhmm}:00Z`);

const emps: EmployeeRef[] = [
  { id: 1, name: "Arun Kumar", employeeCode: "EMP-001", deviceUserId: null },
  { id: 2, name: "Bala Singh", employeeCode: "EMP-002", deviceUserId: "BALAJI" },
  { id: 3, name: "Chitra", employeeCode: "EMP-003", deviceUserId: null },
  { id: 4, name: "Dev Raj", employeeCode: "EMP-004", deviceUserId: null, joiningDate: "2026-03-04" },
];

/** March register: title, DATE header, a blank column between names, and an over-time block on the right. */
function marchSheet(): Sheet {
  const T = "MARCH ATTENDENCE";
  const OT = "MARCH ATTENDENCE (over time)";
  const rows: Cell[][] = [
    [T, T, T, T, T, T, null, OT, OT, OT],
    ["DATE", "ARUN", "BALAJI", null, "Chitra", "DEV", null, "DATE", "ARUN", "BALAJI"],
    [d("2026-03-01"), "HOLI", "HOLI", null, "HOLI", "HOLI", null, d("2026-03-01"), null, null],
    [d("2026-03-02"), "P", "p", null, "ABSENT", null, null, d("2026-03-02"), "OVER TIME UPTO 9 PM (PACKING)", time("11:40")],
    [d("2026-03-03"), "TUESDAY HOLIDAY", "TUESDAY HOLIDAY", null, "TUESDAY HOLIDAY", "TUESDAY HOLIDAY", null, d("2026-03-03"), "TUESDAY HOLIDAY", null],
    [d("2026-03-04"), "P(site visit)", "P", null, "p", "P", null, d("2026-03-04"), null, null],
    [d("2026-03-05"), "half day", "leave", null, "y.[]79*-", "P", null, d("2026-03-05"), "ABSENT", null],
    [d("2026-03-06"), "P", "P", null, "P", "P", null, d("2026-03-06"), null, null],
  ];
  return { name: "MARCH", rows };
}

const find = (p: ReturnType<typeof parseRegister>, emp: number, date: string) => p.daily.find((x) => x.employeeId === emp && x.workDate === date);

describe("findRegisterBlocks", () => {
  it("finds the DATE header, employee columns across a single blank gap, and the over-time block", () => {
    const blocks = findRegisterBlocks(marchSheet());
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ headerRow: 2, dateCol: 0, overtime: false, title: "MARCH ATTENDENCE" });
    expect(blocks[0].names.map((n) => n.name)).toEqual(["ARUN", "BALAJI", "Chitra", "DEV"]);
    expect(blocks[1]).toMatchObject({ dateCol: 7, overtime: true });
    expect(blocks[1].names.map((n) => n.name)).toEqual(["ARUN", "BALAJI"]);
  });

  it("ignores columns before DATE (S.NO, TIME) and stops at two blank columns", () => {
    const sheet: Sheet = { name: "S", rows: [["S.NO", "TIME", "DATE", "ARUN", "Chitra", null, null, "JUNK"]] };
    expect(findRegisterBlocks(sheet)[0].names.map((n) => n.name)).toEqual(["ARUN", "Chitra"]);
  });
});

describe("classifyRegisterMark", () => {
  it.each<[Cell, string, string | null]>([
    ["P", "present", null],
    ["p", "present", null],
    ["P(mumbai TRIP)", "present", "mumbai TRIP"],
    ["ABSENT", "absent", null],
    ["A", "absent", null],
    ["half day", "half_day", null],
    ["TUESDAY HOLIDAY", "weekly_off", "TUESDAY HOLIDAY"],
    ["TUE", "weekly_off", "TUE"],
    ["Sunday - (Holiday Preponed from Tuesday to Sunday)", "weekly_off", "Sunday - (Holiday Preponed from Tuesday to Sunday)"],
    ["DIWALI", "holiday", "DIWALI"],
    ["Gandhi jayanti", "holiday", "Gandhi jayanti"],
  ])("%j → %s", (cell, status, note) => {
    const m = classifyRegisterMark(cell);
    expect(m).toMatchObject({ kind: "status", status });
    if (m.kind === "status") expect(m.note).toBe(note);
  });

  it("treats blanks as no record and junk as unknown", () => {
    expect(classifyRegisterMark(null)).toEqual({ kind: "blank" });
    expect(classifyRegisterMark("  ")).toEqual({ kind: "blank" });
    expect(classifyRegisterMark("843").kind).toBe("unknown");
  });
});

describe("parseRegister", () => {
  const p = parseRegister([marchSheet()], "MARCH", emps);

  it("reads per-person marks", () => {
    expect(find(p, 1, "2026-03-02")?.status).toBe("present");
    expect(find(p, 2, "2026-03-02")?.status).toBe("present");
    expect(find(p, 3, "2026-03-02")?.status).toBe("absent");
    expect(find(p, 1, "2026-03-04")).toMatchObject({ status: "present", notes: "site visit" });
    expect(find(p, 1, "2026-03-05")?.status).toBe("half_day");
    expect(find(p, 2, "2026-03-05")?.status).toBe("leave");
    expect(p.period).toEqual({ start: "2026-03-01", end: "2026-03-06" });
  });

  it("applies day-wide holidays and weekly offs only within each person's working span", () => {
    expect(find(p, 1, "2026-03-01")).toMatchObject({ status: "holiday", notes: "HOLI" });
    expect(find(p, 3, "2026-03-03")).toMatchObject({ status: "weekly_off", notes: "TUESDAY HOLIDAY" });
    // Dev joined on the 4th (first mark that day): no paid holiday or weekly off before joining.
    expect(find(p, 4, "2026-03-01")).toBeUndefined();
    expect(find(p, 4, "2026-03-03")).toBeUndefined();
    expect(find(p, 4, "2026-03-04")?.status).toBe("present");
  });

  it("attaches over-time notes (text or a time) to that day's record, ignoring ABSENT/holiday cells", () => {
    expect(find(p, 1, "2026-03-02")?.notes).toBe("OT: OVER TIME UPTO 9 PM (PACKING)");
    expect(find(p, 2, "2026-03-02")?.notes).toBe("OT: 11:40");
    expect(find(p, 1, "2026-03-03")?.notes).toBe("TUESDAY HOLIDAY");
    expect(find(p, 1, "2026-03-05")?.notes).toBeNull();
  });

  it("matches by device user ID, full name, then unique first name (with a warning)", () => {
    expect(find(p, 2, "2026-03-04")).toBeDefined(); // BALAJI = Bala Singh's device user ID
    expect(find(p, 3, "2026-03-04")).toBeDefined(); // Chitra = full name
    expect(p.issues.some((i) => i.level === "warning" && i.message.includes('"ARUN" matched to Arun Kumar by first name'))).toBe(true);
    expect(p.unmatched.size).toBe(0);
  });

  it("warns about unrecognised marks and skips them", () => {
    expect(find(p, 3, "2026-03-05")).toBeUndefined();
    expect(p.issues.some((i) => i.message.includes('unrecognised mark "y.[]79*-"'))).toBe(true);
  });

  it("reports unmatched and ambiguous header names instead of guessing", () => {
    const twins: EmployeeRef[] = [...emps, { id: 9, name: "Arun Prakash", employeeCode: "EMP-009", deviceUserId: null }];
    const q = parseRegister([marchSheet()], "MARCH", twins.filter((e) => e.id !== 3));
    expect([...q.ambiguous]).toContain("ARUN");
    expect(q.unmatched.get("Chitra")).toBe(3); // ABSENT + p + P (the junk cell is not a mark)
    expect(q.issues.some((i) => i.level === "error" && i.message.includes('"ARUN" matches more than one employee'))).toBe(true);
  });

  it('reads every register sheet with "*", keeping the first copy of a day that appears twice', () => {
    const copy = { ...marchSheet(), name: "COPY" };
    const all = parseRegister([marchSheet(), copy], "*", emps);
    expect(all.daily.length).toBe(p.daily.length);
    expect(all.inFileDuplicates).toBe(p.daily.length);
    expect(all.issues.some((i) => i.message.includes("appear in more than one block or sheet"))).toBe(true);
  });

  it("errors when the file has no register", () => {
    const none = parseRegister([{ name: "X", rows: [["Name", "Time"], ["A", "09:00"]] }], "*", emps);
    expect(none.daily).toHaveLength(0);
    expect(none.issues.some((i) => i.level === "error" && i.message.includes("No attendance register found"))).toBe(true);
  });

  it("never marks people outside their joining/exit dates for day-wide holidays", () => {
    const left = emps.map((e) => (e.id === 3 ? { ...e, exitDate: "2026-03-02" } : e));
    const q = parseRegister([marchSheet()], "MARCH", left);
    expect(find(q, 3, "2026-03-03")).toBeUndefined();
  });
});
