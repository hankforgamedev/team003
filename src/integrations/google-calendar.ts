import type {
  PipelineDocument,
  PipelineDocumentSink,
  SyncStateStore,
} from './types.js';

export interface AccessTokenProvider {
  getAccessToken(): Promise<string>;
}

export interface GoogleOAuthRefreshTokenOptions {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetch?: typeof globalThis.fetch;
}

export interface GoogleCalendarEventDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

export interface GoogleCalendarPerson {
  email?: string;
  displayName?: string;
  responseStatus?: string;
  organizer?: boolean;
  self?: boolean;
}

export interface GoogleCalendarEvent {
  id?: string;
  iCalUID?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  created?: string;
  updated?: string;
  start?: GoogleCalendarEventDateTime;
  end?: GoogleCalendarEventDateTime;
  attendees?: GoogleCalendarPerson[];
  organizer?: GoogleCalendarPerson;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string; label?: string }>;
  };
}

export interface GoogleCalendarEventsPage {
  items?: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export interface GoogleCalendarListOptions {
  calendarId: string;
  syncToken?: string;
  pageToken?: string;
  /** 只用於第一次全量同步；Google 禁止和 syncToken 一起送。 */
  initialTimeMin?: string;
}

export interface GoogleCalendarEventsClient {
  listEvents(options: GoogleCalendarListOptions): Promise<GoogleCalendarEventsPage>;
}

export interface GoogleCalendarSyncOptions {
  client: GoogleCalendarEventsClient;
  sink: PipelineDocumentSink;
  calendarId: string;
  syncToken?: string;
  initialTimeMin?: string;
}

export interface GoogleCalendarSyncResult {
  processed: number;
  nextSyncToken: string;
  fullSync: boolean;
}

export interface GoogleCalendarSyncHandlerOptions
  extends Omit<GoogleCalendarSyncOptions, 'syncToken'> {
  stateStore: SyncStateStore;
  stateKey?: string;
}

export class GoogleCalendarSyncTokenExpiredError extends Error {
  constructor() {
    super('Google Calendar syncToken 已失效，需要重新全量同步');
    this.name = 'GoogleCalendarSyncTokenExpiredError';
  }
}

/** 用 refresh token 換短效 access token，並在記憶體快取到到期前一分鐘。 */
export class GoogleOAuthRefreshTokenProvider implements AccessTokenProvider {
  private readonly fetcher: typeof globalThis.fetch;
  private cached: { token: string; expiresAt: number } | undefined;

  constructor(private readonly options: GoogleOAuthRefreshTokenOptions) {
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  async getAccessToken(): Promise<string> {
    if (this.cached && this.cached.expiresAt > Date.now() + 60_000) {
      return this.cached.token;
    }

    const response = await this.fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        refresh_token: this.options.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };

    if (!response.ok || !payload.access_token) {
      throw new Error(
        `Google OAuth 更新 access token 失敗（${response.status}）：${payload.error_description ?? payload.error ?? 'unknown error'}`,
      );
    }

    this.cached = {
      token: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    };
    return this.cached.token;
  }
}

export class GoogleCalendarApiClient implements GoogleCalendarEventsClient {
  private readonly fetcher: typeof globalThis.fetch;

  constructor(
    private readonly tokenProvider: AccessTokenProvider,
    fetcher: typeof globalThis.fetch = globalThis.fetch,
  ) {
    this.fetcher = fetcher;
  }

  async listEvents(
    options: GoogleCalendarListOptions,
  ): Promise<GoogleCalendarEventsPage> {
    if (options.syncToken && options.initialTimeMin) {
      throw new Error('initialTimeMin 不可與 syncToken 同時使用');
    }

    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(options.calendarId)}/events`,
    );
    url.searchParams.set('maxResults', '2500');
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('showDeleted', 'true');
    if (options.syncToken) url.searchParams.set('syncToken', options.syncToken);
    if (options.pageToken) url.searchParams.set('pageToken', options.pageToken);
    if (!options.syncToken && options.initialTimeMin) {
      url.searchParams.set('timeMin', options.initialTimeMin);
    }

    const response = await this.fetcher(url, {
      headers: { authorization: `Bearer ${await this.tokenProvider.getAccessToken()}` },
    });
    if (response.status === 410) throw new GoogleCalendarSyncTokenExpiredError();
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Google Calendar events.list 失敗（${response.status}）：${detail}`);
    }
    return (await response.json()) as GoogleCalendarEventsPage;
  }
}

