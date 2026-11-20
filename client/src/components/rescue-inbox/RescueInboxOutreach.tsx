import { useRef, useState } from "react";
import { MessageSquare, PhoneCall } from "lucide-react";
import { rescueHelpError, type RescueInboxApi } from "@/hooks/use-rescue-inbox";

export function RescueInboxOutreach({api,onOpen}:{api:RescueInboxApi;onOpen:(id:string,mode:"text"|"call")=>void}) {
  const [mode,setMode]=useState<"text"|"call"|null>(null);
  const [phone,setPhone]=useState("");
  const [error,setError]=useState("");
  const busy=useRef(false);
  const disabled=!api.settings.data?.enabled || api.settings.isError;
  return <section className="mb-4" aria-label="Start a conversation">
    <div className="ri-toolbar">
      <button type="button" className="ri-btn" disabled={disabled || api.prepareOutreach.isPending} onClick={()=>{setMode("text");setError("");}}><MessageSquare size={16}/>New text</button>
      <button type="button" className="ri-btn" disabled={disabled || api.prepareOutreach.isPending} onClick={()=>{setMode("call");setError("");}}><PhoneCall size={16}/>New call</button>
    </div>
    {mode && <form className="ri-activation mt-3" onSubmit={async e=>{
      e.preventDefault();
      if(busy.current) return;
      busy.current=true;setError("");
      try {
        const thread=await api.prepareOutreach.mutateAsync(phone);
        onOpen(thread.id,mode);setMode(null);setPhone("");
      } catch(err) {setError(rescueHelpError(err));}
      finally {busy.current=false;}
    }}>
      <h3>{mode==="text"?"New text from the rescue":"New call from the rescue"}</h3>
      <label className="ri-field"><span>Recipient’s US phone number</span><input type="tel" autoComplete="off" required maxLength={50} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="(555) 123-4567" aria-label="Recipient phone number"/></label>
      <p className="ri-muted">{mode==="text"?"Next, write and review your text before sending.":"Next, review the call confirmation. We’ll call your saved phone first; press 1 to connect."} Normal Twilio charges apply. Contact only people who have agreed to hear from the rescue.</p>
      <div className="ri-toolbar mt-3">
        <button type="submit" className="ri-btn primary" disabled={api.prepareOutreach.isPending || disabled}>{api.prepareOutreach.isPending?"Opening…":mode==="text"?"Continue to message":"Continue to call"}</button>
        <button type="button" className="ri-btn" disabled={api.prepareOutreach.isPending} onClick={()=>setMode(null)}>Cancel</button>
      </div>
      {error && <p className="ri-error" role="alert">{error}</p>}
    </form>}
  </section>;
}
