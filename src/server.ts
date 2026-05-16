import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { recheckDomains } from "./server/cron/domain-recheck";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => ((m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry)),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isCatastrophicSsrErrorBody(body: string, responseStatus: number): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return false;
  }

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return false;
  }

  const fields = payload as Record<string, unknown>;
  const expectedKeys = new Set(["message", "status", "unhandled"]);
  if (!Object.keys(fields).every((key) => expectedKeys.has(key))) {
    return false;
  }

  return (
    fields.unhandled === true &&
    fields.message === "HTTPError" &&
    (fields.status === undefined || fields.status === responseStatus)
  );
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isCatastrophicSsrErrorBody(body, response.status)) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return brandedErrorResponse();
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },

  /**
   * Cloudflare Workers scheduled (cron) handler.
   *
   * Wired to run every 10 minutes via `wrangler.jsonc` triggers.crons.
   * Invokes the domain re-check worker to verify pending custom domains
   * and mark stale ones as failed.
   *
   * Requirements: 8.9
   */
  async scheduled(
    event: ScheduledEvent,
    env: unknown,
    ctx: ExecutionContext,
  ): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[cron] domain-recheck triggered at ${new Date(event.scheduledTime).toISOString()}`);
    
    try {
      await recheckDomains();
      // eslint-disable-next-line no-console
      console.log("[cron] domain-recheck completed successfully");
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("[cron] domain-recheck failed", error);
      // Don't throw — let the cron tick complete so the next one can retry
    }
  },
};

/**
 * Cloudflare Workers types for the scheduled handler.
 * These are provided by @cloudflare/workers-types but declared inline
 * here to avoid adding a dev dependency just for two interfaces.
 */
interface ScheduledEvent {
  scheduledTime: number;
  cron: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
