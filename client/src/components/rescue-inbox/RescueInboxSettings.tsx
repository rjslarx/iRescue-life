import { useState } from "react";
import { Plus, Trash2, ShieldCheck } from "lucide-react";
import { rescueHelpError, type RescueInboxApi, type RescueHelpSettings, type RescueSettingsResponse } from "@/hooks/use-rescue-inbox";
import { topicTeam } from "@shared/rescue-help";

export function RescueInboxSettings({ api, initial }: { api: RescueInboxApi; initial: RescueSettingsResponse }) {
  const [draft, setDraft] = useState<RescueHelpSettings>(() => ({
    ...structuredClone(initial.settings), topics: initial.settings.topics.map(t=>({...t,assigneeIds:topicTeam(t)})),
  }));
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [approved, setApproved] = useState(false);
  const live = api.settings.data || initial;
  const busy = api.saveSettings.isPending || api.activate.isPending || api.disable.isPending;
  const dirty = JSON.stringify(draft) !== JSON.stringify(live.settings);
  const patch = (changes: Partial<RescueHelpSettings>) => { setDraft(old => ({ ...old, ...changes })); setSaved(false); };
  async function service(action: "activate" | "disable") {
    setError(null);
    try { await api[action].mutateAsync(); setConfirm(false); setApproved(false); } catch (err) { setError(err); }
  }
  return <div>
    <section className="ri-panel">
      <div className="ri-toolbar"><div><h2>Separate number. Shared responsibility.</h2><p className="ri-muted">Service {live.enabled ? "enabled" : "disabled"} · {live.number || "No dedicated number verified"}</p></div><ShieldCheck size={25} /></div>
      <p className="ri-muted mt-4">Prepare approved answers while the service is off. Your existing operational number is never used. A separate, owned Twilio number with SMS and voice is required; purchase and cost approval happen outside this app. This page does not purchase a number.</p>
      <p className="ri-muted mt-3">Activation works only on the published app and configures the dedicated number’s webhooks. Voice callers can leave a recording; calls are not transcribed.</p>
      <div className="mt-4">{live.enabled ? <button type="button" className="ri-btn danger" disabled={busy} onClick={() => { if (window.confirm("Disable the Rescue Inbox bot and all outgoing sending? Your settings will be kept.")) void service("disable"); }}>Disable service</button> : <button type="button" className="ri-btn primary" disabled={busy || dirty} onClick={() => setConfirm(true)}>Review activation</button>}</div>
      {dirty && <p className="ri-muted mt-2">Save your changes before activating.</p>}
      {confirm && !live.enabled && <section className="ri-activation" aria-label="Confirm service activation"><h3>Activate only the dedicated rescue-help number</h3><p className="ri-muted">Confirm the separate number has been purchased and its ongoing costs approved outside the app. The server verifies ownership and SMS + voice capability before changing webhooks. Do not enter your rescue’s operational number.</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} />I confirm this is a separate, approved number and this is the published app.</label><div className="ri-toolbar mt-4"><button type="button" className="ri-btn" onClick={() => setConfirm(false)} disabled={busy}>Cancel</button><button type="button" className="ri-btn primary" disabled={!approved || busy || dirty} onClick={() => void service("activate")}>{api.activate.isPending ? "Verifying number…" : "Confirm and activate"}</button></div></section>}
    </section>
    <form onSubmit={async event => {
      event.preventDefault(); setError(null); setSaved(false);
      try {
        for (const value of [draft.timezone, draft.greeting, draft.afterHours, draft.handoff, draft.emergency]) if (!value.trim()) throw new Error("Complete every response and the time zone.");
        if (draft.openHour >= draft.closeHour) throw new Error("Closing hour must be later than opening hour.");
        if (!draft.days.length) throw new Error("Select at least one response day.");
        new Intl.DateTimeFormat("en-US", { timeZone: draft.timezone });
        for (const topic of draft.topics) if (!topic.label.trim() || !topic.answer.trim() || !topic.keywords.length || topic.keywords.some(k => !k.trim())) throw new Error("Every topic needs a name, at least one keyword, and an approved answer.");
        await api.saveSettings.mutateAsync(draft); setSaved(true);
      } catch (err) { setError(err); }
    }}>
      <fieldset disabled={busy}>
        <section className="ri-panel"><h2>Volunteer text alerts</h2>
          <label className="flex gap-2 items-start"><input type="checkbox" checked={draft.smsAlerts !== false} onChange={e=>patch({smsAlerts:e.target.checked})} />Text volunteers when messages need attention</label>
          <p className="ri-muted mt-3">Unclaimed conversations alert the category team. Once claimed, only the owner is alerted. Categories without a selected team and general questions alert the shared inbox team. Messages are grouped, with at most one alert per conversation per volunteer every five minutes. A saved mobile number is required. SMS opt-outs, communication pauses, and quiet hours apply. Normal Twilio fees apply.</p>
          <p className="ri-muted mt-3">Alerts contain a sign-in link, not private message details. Claim and reply in the dashboard; texting CLAIM is not supported.</p>
        </section>
        <section className="ri-panel">
          <h2>Phone greeting voice</h2>
          <label className="ri-field"><span>Voice</span>
            <select value={draft.voice || "default"} onChange={e => patch({ voice: e.target.value as NonNullable<RescueHelpSettings["voice"]> })}>
              <option value="default">Current default (unchanged)</option>
              <option value="man">Basic male — US English</option>
              <option value="woman">Basic female — US English</option>
            </select>
          </label>
          <p className="ri-muted mt-3">The two basic voices have no additional text-to-speech charge and may sound more robotic than premium voices. Normal Twilio number, call, and recording charges still apply. Save to use your selection on future calls.</p>
        </section>
        <section className="ri-panel"><h2>Service hours & number</h2><p className="ri-muted">These hours use the rescue’s time zone, not the reader’s device time.</p><div className="ri-fields">
          <label className="ri-field"><span>Separate Twilio phone number</span><input type="tel" placeholder="+1…" value={draft.phone} onChange={e => patch({ phone: e.target.value })} /><small className="ri-muted">Can stay blank while preparing. Required for activation.</small></label>
          <label className="ri-field"><span>IANA time zone</span><input required value={draft.timezone} onChange={e => patch({ timezone: e.target.value })} /></label>
          <label className="ri-field"><span>Opening hour</span><select value={draft.openHour} onChange={e => patch({ openHour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}</select></label>
          <label className="ri-field"><span>Closing hour</span><select value={draft.closeHour} onChange={e => patch({ closeHour: Number(e.target.value) })}>{Array.from({ length: 25 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>)}</select></label>
        </div><div className="ri-checks" role="group" aria-label="Response days">{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, i) => <label key={day}><input type="checkbox" checked={draft.days.includes(i)} onChange={e => patch({ days: e.target.checked ? [...draft.days, i].sort() : draft.days.filter(d => d !== i) })} />{day}</label>)}</div></section>
        <section className="ri-panel"><h2>The rescue’s approved words</h2><p className="ri-muted">Review the server-provided defaults. Only your approved wording is sent; this editor does not invent rescue policies.</p><div className="ri-fields">{([["greeting", "Greeting"], ["afterHours", "After-hours response"], ["handoff", "Human handoff"], ["emergency", "Emergency guidance"]] as const).map(([key, label]) => <label className="ri-field" key={key}><span>{label}</span><textarea required value={draft[key]} onChange={e => patch({ [key]: e.target.value })} /></label>)}</div></section>
        <section className="ri-panel"><h2>Shared inbox team</h2><p className="ri-muted">Selected members can see every conversation and internal note. General volunteer access does not grant inbox access.</p><div className="ri-checks">{initial.team.map(member => <label key={member.id}><input type="checkbox" checked={draft.teamIds.includes(member.id)} onChange={e => patch({ teamIds: e.target.checked ? [...draft.teamIds, member.id] : draft.teamIds.filter(id => id !== member.id) })} />{member.name}</label>)}</div>{!initial.team.length && <p className="ri-muted mt-3">No team choices were returned. Add team members through team management first.</p>}</section>
        <section className="ri-panel"><div className="ri-toolbar"><div><h2>Approved answers</h2><p className="ri-muted">Choose one or more volunteers for each category. One person claims each conversation before replying.</p></div><button className="ri-btn" type="button" onClick={() => patch({ topics: [...draft.topics, { id: crypto.randomUUID(), label: "", keywords: [], answer: "", assigneeId: null, assigneeIds: [] }] })}><Plus size={16} />Add topic</button></div>
          {!draft.topics.length && <p className="ri-muted mt-5">No topics yet. Add the first answer your team has approved.</p>}
          {draft.topics.map((topic, index) => {
            const update = (value: Partial<typeof topic>) => patch({ topics: draft.topics.map(t => t.id === topic.id ? { ...t, ...value } : t) });
            return <div className="ri-topic" key={topic.id}><div className="ri-toolbar"><h3>Topic {index + 1}</h3><button type="button" className="ri-btn danger" aria-label={`Remove ${topic.label || `topic ${index + 1}`}`} onClick={() => { if (window.confirm("Remove this approved topic? Save to apply the change.")) patch({ topics: draft.topics.filter(t => t.id !== topic.id) }); }}><Trash2 size={15} />Remove</button></div><div className="ri-fields">
              <label className="ri-field"><span>Category name</span><input required value={topic.label} onChange={e => update({ label: e.target.value })} /></label>
              <label className="ri-field"><span>Volunteer notifications</span><select value={topic.notificationMode || "always"} onChange={e => update({ notificationMode: e.target.value as "always" | "answer_first" })}>
                <option value="always">Always notify volunteers</option>
                <option value="answer_first">Answer simple questions first</option>
              </select><small className="ri-muted">Answer first: a first keyword match gets the approved answer without a volunteer alert. Follow-ups, attachments, and requests for help go to volunteers. Matching uses keywords, not AI. All messages stay in the inbox; foster welcome replies and voicemails always need attention. Text alerts must be enabled above.</small></label>
              <fieldset className="ri-field"><legend>Category volunteers</legend><div className="ri-checks max-h-64 overflow-y-auto overscroll-contain touch-pan-y">{initial.team.filter(m=>draft.teamIds.includes(m.id)).map(m=><label key={m.id}><input type="checkbox" checked={topicTeam(topic).includes(m.id)} onChange={e=>{
                const ids=e.target.checked ? [...topicTeam(topic),m.id] : topicTeam(topic).filter(id=>id!==m.id);
                update({assigneeIds:ids,assigneeId:ids.length===1 ? ids[0] : null});
              }} />{m.name}</label>)}</div><small className="ri-muted">No selection: alert the shared inbox team.</small></fieldset>
              <label className="ri-field"><span>Keywords (comma separated)</span><input required value={topic.keywords.join(",")} onChange={e => update({ keywords: e.target.value.split(",") })} /></label>
              <label className="ri-field"><span>Approved answer</span><textarea required value={topic.answer} onChange={e => update({ answer: e.target.value })} /></label>
            </div></div>;
          })}
        </section>
        <div className="ri-toolbar"><p className="ri-muted">Settings are saved together. Saving does not activate the service.</p><button className="ri-btn primary" type="submit" disabled={busy}>{api.saveSettings.isPending ? "Saving…" : "Save settings"}</button></div>
      </fieldset>
    </form>
    {saved && <p className="ri-success" role="status">Settings saved. Service activation is a separate step.</p>}
    {error != null && <p className="ri-error" role="alert">{rescueHelpError(error)}</p>}
  </div>;
}
