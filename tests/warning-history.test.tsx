import { before, test } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { warningResolution, warningHistoryDisplay } from "../shared/warning-history";
let RecentlyWarnedRow: typeof import("../client/src/components/compliance/HeartwormWatchTab").RecentlyWarnedRow;
before(async () => {
  const bundle = await build({
    stdin: { contents: 'export { RecentlyWarnedRow } from "./client/src/components/compliance/HeartwormWatchTab";', resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, platform: "node", format: "cjs", packages: "external", write: false, jsx: "automatic",
    plugins: [{
      name: "unused-upload-boundary",
      setup(b) {
        b.onResolve({ filter: /^@\/components\/ObjectUploader$/ }, args => ({ path: args.path, external: true }));
      },
    }],
  });
  const nativeRequire = createRequire(import.meta.url);
  const module = { exports: {} as any };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(
    (name: string) => name === "@/components/ObjectUploader" ? { ObjectUploader: () => null } : nativeRequire(name),
    module, module.exports,
  );
  RecentlyWarnedRow = module.exports.RecentlyWarnedRow;
});

const item = {
  warningId: "warning", animalId: "animal", animalName: "Test dog", itemId: "care",
  careName: "Previous prevention", dueDate: "2026-10-29", daysOverdue: 18,
  adopterName: "Test adopter", adopterEmail: "", adopterPhone: null,
  sentAt: "2026-11-13T14:00:00Z", deadlineDate: "2026-11-20",
  emailOpenedAt: null, linkClickedAt: null, proofUploadedAt: "2026-11-16T09:00:00Z",
  engagementStatus: "proof_uploaded" as const,
};
test("resolution distinguishes approval, pending review, and waived obligations", () => {
  assert.equal(warningResolution("approved"), "approved");
  assert.equal(warningResolution("pending_review"), "pending_review");
  assert.equal(warningResolution("rejected"), "unresolved");
  assert.equal(warningResolution("pending_review", "waived"), "waived");
  assert.equal(warningResolution(null, "completed"), "completed");
  assert.equal(warningHistoryDisplay(undefined, true).resolved, false);
});
for (const [resolutionStatus, label] of [
  ["approved", "Proof approved"], ["completed", "Requirement completed"], ["waived", "Requirement waived"],
] as const) {
  test(`${resolutionStatus} renders resolved history without overdue, deadline, or log-proof action`, () => {
    const html = renderToStaticMarkup(<RecentlyWarnedRow item={{ ...item, resolutionStatus }} onLogProof={() => {}} />);
    assert.ok(html.includes(label));
    assert.ok(html.includes("Original warning due date"));
    assert.ok(html.includes("Oct 29, 2026"));
    assert.ok(html.includes("retained for history"));
    assert.doesNotMatch(html, /18d overdue|to original warning deadline|Log Proof|Repeat warning blocked/);
  });
}
test("pending proof renders review status, not approval or current overdue", () => {
  const html = renderToStaticMarkup(<RecentlyWarnedRow item={{ ...item, resolutionStatus: "pending_review" }} onLogProof={() => {}} />);
  assert.ok(html.includes("Awaiting review"));
  assert.ok(html.includes("staff review needed"));
  assert.doesNotMatch(html, /Proof approved|18d overdue|to original warning deadline|Log Proof/);
});
test("unresolved warning preserves proof action but labels dates as historical", () => {
  const html = renderToStaticMarkup(<RecentlyWarnedRow item={{ ...item, resolutionStatus: "unresolved", engagementStatus: "no_response", proofUploadedAt: null }} onLogProof={() => {}} />);
  assert.ok(html.includes("Past-due notice"));
  assert.ok(html.includes("Original warning due date"));
  assert.ok(html.includes("Log Proof"));
  assert.ok(html.includes("Repeat warning blocked"));
  assert.doesNotMatch(html, /18d overdue|Proof approved/);
});
