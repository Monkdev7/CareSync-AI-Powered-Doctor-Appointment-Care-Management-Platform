import type { CalendarProvider, CalendarEventData } from "./calendar.provider.js";

/**
 * Google Calendar API provider using OAuth 2.0.
 * Creates events via the Google Calendar REST API.
 * Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and a valid access token.
 *
 * For the screening project: This implementation demonstrates the integration pattern.
 * In production, token management (refresh, storage) would use the CalendarConnection model.
 */
export class GoogleCalendarProvider implements CalendarProvider {
  private accessToken: string;
  private calendarId: string;

  constructor(accessToken: string, calendarId = "primary") {
    this.accessToken = accessToken;
    this.calendarId = calendarId;
  }

  async createEvent(data: CalendarEventData): Promise<string> {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: data.summary,
          description: data.description,
          start: { dateTime: data.startDateTime, timeZone: "UTC" },
          end: { dateTime: data.endDateTime, timeZone: "UTC" },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Google Calendar API error: ${response.status} - ${err}`);
    }

    const event = (await response.json()) as { id: string };
    return event.id;
  }

  async deleteEvent(googleEventId: string): Promise<void> {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(googleEventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.accessToken}` },
      }
    );

    if (!response.ok && response.status !== 404) {
      throw new Error(`Google Calendar delete error: ${response.status}`);
    }
  }
}