export function googleCalendarEventToDocument(
  event: GoogleCalendarEvent,
  calendarId: string,
): PipelineDocument {
  const externalId = event.id ?? event.iCalUID;
  if (!externalId) throw new Error('Google Calendar event 缺少 id');
  const occurredAt = event.updated ?? event.created ?? new Date().toISOString();
  const cancelled = event.status === 'cancelled';
  const attendees = event.attendees ?? [];

  const lines = [
    `- 狀態：${event.status ?? 'confirmed'}`,
    `- 開始：${renderDateTime(event.start)}`,
    `- 結束：${renderDateTime(event.end)}`,
    event.location ? `- 地點：${event.location}` : null,
    event.organizer ? `- 建立者：${renderPerson(event.organizer)}` : null,
    event.hangoutLink ? `- Google Meet：${event.hangoutLink}` : null,
    ...conferenceLinks(event).map((link) => `- 會議連結：${link}`),
    event.htmlLink ? `- Calendar：${event.htmlLink}` : null,
    '',
    event.description ? `## 說明\n${event.description}` : null,
    attendees.length > 0
      ? `## 參與者\n${attendees.map((person) => `- ${renderPerson(person)}${person.responseStatus ? `（${person.responseStatus}）` : ''}`).join('\n')}`
      : null,
  ].filter((line): line is string => line !== null);

  return {
    source: 'google-calendar',
    externalId,
    subjectId: calendarId,
    occurredAt,
    title: cancelled
      ? `已取消｜${event.summary ?? externalId}`
      : `Google Calendar｜${event.summary ?? '未命名行程'}`,
    body: lines.join('\n').trim(),
    deleted: cancelled,
    metadata: {
      channel: 'google-calendar',
      calendar_id: calendarId,
      event_id: externalId,
      ical_uid: event.iCalUID ?? null,
      status: event.status ?? 'confirmed',
      attendee_count: attendees.length,
      start: event.start?.dateTime ?? event.start?.date ?? null,
      end: event.end?.dateTime ?? event.end?.date ?? null,
    },
  };
}

/** 分頁跑完才回傳 nextSyncToken；呼叫端必須在所有文件寫成功後才保存它。 */
export async function syncGoogleCalendar(
  options: GoogleCalendarSyncOptions,
): Promise<GoogleCalendarSyncResult> {
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  let processed = 0;

  do {
    const page = await options.client.listEvents({
      calendarId: options.calendarId,
      ...(options.syncToken ? { syncToken: options.syncToken } : {}),
      ...(pageToken ? { pageToken } : {}),
      ...(!options.syncToken && options.initialTimeMin
        ? { initialTimeMin: options.initialTimeMin }
        : {}),
    });

    for (const event of page.items ?? []) {
      await options.sink.write(
        googleCalendarEventToDocument(event, options.calendarId),
      );
      processed += 1;
    }

    pageToken = page.nextPageToken;
    nextSyncToken = page.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  if (!nextSyncToken) {
    throw new Error('Google Calendar 最後一頁未回傳 nextSyncToken');
  }

  return { processed, nextSyncToken, fullSync: !options.syncToken };
}

/** EventBridge 可直接呼叫這個 handler；410 時自動丟棄舊 token 並重跑全量同步。 */
export function createGoogleCalendarSyncHandler(
  options: GoogleCalendarSyncHandlerOptions,
) {
  const stateKey = options.stateKey ?? `google-calendar-${options.calendarId}`;

  return async (): Promise<GoogleCalendarSyncResult> => {
    const syncToken = await options.stateStore.get(stateKey);
    let result: GoogleCalendarSyncResult;
    try {
      result = await syncGoogleCalendar({ ...options, syncToken });
    } catch (error) {
      if (!(error instanceof GoogleCalendarSyncTokenExpiredError)) throw error;
      result = await syncGoogleCalendar({
        ...options,
        syncToken: undefined,
      });
    }
    await options.stateStore.set(stateKey, result.nextSyncToken);
    return result;
  };
}

function renderDateTime(value?: GoogleCalendarEventDateTime): string {
  if (!value) return '未提供';
  const raw = value.dateTime ?? value.date ?? '未提供';
  return value.timeZone ? `${raw}（${value.timeZone}）` : raw;
}

function renderPerson(person: GoogleCalendarPerson): string {
  const label = person.displayName ?? person.email ?? '未知參與者';
  return person.displayName && person.email ? `${person.displayName} <${person.email}>` : label;
}

function conferenceLinks(event: GoogleCalendarEvent): string[] {
  return (event.conferenceData?.entryPoints ?? [])
    .map((entry) => entry.uri)
    .filter((uri): uri is string => Boolean(uri && uri !== event.hangoutLink));
}
