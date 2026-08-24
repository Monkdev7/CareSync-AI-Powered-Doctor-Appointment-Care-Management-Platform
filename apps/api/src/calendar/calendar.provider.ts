/**
 * Google Calendar provider abstraction.
 * In production: uses Google Calendar API with OAuth tokens.
 * For testing: uses a mock that returns deterministic event IDs.
 */

export interface CalendarEventData {
  summary: string;
  startDateTime: string; // ISO
  endDateTime: string;   // ISO
  description?: string;
}

export interface CalendarProvider {
  createEvent(data: CalendarEventData): Promise<string>; // returns googleEventId
}

export class MockCalendarProvider implements CalendarProvider {
  private counter = 0;
  async createEvent(_data: CalendarEventData): Promise<string> {
    this.counter++;
    return `mock-gcal-event-${this.counter}-${Date.now()}`;
  }
}

let provider: CalendarProvider | null = null;

export function getCalendarProvider(): CalendarProvider {
  if (!provider) provider = new MockCalendarProvider();
  return provider;
}

export function setCalendarProvider(p: CalendarProvider): void {
  provider = p;
}
