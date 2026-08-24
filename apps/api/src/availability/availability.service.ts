import { prisma } from "../db.js";

export interface TimeSlot {
  startTime: string; // "09:00"
  endTime: string; // "09:30"
}

/**
 * Day-of-week mapping from JS Date.getDay() to our DayOfWeek enum.
 * Date.getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
 */
const DAY_MAP: Record<number, string> = {
  0: "SUNDAY",
  1: "MONDAY",
  2: "TUESDAY",
  3: "WEDNESDAY",
  4: "THURSDAY",
  5: "FRIDAY",
  6: "SATURDAY",
};

/**
 * Parse a date string "YYYY-MM-DD" into a Date object at midnight UTC.
 * We use UTC to avoid timezone shifts when storing @db.Date values.
 */
function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Convert "HH:mm" to total minutes since midnight for comparison.
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Convert total minutes since midnight back to "HH:mm".
 */
function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Generate all possible time slots from a working-hour window
 * given a consultation duration in minutes.
 */
function generateSlots(
  startTime: string,
  endTime: string,
  durationMin: number
): TimeSlot[] {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  const slots: TimeSlot[] = [];

  let current = startMinutes;
  while (current + durationMin <= endMinutes) {
    slots.push({
      startTime: minutesToTime(current),
      endTime: minutesToTime(current + durationMin),
    });
    current += durationMin;
  }

  return slots;
}

/**
 * Get available slots for a doctor on a given date.
 *
 * Algorithm:
 * 1. Get doctor's working hours for the requested day of week.
 * 2. Check if date falls within any doctor leave → return [] if yes.
 * 3. Generate all possible slots from working hours.
 * 4. Subtract slots occupied by CONFIRMED appointments.
 * 5. Subtract slots with active (non-expired) SlotHolds.
 * 6. Return remaining available slots.
 *
 * Timezone assumption: Dates are stored as @db.Date (date only, no time).
 * Slot times are stored as HH:mm strings. No timezone conversion is performed.
 */
export async function getAvailableSlots(
  doctorProfileId: string,
  dateStr: string
): Promise<TimeSlot[]> {
  const date = parseDateString(dateStr);
  const dayOfWeek = DAY_MAP[date.getUTCDay()];

  // 1. Get doctor profile for consultation duration
  const profile = await prisma.doctorProfile.findUnique({
    where: { id: doctorProfileId },
    select: { consultationDurationMin: true },
  });

  if (!profile) return [];

  // 2. Get working hours for this day
  const workingHour = await prisma.doctorWorkingHour.findFirst({
    where: {
      doctorProfileId,
      dayOfWeek: dayOfWeek as any,
      isActive: true,
    },
  });

  if (!workingHour) return [];

  // 3. Check for leave
  const leave = await prisma.doctorLeave.findFirst({
    where: {
      doctorProfileId,
      startDate: { lte: date },
      endDate: { gte: date },
    },
  });

  if (leave) return [];

  // 4. Generate all possible slots
  const allSlots = generateSlots(
    workingHour.startTime,
    workingHour.endTime,
    profile.consultationDurationMin
  );

  if (allSlots.length === 0) return [];

  // 5. Get confirmed appointments for this doctor on this date
  const confirmedAppointments = await prisma.appointment.findMany({
    where: {
      doctorProfileId,
      slotDate: date,
      status: "CONFIRMED",
    },
    select: { slotStartTime: true },
  });

  const bookedStartTimes = new Set(
    confirmedAppointments.map((a) => a.slotStartTime)
  );

  // 6. Get active slot holds (not expired)
  const now = new Date();
  const activeHolds = await prisma.slotHold.findMany({
    where: {
      doctorProfileId,
      slotDate: date,
      expiresAt: { gt: now },
    },
    select: { slotStartTime: true },
  });

  const heldStartTimes = new Set(activeHolds.map((h) => h.slotStartTime));

  // 7. Filter available slots
  return allSlots.filter(
    (slot) =>
      !bookedStartTimes.has(slot.startTime) &&
      !heldStartTimes.has(slot.startTime)
  );
}
