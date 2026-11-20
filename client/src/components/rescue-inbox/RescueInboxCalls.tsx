import { useEffect, useRef, useState } from "react";
import { PhoneCall } from "lucide-react";
import { helpCallLabels } from "@shared/rescue-help-calls";
import { rescueHelpError, type RescueInboxApi } from "@/hooks/use-rescue-inbox";

export function RescueInboxCalls({api,threadId,canManage,openRequest=0}:{api:RescueInboxApi;threadId:string;canManage:boolean;openRequest?:number}) {
  const [confirm,setConfirm]=useState(false);
  const [error,setError]=useState("");
  const [uncertain,setUncertain]=useState(false);
  const sending=useRef(false);
  const requestId=useRef<string|null>(null);
  const data=api.calls.data;
  const section=useRef<HTMLElement>(null);
  useEffect(()=>{
    if(!openRequest) return;
    requestId.current=crypto.randomUUID();setConfirm(true);setError("");
    section.current?.scrollIntoView({block:"center"});
  },[openRequest]);
  return <section ref={section} className="border-t pt-4 mt-4" aria-label="Voice callbacks">
    <h3>Voice callbacks</h3>
    {canManage && <button type="button" className="ri-btn mt-2" disabled={!data?.canCall || api.calls.isError || api.startCall.isPending || uncertain}
      onClick={()=>{requestId.current=crypto.randomUUID();setError("");setConfirm(true);}}><PhoneCall size={15}/>Call back</button>}
    {!canManage && <p className="ri-muted mt-2">Only the assigned volunteer or an administrator can call back.</p>}
    {canManage && data?.reason && <p className="ri-muted mt-2">{data.reason}</p>}
    {confirm && <div className="ri-activation" role="group" aria-label="Confirm voice callback">
      <h3>Call from the rescue’s number</h3>
      <p>First we’ll ring your saved phone: <strong>{data?.staffPhone || "Number unavailable"}</strong>. Answer and press 1 to connect to this caller. They will see the rescue’s number, not yours.</p>
      <p>Twilio voice charges apply to both call legs, including time waiting for confirmation. No recording or transcription. Calls are limited to 30 minutes; unanswered phones ring for about 25–30 seconds.</p>
      <div className="ri-toolbar">
        <button type="button" className="ri-btn" disabled={api.startCall.isPending} onClick={()=>setConfirm(false)}>Cancel</button>
        <button type="button" className="ri-btn primary" disabled={!data?.canCall || api.calls.isError || api.startCall.isPending || uncertain} onClick={async()=>{
          if(sending.current || !requestId.current) return;
          sending.current=true;setError("");
          try {
            const result=await api.startCall.mutateAsync({id:threadId,requestId:requestId.current});
            setConfirm(false);
            if(result.status==="unknown") setError("The provider response is uncertain. Do not start another callback; check Twilio call logs.");
          } catch(e) {
            setError(rescueHelpError(e));
            // Never offer another creation after an uncertain HTTP response.
            if(!(e && typeof e==="object" && "status" in e && Number(e.status)<500)) setUncertain(true);
          } finally {sending.current=false;}
        }}>{api.startCall.isPending?"Starting…":"Call my phone and continue"}</button>
      </div>
    </div>}
    {(api.calls.isError || error) && <p className="ri-error" role="alert">{error || rescueHelpError(api.calls.error)}</p>}
    {uncertain && <p className="ri-muted">The request may have reached Twilio. Refresh status and check the call logs before trying again. This page will not automatically retry.</p>}
    <button type="button" className="ri-btn mt-2" onClick={()=>void api.calls.refetch()} disabled={api.calls.isFetching}>Refresh call status</button>
    {data?.calls.length ? <ul className="mt-3 space-y-2" aria-label="Callback history">{data.calls.map(call=><li key={call.id} className="rounded border p-3">
      <strong>{helpCallLabels[call.status] || "Call status unknown"}</strong>
      <p className="ri-muted">{call.initiatedBy} · {new Date(call.createdAt).toLocaleString()}</p>
      {call.status==="unknown" && <p className="ri-muted">Check Twilio call logs. An uncertain call is never retried automatically.</p>}
    </li>)}</ul> : <p className="ri-muted mt-2">{api.calls.isPending?"Loading callbacks…":"No callbacks recorded."}</p>}
    <p className="ri-muted mt-2">“Call ended” does not prove a conversation took place; the destination may have been voicemail.</p>
  </section>;
}
