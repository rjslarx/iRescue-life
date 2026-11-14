/**
 * Run: scripts/run-tests.sh tests/transport-dialog-lifetime.test.tsx
 * Mounts the actual private dialog from CollaborationHubPage with real React
 * Query mutations. UI primitives are lightweight DOM adapters; HTTP is deferred
 * and strictly allowlisted so these tests cannot send SMS or contact a server.
 */
import { afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import * as reactQuery from "@tanstack/react-query";
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true, window: dom.window, document: dom.window.document,
  navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement,
});
const { QueryClient, QueryClientProvider } = reactQuery;
let tenant: { id: string; twilioEnabled: boolean };
let trip: { id: string; name: string; status: string };
let open: boolean;
let root: Root;
let cache: InstanceType<typeof QueryClient>;
let Dialog: React.ComponentType<any>;
let toasts: any[];
type Pending = {
  path: string; tenantId: string; body: unknown;
  resolve: (body: unknown) => void; reject: (error: Error) => void;
};
let requests: Pending[];
const TabsContext = React.createContext({ value: "", set: (_: string) => {} });
function Tabs({ defaultValue, children }: any) {
  const [value, set] = React.useState(defaultValue);
  return <TabsContext.Provider value={{ value, set }}>{children}</TabsContext.Provider>;
}
const primitives = new Proxy({
  Tabs,
  TabsTrigger: ({ value, children, ...props }: any) => {
    const tabs = React.useContext(TabsContext);
    return <button {...props} onClick={() => tabs.set(value)}>{children}</button>;
  },
  TabsContent: ({ value, children }: any) => React.useContext(TabsContext).value === value ? children : null,
  Dialog: ({ open, onOpenChange, children }: any) => open
    ? <section role="dialog"><button onClick={() => onOpenChange(false)}>Close dialog</button>{children}</section> : null,
  AlertDialog: () => null,
  Button: ({ children, variant, size, ...props }: any) => <button {...props}>{children}</button>,
  Textarea: (props: any) => <textarea {...props} />,
  Input: (props: any) => <input {...props} />,
}, {
  get(target, name: string) {
    if (name in target) return target[name as keyof typeof target];
    const component = ({ children }: any) => <div>{children}</div>;
    Object.assign(target, { [name]: component });
    return component;
  },
});

before(async () => {
  const bundle = await build({
    entryPoints: ["client/src/pages/CollaborationHubPage.tsx"],
    bundle: true, platform: "node", format: "cjs", packages: "external",
    write: false, jsx: "automatic",
    plugins: [{
      name: "transport-test-boundaries",
      setup(b) {
        b.onLoad({ filter: /CollaborationHubPage\.tsx$/ }, args => ({
          // Export only in the test bundle; don't change the production surface.
          contents: readFileSync(args.path, "utf8") + "\nexport { TransportDetailDialog };",
          loader: "tsx",
        }));
        b.onResolve({ filter: /^@\/(components\/ui\/|contexts\/|hooks\/use-toast|lib\/queryClient|components\/DashboardLayout|components\/MedicalFileUploadDialog)/ },
          args => ({ path: args.path, external: true }));
      },
    }],
  });
  const nativeRequire = createRequire(import.meta.url);
  const injectedRequire = (name: string) => {
    if (name === "@tanstack/react-query") return reactQuery;
    if (name.startsWith("@/components/ui/")) return primitives;
    if (name === "@/contexts/TenantContext") return { useTenant: () => ({ tenant, basePath: `/${tenant.id}` }) };
    if (name === "@/contexts/AuthContext") return { useAuth: () => ({ user: { id: "staff" } }) };
    if (name === "@/hooks/use-toast") return { useToast: () => ({ toast: (value: any) => toasts.push(value) }) };
    if (name === "@/lib/queryClient") return {
      get queryClient() { return cache; },
      apiRequest: (method: string, path: string, body: unknown) => {
        assert.equal(method, "POST");
        assert.match(path, /^\/api\/transports\/trip-[ab]\/sms-broadcast$/);
        return new Promise((resolve, reject) => requests.push({
          path, body, tenantId: tenant.id, reject,
          resolve: data => resolve(new Response(JSON.stringify(data))),
        }));
      },
    };
    if (name === "@/components/DashboardLayout") return { default: () => null };
    if (name === "@/components/MedicalFileUploadDialog") return { MedicalFileUploadDialog: () => null };
    return nativeRequire(name);
  };
  const module = { exports: {} as any };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(injectedRequire, module, module.exports);
  Dialog = module.exports.TransportDetailDialog;
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  cache?.clear();
  document.body.replaceChildren();
});
const text = () => document.body.textContent || "";
const summary = () => document.querySelector('[data-testid="transport-broadcast-summary"]');
async function settle(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
  }
  assert.ok(check(), `UI did not settle: ${text()}`);
}
async function render() {
  await act(async () => root.render(<QueryClientProvider client={cache}>
    <Dialog transport={trip} open={open} onOpenChange={(value: boolean) => { open = value; void render(); }} />
  </QueryClientProvider>));
}
async function click(selector: string) {
  const button = document.querySelector<HTMLButtonElement>(selector);
  assert.ok(button, selector);
  await act(async () => button.click());
}
async function sms() { await click('[data-testid="tab-transport-sms"]'); }
async function setup() {
  tenant = { id: "rescue-a", twilioEnabled: true };
  trip = { id: "trip-a", name: "Trip A", status: "planning" };
  open = true; requests = []; toasts = [];
  cache = new QueryClient({ defaultOptions: {
    queries: { retry: false, staleTime: Infinity, gcTime: Infinity, queryFn: async ({ queryKey }) => {
      if (queryKey[0] === "/api/tenant") return { tenant: { subscriptionTier: "pro" } };
      if (queryKey[0] === "/api/users") return { users: [] };
      if (queryKey[2] === "timeline") return { events: [] };
      if (queryKey[0] === "/api/transport/events" && queryKey.length === 2)
        return { transport: { ...trip, smsSubscribers: ["+12025550199"] }, participants: [], updates: [] };
      throw new Error(`Unexpected query: ${JSON.stringify(queryKey)}`);
    } },
    mutations: { retry: false, gcTime: Infinity },
  } });
  const container = document.createElement("div");
  document.body.append(container); root = createRoot(container);
  await render(); await sms();
  await settle(() => text().includes("Send to 1 unique phone"));
}
async function send(message = "Arriving soon") {
  const input = document.querySelector<HTMLTextAreaElement>('[data-testid="input-sms-broadcast"]')!;
  assert.ok(input);
  await act(async () => Simulate.change(input, { target: { value: message } } as any));
  const before = requests.length;
  await click('[data-testid="button-send-broadcast"]');
  await settle(() => requests.length === before + 1);
  await settle(() => document.querySelector<HTMLButtonElement>('[data-testid="button-send-broadcast"]')!.disabled);
  assert.deepEqual(requests.at(-1)!.body, { message });
  return requests.at(-1)!;
}
const result = (number: string, error: string) => ({ results: [{ number, error, status: "failed" }] });
const oldNumber = "+12025550101";
const newNumber = "+12025550102";
function noOldDetails() {
  assert.doesNotMatch(text(), /\+12025550101|OLD PRIVATE FAILURE/);
}

for (const change of ["trip", "rescue", "reopen"] as const) {
  for (const completion of ["before", "after"] as const) {
    test(`${change}: old response completing ${completion} the new response cannot leak recipients`, async () => {
      await setup();
      const old = await send();
      assert.equal(old.path, "/api/transports/trip-a/sms-broadcast");
      if (change === "trip") trip = { ...trip, id: "trip-b", name: "Trip B" };
      if (change === "rescue") tenant = { ...tenant, id: "rescue-b" }; // Same trip ID isolates tenant lifetime.
      if (change === "reopen") {
        await click('[role="dialog"] > button');
        assert.equal(document.querySelector('[role="dialog"]'), null);
        open = true;
      }
      await render(); await sms();
      assert.equal(summary(), null);
      noOldDetails();
      const current = await send("Current context update");
      assert.equal(current.path, `/api/transports/${trip.id}/sms-broadcast`);
      assert.equal(current.tenantId, tenant.id);
      if (completion === "before") {
        await act(async () => old.resolve(result(oldNumber, "OLD PRIVATE FAILURE")));
        await settle(() => cache.getMutationCache().getAll()[0].state.status === "success");
        assert.equal(summary(), null);
        noOldDetails();
      }
      await act(async () => current.resolve(result(newNumber, "CURRENT FAILURE")));
      await settle(() => !!summary()?.textContent?.includes(newNumber));
      if (completion === "after") {
        await act(async () => old.resolve(result(oldNumber, "OLD PRIVATE FAILURE")));
        await settle(() => cache.getMutationCache().getAll()[0].state.status === "success");
      }
      noOldDetails();
      assert.match(summary()!.textContent!, /CURRENT FAILURE/);
      assert.equal(requests.length, 2, "Context changes must not resend messages");
    });
  }
}

test("a result resolved while closed is not shown on reopening", async () => {
  await setup();
  const pending = await send();
  await click('[role="dialog"] > button');
  await act(async () => pending.resolve(result(oldNumber, "OLD PRIVATE FAILURE")));
  await settle(() => cache.getMutationCache().getAll()[0].state.status === "success");
  open = true; await render(); await sms();
  assert.equal(summary(), null); noOldDetails();
  assert.equal(requests.length, 1);
});

test("request failures keep explicit no-resend guidance without retrying", async () => {
  await setup();
  const pending = await send();
  await act(async () => pending.reject(new Error("Connection lost")));
  await settle(() => !!summary());
  assert.match(summary()!.textContent!, /outcome uncertain/);
  assert.match(summary()!.textContent!, /Do not resend this broadcast/);
  assert.match(summary()!.textContent!, /SMS logs and provider records/);
  assert.doesNotMatch(summary()!.textContent!, /try again|retry/i);
  assert.match(toasts.at(-1).description, /Do not resend/);
  assert.equal(requests.length, 1);
});

test("an old request failure cannot replace the new rescue's recipient results", async () => {
  await setup();
  const old = await send();
  tenant = { ...tenant, id: "rescue-b" };
  await render(); await sms();
  const current = await send();
  await act(async () => current.resolve(result(newNumber, "CURRENT FAILURE")));
  await settle(() => !!summary()?.textContent?.includes(newNumber));
  await act(async () => old.reject(new Error("OLD PRIVATE FAILURE")));
  await settle(() => cache.getMutationCache().getAll()[0].state.status === "error");
  noOldDetails();
  assert.match(summary()!.textContent!, /CURRENT FAILURE/);
  assert.doesNotMatch(summary()!.textContent!, /Recipient results could not be confirmed/);
  assert.equal(requests.length, 2);
});
