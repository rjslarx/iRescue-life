"use strict";(()=>{var I=Object.defineProperty;var B=(c,t,e)=>t in c?I(c,t,{enumerable:!0,configurable:!0,writable:!0,value:e}):c[t]=e;var o=(c,t,e)=>B(c,typeof t!="symbol"?t+"":t,e);var A={treats:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg-treats" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#451a03"/>
        <stop offset="100%" stop-color="#78350f"/>
      </linearGradient>
      <linearGradient id="bag-treats" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fbbf24"/>
        <stop offset="100%" stop-color="#d97706"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="22" fill="url(#bg-treats)"/>
    <circle cx="80" cy="80" r="58" fill="#f59e0b" opacity="0.14"/>
    <!-- Pouch -->
    <path d="M44 34 H116 L122 132 Q122 140 112 140 H48 Q38 140 38 132 Z" fill="url(#bag-treats)" stroke="#fde68a" stroke-width="3"/>
    <path d="M42 34 Q80 26 118 34 L116 44 H44 Z" fill="#b45309"/>
    <rect x="48" y="54" width="64" height="36" rx="8" fill="#fffbeb"/>
    <text x="80" y="70" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="11" fill="#92400e">PEANUT</text>
    <text x="80" y="83" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="10" fill="#d97706">TREATS</text>
    <!-- Bone biscuit icon -->
    <g transform="translate(80, 114) rotate(-8)">
      <circle cx="-18" cy="-6" r="7" fill="#fef3c7" stroke="#92400e" stroke-width="2"/>
      <circle cx="-18" cy="6" r="7" fill="#fef3c7" stroke="#92400e" stroke-width="2"/>
      <circle cx="18" cy="-6" r="7" fill="#fef3c7" stroke="#92400e" stroke-width="2"/>
      <circle cx="18" cy="6" r="7" fill="#fef3c7" stroke="#92400e" stroke-width="2"/>
      <rect x="-18" y="-5" width="36" height="10" fill="#fef3c7"/>
      <line x1="-14" y1="-5" x2="14" y2="-5" stroke="#92400e" stroke-width="2"/>
      <line x1="-14" y1="5" x2="14" y2="5" stroke="#92400e" stroke-width="2"/>
    </g>
  </svg>`,toy:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg-toy" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#500724"/>
        <stop offset="100%" stop-color="#831843"/>
      </linearGradient>
      <radialGradient id="plush-grad" cx="0.4" cy="0.35" r="0.65">
        <stop offset="0%" stop-color="#f472b6"/>
        <stop offset="100%" stop-color="#db2777"/>
      </radialGradient>
    </defs>
    <rect width="160" height="160" rx="22" fill="url(#bg-toy)"/>
    <circle cx="80" cy="82" r="56" fill="#ec4899" opacity="0.16"/>
    <!-- Squeaky wave lines -->
    <path d="M26 48 Q20 38 30 32" stroke="#fbcfe8" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M134 48 Q140 38 130 32" stroke="#fbcfe8" stroke-width="3" fill="none" stroke-linecap="round"/>
    <!-- Plush Bear / Pup -->
    <circle cx="52" cy="48" r="16" fill="url(#plush-grad)" stroke="#fbcfe8" stroke-width="2.5"/>
    <circle cx="52" cy="48" r="8" fill="#fce7f3"/>
    <circle cx="108" cy="48" r="16" fill="url(#plush-grad)" stroke="#fbcfe8" stroke-width="2.5"/>
    <circle cx="108" cy="48" r="8" fill="#fce7f3"/>
    <ellipse cx="80" cy="115" rx="30" ry="24" fill="url(#plush-grad)" stroke="#fbcfe8" stroke-width="2.5"/>
    <ellipse cx="80" cy="116" rx="16" ry="13" fill="#fce7f3"/>
    <!-- Stitch marks -->
    <path d="M80 104 V128 M75 112 H85 M75 120 H85" stroke="#be185d" stroke-width="2" stroke-linecap="round"/>
    <circle cx="80" cy="76" r="32" fill="url(#plush-grad)" stroke="#fbcfe8" stroke-width="2.5"/>
    <ellipse cx="80" cy="83" rx="14" ry="10" fill="#fce7f3"/>
    <circle cx="68" cy="70" r="4.5" fill="#1f2937"/>
    <circle cx="66.5" cy="68.5" r="1.5" fill="#ffffff"/>
    <circle cx="92" cy="70" r="4.5" fill="#1f2937"/>
    <circle cx="90.5" cy="68.5" r="1.5" fill="#ffffff"/>
    <ellipse cx="80" cy="80" rx="5" ry="3.5" fill="#831843"/>
  </svg>`,shampoo:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg-shampoo" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#083344"/>
        <stop offset="100%" stop-color="#155e75"/>
      </linearGradient>
      <linearGradient id="bottle-grad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#22d3ee"/>
        <stop offset="50%" stop-color="#67e8f9"/>
        <stop offset="100%" stop-color="#0891b2"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="22" fill="url(#bg-shampoo)"/>
    <!-- Bubbles -->
    <circle cx="38" cy="52" r="10" fill="#cffafe" opacity="0.35" stroke="#a5f3fc" stroke-width="1.5"/>
    <circle cx="124" cy="68" r="13" fill="#cffafe" opacity="0.35" stroke="#a5f3fc" stroke-width="1.5"/>
    <circle cx="118" cy="40" r="7" fill="#cffafe" opacity="0.45" stroke="#a5f3fc" stroke-width="1.5"/>
    <!-- Pump top -->
    <rect x="74" y="22" width="12" height="16" rx="3" fill="#e2e8f0"/>
    <path d="M68 24 H98 Q104 24 106 30 L102 32 H68 Z" fill="#f8fafc"/>
    <rect x="66" y="36" width="28" height="10" rx="4" fill="#0284c7" stroke="#bae6fd" stroke-width="2"/>
    <!-- Bottle body -->
    <rect x="48" y="46" width="64" height="94" rx="18" fill="url(#bottle-grad)" stroke="#cffafe" stroke-width="3"/>
    <rect x="55" y="66" width="50" height="54" rx="8" fill="#f0fdff"/>
    <!-- Paw droplet -->
    <circle cx="80" cy="86" r="6" fill="#0891b2"/>
    <circle cx="71" cy="78" r="3" fill="#0891b2"/>
    <circle cx="77" cy="75" r="3" fill="#0891b2"/>
    <circle cx="83" cy="75" r="3" fill="#0891b2"/>
    <circle cx="89" cy="78" r="3" fill="#0891b2"/>
    <text x="80" y="109" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="9.5" fill="#0e7490">OATMEAL</text>
    <text x="80" y="117" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="700" font-size="7.5" fill="#0284c7">WASH</text>
  </svg>`,hay:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg-hay" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1a2e05"/>
        <stop offset="100%" stop-color="#365314"/>
      </linearGradient>
      <linearGradient id="bale-front" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#bef264"/>
        <stop offset="50%" stop-color="#84cc16"/>
        <stop offset="100%" stop-color="#65a30d"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="22" fill="url(#bg-hay)"/>
    <!-- 3D Hay Bale -->
    <polygon points="30,66 56,44 134,44 108,66" fill="#d9f99d" stroke="#ecfccb" stroke-width="2"/>
    <polygon points="108,66 134,44 134,112 108,130" fill="#4d7c0f" stroke="#ecfccb" stroke-width="2"/>
    <rect x="30" y="66" width="78" height="64" rx="4" fill="url(#bale-front)" stroke="#ecfccb" stroke-width="2.5"/>
    <!-- Twine straps -->
    <line x1="52" y1="66" x2="52" y2="130" stroke="#b45309" stroke-width="4"/>
    <line x1="52" y1="66" x2="78" y2="44" stroke="#d97706" stroke-width="3.5"/>
    <line x1="86" y1="66" x2="86" y2="130" stroke="#b45309" stroke-width="4"/>
    <line x1="86" y1="66" x2="112" y2="44" stroke="#d97706" stroke-width="3.5"/>
    <!-- Straw texture details -->
    <path d="M36 80 H46 M60 92 H78 M38 112 H48 M92 84 H102 M62 116 H76" stroke="#fef08a" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="44" y="84" width="50" height="22" rx="5" fill="#1a2e05" opacity="0.82"/>
    <text x="69" y="99" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="11" fill="#ecfccb">FRESH HAY</text>
  </svg>`,flea:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg-flea" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#2e1065"/>
        <stop offset="100%" stop-color="#4c1d95"/>
      </linearGradient>
      <linearGradient id="shield-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#a78bfa"/>
        <stop offset="100%" stop-color="#7c3aed"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="22" fill="url(#bg-flea)"/>
    <!-- Box & Shield -->
    <rect x="32" y="42" width="96" height="82" rx="12" fill="url(#shield-grad)" stroke="#ddd6fe" stroke-width="3"/>
    <rect x="32" y="42" width="96" height="22" rx="10" fill="#5b21b6"/>
    <text x="80" y="57" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="10" fill="#ede9fe">30-DAY SHIELD</text>
    <!-- Protection Shield Emblem -->
    <path d="M64 72 L80 65 L96 72 V90 C96 103 80 113 80 113 C80 113 64 103 64 90 Z" fill="#f5f3ff" stroke="#4c1d95" stroke-width="2.5"/>
    <path d="M73 89 L78 94 L88 82" fill="none" stroke="#10b981" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- Chew tablet -->
    <ellipse cx="112" cy="116" rx="16" ry="11" fill="#b45309" stroke="#fef3c7" stroke-width="2.5"/>
    <ellipse cx="112" cy="113" rx="12" ry="7" fill="#d97706"/>
  </svg>`,microchip:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg-chip" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#172554"/>
        <stop offset="100%" stop-color="#1d4ed8"/>
      </linearGradient>
      <linearGradient id="tag-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#60a5fa"/>
        <stop offset="100%" stop-color="#2563eb"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="22" fill="url(#bg-chip)"/>
    <!-- Signal waves -->
    <path d="M46 42 A48 48 0 0 1 114 42" fill="none" stroke="#93c5fd" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="4 4"/>
    <path d="M56 50 A34 34 0 0 1 104 50" fill="none" stroke="#bfdbfe" stroke-width="2.5" stroke-linecap="round"/>
    <!-- Keyring -->
    <circle cx="80" cy="48" r="10" fill="none" stroke="#e2e8f0" stroke-width="4"/>
    <!-- Heart / Round ID Tag -->
    <circle cx="80" cy="95" r="38" fill="url(#tag-grad)" stroke="#dbeafe" stroke-width="3.5"/>
    <circle cx="80" cy="64" r="4" fill="#1e3a8a"/>
    <!-- Microchip circuit icon inside tag -->
    <rect x="64" y="79" width="32" height="32" rx="6" fill="#eff6ff" stroke="#1e40af" stroke-width="2"/>
    <rect x="72" y="87" width="16" height="16" rx="3" fill="#fbbf24" stroke="#b45309" stroke-width="1.5"/>
    <path d="M60 85 H64 M60 95 H64 M60 105 H64 M96 85 H100 M96 95 H100 M96 105 H100 M70 75 V79 M80 75 V79 M90 75 V79 M70 111 V115 M80 111 V115 M90 111 V115" stroke="#dbeafe" stroke-width="2.5" stroke-linecap="round"/>
  </svg>`,heartworm:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg-heart" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#450a0a"/>
        <stop offset="100%" stop-color="#991b1b"/>
      </linearGradient>
      <linearGradient id="heart-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f87171"/>
        <stop offset="100%" stop-color="#dc2626"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="22" fill="url(#bg-heart)"/>
    <!-- Medical Box -->
    <rect x="34" y="36" width="92" height="90" rx="14" fill="#fef2f2" stroke="#fecaca" stroke-width="3"/>
    <rect x="34" y="36" width="92" height="24" rx="12" fill="#dc2626"/>
    <text x="80" y="52" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="10" fill="#ffffff">HEARTCARE RX</text>
    <!-- Glowing Heart + Cross -->
    <path d="M80 114 C80 114 52 96 52 78 C52 68 60 62 68 62 C74 62 78 66 80 70 C82 66 86 62 92 62 C100 62 108 68 108 78 C108 96 80 114 80 114 Z" fill="url(#heart-grad)" stroke="#b91c1c" stroke-width="2"/>
    <rect x="76" y="74" width="8" height="22" rx="2" fill="#ffffff"/>
    <rect x="69" y="81" width="22" height="8" rx="2" fill="#ffffff"/>
  </svg>`,kibble:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <defs>
      <linearGradient id="bg-kibble" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#064e3b"/>
        <stop offset="100%" stop-color="#047857"/>
      </linearGradient>
      <linearGradient id="sack-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#34d399"/>
        <stop offset="100%" stop-color="#059669"/>
      </linearGradient>
    </defs>
    <rect width="160" height="160" rx="22" fill="url(#bg-kibble)"/>
    <!-- Heavy 30lb Kibble Sack -->
    <path d="M40 28 L120 28 L126 132 Q126 140 116 140 H44 Q34 140 34 132 Z" fill="url(#sack-grad)" stroke="#a7f3d0" stroke-width="3"/>
    <path d="M38 28 L44 36 H116 L122 28 Z" fill="#065f46" stroke="#a7f3d0" stroke-width="2"/>
    <rect x="46" y="48" width="68" height="44" rx="8" fill="#ecfdf5"/>
    <text x="80" y="65" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="12" fill="#065f46">30LB KIBBLE</text>
    <text x="80" y="80" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="9" fill="#059669">SHELTER CHOW</text>
    <!-- Bowl of Kibble at bottom -->
    <circle cx="68" cy="112" r="5" fill="#78350f"/>
    <circle cx="76" cy="109" r="5.5" fill="#92400e"/>
    <circle cx="84" cy="110" r="5" fill="#78350f"/>
    <circle cx="91" cy="113" r="5" fill="#92400e"/>
    <path d="M56 114 H104 L110 128 Q110 132 102 132 H58 Q50 132 50 128 Z" fill="#fbbf24" stroke="#fffbeb" stroke-width="2"/>
  </svg>`};function C(c){let t=c.id.toLowerCase(),e=A[t];if(e)return`data:image/svg+xml;utf8,${encodeURIComponent(e)}`;let i=c.name.replace(/[<>&"']/g,"").slice(0,16).toUpperCase(),s=c.code.replace(/[<>&"']/g,"").slice(0,4),a=c.badgeColor||"#38bdf8",n=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <rect width="160" height="160" rx="22" fill="#1e293b"/>
    <circle cx="80" cy="74" r="44" fill="${a}" opacity="0.22"/>
    <rect x="36" y="34" width="88" height="92" rx="16" fill="${a}" stroke="#f8fafc" stroke-width="3"/>
    <circle cx="80" cy="70" r="20" fill="#0f172a" opacity="0.35"/>
    <text x="80" y="76" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="16" fill="#ffffff">${s}</text>
    <rect x="44" y="98" width="72" height="18" rx="5" fill="#0f172a" opacity="0.75"/>
    <text x="80" y="110" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="8.5" fill="#f8fafc">${i}</text>
  </svg>`;return`data:image/svg+xml;utf8,${encodeURIComponent(n)}`}function v(){return window.RESCUE_VENDING_ITEMS??[]}function w(c){let t={...c,impactNote:c.impactNote??"",badgeColor:c.badgeColor??"#45a896",imageUrl:""},e=C(t);try{let i=new URL(c.imageUrl||"",window.location.href);c.imageUrl&&(i.protocol==="https:"||i.origin===window.location.origin)&&(e=i.href)}catch{}return{id:c.id,code:c.code,name:c.name,brand:"RESCUE SUPPLY",priceCents:c.priceCents,priceDisplay:new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:c.priceCents%100?2:0}).format(c.priceCents/100),impactNote:t.impactNote,imageUrl:e}}var x=class{constructor(){o(this,"ctx",null);o(this,"muted",!1)}unlock(){if(!this.ctx){let t=window.AudioContext||window.webkitAudioContext;t&&(this.ctx=new t)}this.ctx&&this.ctx.state==="suspended"&&this.ctx.resume().catch(()=>{})}isMuted(){return this.muted}setMuted(t){this.muted=t}toggleMute(){return this.muted=!this.muted,this.muted||(this.unlock(),this.playTapTone(980)),this.muted}playTapTone(t=1120){if(this.muted||(this.unlock(),!this.ctx))return;let e=this.ctx.currentTime,i=Math.floor(this.ctx.sampleRate*.014),s=this.ctx.createBuffer(1,i,this.ctx.sampleRate),a=s.getChannelData(0);for(let h=0;h<i;h++)a[h]=(Math.random()*2-1)*Math.exp(-h/(i*.25));let n=this.ctx.createBufferSource();n.buffer=s;let r=this.ctx.createBiquadFilter();r.type="bandpass",r.frequency.setValueAtTime(2400,e),r.Q.setValueAtTime(2.2,e);let d=this.ctx.createGain();d.gain.setValueAtTime(.32,e),d.gain.exponentialRampToValueAtTime(.001,e+.014),n.connect(r),r.connect(d),d.connect(this.ctx.destination),n.start(e);let l=this.ctx.createOscillator(),p=this.ctx.createGain();l.type="triangle",l.frequency.setValueAtTime(t,e+.005),l.frequency.exponentialRampToValueAtTime(t*1.03,e+.065),p.gain.setValueAtTime(.14,e+.005),p.gain.exponentialRampToValueAtTime(8e-4,e+.075),l.connect(p),p.connect(this.ctx.destination),l.start(e+.005),l.stop(e+.08)}playCoilMotor(t=750){if(this.muted||(this.unlock(),!this.ctx))return;let e=this.ctx.currentTime,i=t/1e3,s=this.ctx.createOscillator(),a=this.ctx.createOscillator(),n=this.ctx.createOscillator(),r=this.ctx.createGain(),d=this.ctx.createBiquadFilter(),l=this.ctx.createGain();s.type="sawtooth",s.frequency.setValueAtTime(118,e),s.frequency.linearRampToValueAtTime(134,e+.09),s.frequency.setValueAtTime(132,e+i-.08),s.frequency.exponentialRampToValueAtTime(75,e+i),a.type="square",a.frequency.setValueAtTime(59,e),a.frequency.linearRampToValueAtTime(66,e+.09),a.frequency.exponentialRampToValueAtTime(42,e+i),n.type="sine",n.frequency.setValueAtTime(14,e),r.gain.setValueAtTime(16,e),n.connect(r),r.connect(s.frequency),d.type="lowpass",d.frequency.setValueAtTime(390,e),d.Q.setValueAtTime(3.2,e),l.gain.setValueAtTime(.001,e),l.gain.linearRampToValueAtTime(.16,e+.05),l.gain.setValueAtTime(.15,e+i-.07),l.gain.exponentialRampToValueAtTime(8e-4,e+i),s.connect(d),a.connect(d),d.connect(l),l.connect(this.ctx.destination),s.start(e),a.start(e),n.start(e),s.stop(e+i+.02),a.stop(e+i+.02),n.stop(e+i+.02)}playChuteImpact(){if(this.muted||(this.unlock(),!this.ctx))return;let t=this.ctx.currentTime,e=this.ctx.createOscillator(),i=this.ctx.createGain();e.type="sine",e.frequency.setValueAtTime(155,t),e.frequency.exponentialRampToValueAtTime(42,t+.19),i.gain.setValueAtTime(.38,t),i.gain.exponentialRampToValueAtTime(.001,t+.22),e.connect(i),i.connect(this.ctx.destination),e.start(t),e.stop(t+.23);let s=this.ctx.createOscillator(),a=this.ctx.createGain();s.type="triangle",s.frequency.setValueAtTime(210,t+.085),s.frequency.exponentialRampToValueAtTime(64,t+.23),a.gain.setValueAtTime(.22,t+.085),a.gain.exponentialRampToValueAtTime(.001,t+.25),s.connect(a),a.connect(this.ctx.destination),s.start(t+.085),s.stop(t+.26),[.13,.28].forEach((r,d)=>{if(!this.ctx)return;let l=t+r,p=Math.floor(this.ctx.sampleRate*.09),h=this.ctx.createBuffer(1,p,this.ctx.sampleRate),S=h.getChannelData(0);for(let y=0;y<p;y++)S[y]=(Math.random()*2-1)*Math.exp(-y/(p*.3));let T=this.ctx.createBufferSource();T.buffer=h;let u=this.ctx.createBiquadFilter();u.type="bandpass",u.frequency.setValueAtTime(d===0?920:760,l),u.Q.setValueAtTime(4.5,l);let g=this.ctx.createGain();g.gain.setValueAtTime(d===0?.24:.11,l),g.gain.exponentialRampToValueAtTime(.001,l+.085),T.connect(u),u.connect(g),g.connect(this.ctx.destination),T.start(l)})}playCompletionChime(){if(this.muted||(this.unlock(),!this.ctx))return;let t=this.ctx.currentTime;[523.25,659.25,783.99,987.77,1174.66].forEach((i,s)=>{if(!this.ctx)return;let a=t+s*.075,n=this.ctx.createOscillator(),r=this.ctx.createOscillator(),d=this.ctx.createGain();n.type="sine",n.frequency.setValueAtTime(i,a),r.type="triangle",r.frequency.setValueAtTime(i*2,a);let l=this.ctx.createGain();l.gain.setValueAtTime(.03,a),l.gain.exponentialRampToValueAtTime(1e-4,a+.45),d.gain.setValueAtTime(.001,a),d.gain.linearRampToValueAtTime(.14,a+.02),d.gain.exponentialRampToValueAtTime(8e-4,a+.75),n.connect(d),r.connect(l),l.connect(d),d.connect(this.ctx.destination),n.start(a),r.start(a),n.stop(a+.78),r.stop(a+.78)})}};var b=null;function k(c){if(b=null,typeof c=="string")try{let t=new URL(c);if(t.origin!==window.location.origin||!t.pathname.endsWith("/rescue-vend"))return;t.search="",t.hash="",b=t.href}catch{}}async function L(c){if(!c)return;let t=c.parentElement?.querySelector("[data-share-status]");if(t||(t=document.createElement("div"),t.dataset.shareStatus="true",t.setAttribute("role","status"),t.style.cssText="margin:12px 0;color:#172033;font-size:16px;overflow-wrap:anywhere",c.insertAdjacentElement("afterend",t)),t.replaceChildren(),!b){t.textContent="Sharing is not ready. Please reload the page and try again.";return}let e=b;if(navigator.share)try{await navigator.share({title:"Rescue Vend",text:"I supported rescue care with a symbolic donation. You can help too!",url:e}),t.textContent="Share menu closed.";return}catch(i){if(i instanceof Error&&i.name==="AbortError")return}try{await navigator.clipboard.writeText(e),t.textContent="Link copied! Paste it into a message or social post."}catch{t.textContent="Copy this link to share:";let i=document.createElement("input");i.readOnly=!0,i.value=e,i.setAttribute("aria-label","Donation page link"),i.style.cssText="display:block;width:100%;box-sizing:border-box;font-size:16px;padding:10px;margin-top:8px",i.addEventListener("click",()=>i.select()),t.append(i)}}var f=c=>String(c).replace(/[&<>"']/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[t]),E=class{constructor(t=[]){o(this,"catalog",[]);o(this,"cart",new Map);o(this,"lastDispensedItems",[]);o(this,"activeSlotCode",null);o(this,"keypadLetterBuffer",null);o(this,"isWaitingForPayment",!1);o(this,"isDispensing",!1);o(this,"hasUncollectedReceipt",!1);o(this,"sound",new x);o(this,"shelvesChamber");o(this,"dropChamberLayer");o(this,"ledIndicatorDot");o(this,"ledCodeBadge");o(this,"ledMatrixText");o(this,"ledImpactSubtext");o(this,"contactlessReader");o(this,"chuteTarget");o(this,"chuteFlap");o(this,"chuteReceiptPrompt");o(this,"trayBadgeCount");o(this,"trayImpactPreview");o(this,"trayItemsList");o(this,"quickPayBtn");o(this,"quickPayBtnText");o(this,"muteToggleBtn");o(this,"muteIcon");o(this,"muteLabel");o(this,"receiptModalBackdrop");o(this,"receiptMeta");o(this,"receiptItemsList");o(this,"receiptTotalAmount");o(this,"shareGiftBtn");o(this,"shareGiftBtnText");o(this,"closeReceiptBtn");o(this,"receiptFocus",null);this.catalog=v();for(let e of t){let i=this.catalog.find(s=>s.id===e?.id);i&&!this.cart.has(i.id)&&Number.isInteger(e.quantity)&&e.quantity>0&&e.quantity<=10&&this.getTotalCount()+e.quantity<=20&&this.cart.set(i.id,{...i,quantity:e.quantity})}this.bindElements(),this.renderShelves(),this.renderCartTray(),this.bindEvents()}bindElements(){this.shelvesChamber=document.getElementById("shelves-chamber"),this.dropChamberLayer=document.getElementById("drop-chamber-layer"),this.ledIndicatorDot=document.getElementById("led-indicator-dot"),this.ledCodeBadge=document.getElementById("led-code-badge"),this.ledMatrixText=document.getElementById("led-matrix-text"),this.ledImpactSubtext=document.getElementById("led-impact-subtext"),this.contactlessReader=document.getElementById("contactless-reader"),this.chuteTarget=document.getElementById("delivery-chute-target"),this.chuteFlap=document.getElementById("chute-flap"),this.chuteReceiptPrompt=document.getElementById("chute-receipt-prompt"),this.trayBadgeCount=document.getElementById("tray-badge-count"),this.trayImpactPreview=document.getElementById("tray-impact-preview"),this.trayItemsList=document.getElementById("tray-items-list"),this.quickPayBtn=document.getElementById("quick-pay-btn"),this.quickPayBtnText=document.getElementById("quick-pay-btn-text"),this.muteToggleBtn=document.getElementById("mute-toggle-btn"),this.muteIcon=document.getElementById("mute-icon"),this.muteLabel=document.getElementById("mute-label"),this.receiptModalBackdrop=document.getElementById("receipt-modal-backdrop"),this.receiptMeta=document.getElementById("receipt-meta"),this.receiptItemsList=document.getElementById("receipt-items-list"),this.receiptTotalAmount=document.getElementById("receipt-total-amount"),this.shareGiftBtn=document.getElementById("share-gift-btn"),this.shareGiftBtnText=document.getElementById("share-gift-btn-text"),this.closeReceiptBtn=document.getElementById("close-receipt-btn")}createFallbackPackageSvg(t){let e={A1:["#991b1b","#dc2626"],A2:["#b45309","#f59e0b"],B1:["#be123c","#f43f5e"],B2:["#a16207","#eab308"],C1:["#1d4ed8","#3b82f6"],C2:["#047857","#10b981"]},[i,s]=e[t.code]||["#374151","#6b7280"],a=t.brand.replace(/&/g,"&amp;").replace(/</g,"&lt;"),n=t.code.replace(/&/g,"&amp;"),r=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${s}"/>
          <stop offset="100%" stop-color="${i}"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" fill="url(#g)"/>
      <circle cx="80" cy="64" r="34" fill="rgba(255,255,255,0.16)"/>
      <text x="80" y="72" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-weight="900" font-size="24">${n}</text>
      <text x="80" y="112" text-anchor="middle" fill="rgba(255,255,255,0.9)" font-family="sans-serif" font-weight="700" font-size="12">${a}</text>
    </svg>`;return`data:image/svg+xml;utf8,${encodeURIComponent(r)}`}renderShelves(){this.catalog=v(),this.shelvesChamber.innerHTML="";let t=[];for(let e=0;e<this.catalog.length;e+=2)t.push(this.catalog.slice(e,e+2));t.forEach((e,i)=>{let s=document.createElement("div");s.className="shelf-row",s.setAttribute("data-row-index",String(i));let a=document.createElement("div");a.className="shelf-slots-grid",e.forEach(n=>{let r=document.createElement("div");r.className="vending-slot",r.setAttribute("data-code",n.code),r.setAttribute("role","button"),r.setAttribute("tabindex","0"),r.setAttribute("aria-label",`${n.code}: ${n.brand} ${n.name}, ${n.priceDisplay}. ${n.impactNote}`);let d=this.createFallbackPackageSvg(n);r.innerHTML=`
          <div class="slot-back-shadow" aria-hidden="true"></div>
          <div class="slot-shelf-floor" aria-hidden="true"></div>
          <span class="slot-qty-badge" data-qty-badge="${n.code}">0</span>

          <!-- Metallic Silver Spiral Vending Coil -->
          <div class="coil-assembly" aria-hidden="true">
            <svg class="coil-svg" viewBox="0 0 100 56" fill="none">
              <defs>
                <linearGradient id="coil-metal-${n.code}" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#ffffff" />
                  <stop offset="28%" stop-color="#9ca3af" />
                  <stop offset="65%" stop-color="#f3f4f6" />
                  <stop offset="100%" stop-color="#1f2937" />
                </linearGradient>
              </defs>
              <!-- Rear Auger Motor Hub -->
              <circle cx="50" cy="16" r="6" fill="#1f2937" stroke="#4b5563" stroke-width="1.5" />
              <!-- Back Auger Helix Rings -->
              <ellipse cx="50" cy="18" rx="22" ry="8" stroke="#4b5563" stroke-width="3.2" />
              <ellipse cx="50" cy="25" rx="28" ry="10.5" stroke="#6b7280" stroke-width="3.6" />
              <ellipse cx="50" cy="33" rx="34" ry="12.5" stroke="url(#coil-metal-${n.code})" stroke-width="4.2" />
              <!-- Front Auger Specular Helix Ring & Pigtail Tip -->
              <path d="M 14 36 C 14 22, 86 22, 86 36 C 86 49, 20 50, 25 39" stroke="url(#coil-metal-${n.code})" stroke-width="4.6" stroke-linecap="round" />
              <circle cx="25" cy="39" r="3" fill="#ffffff" />
            </svg>
          </div>

          <!-- Standing 3D Product Package -->
          <div class="product-stage">
            <div class="product-package-3d" data-package="${n.code}">
              <img
                class="package-photo"
                src="${f(n.imageUrl)}"
                alt="${f(n.name)}"
                loading="eager"
              />
              <div class="package-label-overlay">
                <span class="package-brand-tag">${f(n.brand)}</span>
                <span class="package-item-title">${f(n.name)}</span>
              </div>
            </div>
          </div>

          <!-- Metallic Coil Base Retainer Loop -->
          <div class="coil-front-retainer" aria-hidden="true"></div>

          <!-- Dark Shelf Lip with Authentic Physical Price Tag Clip -->
          <div class="shelf-lip-rail">
            <div class="price-tag-clip">
              <span class="clip-code">${n.code}</span>
              <span class="clip-divider">|</span>
              <span class="clip-price">${n.priceDisplay}</span>
            </div>
          </div>
        `;let l=r.querySelector(".package-photo");l&&l.addEventListener("error",()=>{l.src!==d&&(l.src=d)}),r.addEventListener("click",()=>{this.handleItemSelect(n.code,"shelf")}),r.addEventListener("keydown",p=>{(p.key==="Enter"||p.key===" ")&&(p.preventDefault(),this.handleItemSelect(n.code,"shelf"))}),a.appendChild(r)}),s.appendChild(a),this.shelvesChamber.appendChild(s)}),this.syncSlotHighlightsAndBadges()}bindEvents(){let t=()=>{this.sound.unlock(),window.removeEventListener("pointerdown",t)};window.addEventListener("pointerdown",t,{passive:!0}),document.querySelectorAll(".keypad-btn").forEach(s=>{s.addEventListener("click",()=>{let a=s.getAttribute("data-key");a&&this.handleKeypadPress(a,s)})}),this.muteToggleBtn.addEventListener("click",()=>{let s=this.sound.toggleMute();this.muteToggleBtn.setAttribute("aria-pressed",String(s)),this.muteIcon.textContent=s?"Sound off":"Sound on",this.muteLabel.textContent=s?"Sound Muted":"Sound On"}),this.quickPayBtn.addEventListener("click",()=>{this.triggerQuickPay()});let i=()=>{this.hasUncollectedReceipt||this.lastDispensedItems.length>0?(this.sound.playTapTone(1040),this.openReceiptModal()):(this.sound.playTapTone(620),this.chuteFlap.classList.remove("is-bouncing"),this.chuteFlap.offsetWidth,this.chuteFlap.classList.add("is-bouncing"))};this.chuteTarget.addEventListener("click",i),this.chuteTarget.addEventListener("keydown",s=>{(s.key==="Enter"||s.key===" ")&&(s.preventDefault(),i())}),this.closeReceiptBtn.addEventListener("click",()=>{this.sound.playTapTone(880),this.closeReceiptModal()}),this.receiptModalBackdrop.addEventListener("click",s=>{s.target===this.receiptModalBackdrop&&this.closeReceiptModal()}),this.shareGiftBtn.addEventListener("click",()=>{this.handleShareGift()}),document.addEventListener("keydown",s=>{if(!this.receiptModalBackdrop.hidden&&(s.key==="Escape"&&this.closeReceiptModal(),s.key==="Tab")){let a=this.shareGiftBtn,n=this.closeReceiptBtn;s.shiftKey&&document.activeElement===a?(s.preventDefault(),n.focus()):!s.shiftKey&&document.activeElement===n&&(s.preventDefault(),a.focus())}})}handleKeypadPress(t,e){if(this.isDispensing||this.isWaitingForPayment)return;e.classList.add("is-pressed"),setTimeout(()=>e.classList.remove("is-pressed"),120);let i=document.querySelectorAll(".keypad-btn.letter-key");if(t==="CLR"){this.sound.playTapTone(640),this.keypadLetterBuffer=null,this.activeSlotCode=null,i.forEach(s=>s.classList.remove("active-buffer")),this.updateLedDisplay("SELECT ITEM...","Tap any shelf item or enter code","READY"),this.syncSlotHighlightsAndBadges();return}if(t==="A"||t==="B"||t==="C"||t==="D"){this.sound.playTapTone(980),this.keypadLetterBuffer=t,i.forEach(s=>{s.classList.toggle("active-buffer",s.getAttribute("data-key")===t)}),this.updateLedDisplay(`${t}_ : ENTER 1 OR 2`,"Press 1 or 2 to complete slot code",`ROW ${t}`);return}if(t==="1"||t==="2"){let a=`${this.keypadLetterBuffer||(this.activeSlotCode?this.activeSlotCode.charAt(0):"A")}${t}`;i.forEach(n=>n.classList.remove("active-buffer")),this.keypadLetterBuffer=null,this.handleItemSelect(a,"keypad")}}handleItemSelect(t,e){if(this.isDispensing||this.isWaitingForPayment)return;let i=t.toUpperCase().trim(),s=this.catalog.find(r=>r.code===i);if(!s){this.sound.playTapTone(420),this.updateLedDisplay(`INVALID: ${i}`,"Choose an available supply, A1\u2013D2","ERR");return}this.sound.playTapTone(e==="keypad"?1220:1080),this.activeSlotCode=s.code;let a=this.cart.get(s.id);if((a?.quantity??0)>=10||this.getTotalCount()>=20){this.updateLedDisplay("SELECTION LIMIT","Up to 10 of each supply and 20 items total","LIMIT");return}a?a.quantity+=1:this.cart.set(s.id,{id:s.id,code:s.code,brand:s.brand,name:s.name,priceCents:s.priceCents,priceDisplay:s.priceDisplay,impactNote:s.impactNote,imageUrl:s.imageUrl,quantity:1});let n=`${s.code}: ${s.brand.toUpperCase()} - ${s.priceDisplay}`;this.updateLedDisplay(n,s.impactNote,`SLOT ${s.code}`),this.syncSlotHighlightsAndBadges(),this.renderCartTray()}adjustCartQuantity(t,e){if(this.isDispensing||this.isWaitingForPayment)return;let i=this.cart.get(t);if(i){if(e>0&&(i.quantity>=10||this.getTotalCount()>=20)){this.updateLedDisplay("SELECTION LIMIT","Up to 10 of each supply and 20 items total","LIMIT");return}if(this.sound.playTapTone(e>0?1160:820),i.quantity+=e,i.quantity<=0){if(this.cart.delete(t),this.activeSlotCode===i.code){let s=this.getCartItemsArray(),a=s[s.length-1];a?(this.activeSlotCode=a.code,this.updateLedDisplay(`${a.code}: ${a.brand.toUpperCase()} - ${a.priceDisplay}`,a.impactNote,`SLOT ${a.code}`)):(this.activeSlotCode=null,this.updateLedDisplay("SELECT ITEM...","Tap any shelf item or enter code","READY"))}}else this.activeSlotCode=i.code,this.updateLedDisplay(`${i.code}: ${i.brand.toUpperCase()} - ${i.priceDisplay}`,i.impactNote,`QTY \xD7${i.quantity}`);this.syncSlotHighlightsAndBadges(),this.renderCartTray()}}updateLedDisplay(t,e,i,s=!1){this.ledMatrixText.textContent=t,this.ledImpactSubtext.textContent=e,this.ledCodeBadge.textContent=i,this.ledMatrixText.classList.toggle("is-flashing",s),this.ledIndicatorDot.classList.toggle("vending",s)}syncSlotHighlightsAndBadges(){this.shelvesChamber.querySelectorAll(".vending-slot").forEach(e=>{let i=e.getAttribute("data-code")||"",s=Array.from(this.cart.values()).find(r=>r.code===i),a=s?s.quantity:0;e.classList.toggle("is-selected",i===this.activeSlotCode||a>0);let n=e.querySelector(`[data-qty-badge="${i}"]`);n&&(n.textContent=`\xD7${a}`,n.classList.toggle("visible",a>0))})}getCartItemsArray(){return Array.from(this.cart.values())}getTotalCents(t=this.getCartItemsArray()){return t.reduce((e,i)=>e+i.priceCents*i.quantity,0)}getTotalCount(t=this.getCartItemsArray()){return t.reduce((e,i)=>e+i.quantity,0)}formatDollars(t){let e=t/100;return Number.isInteger(e)?`$${e}`:`$${e.toFixed(2)}`}renderCartTray(){let t=this.getCartItemsArray(),e=this.getTotalCount(t),i=this.getTotalCents(t),s=this.formatDollars(i);window.parent.postMessage({type:"RESCUE_VEND_CART",items:t.map(({id:n,quantity:r})=>({id:n,quantity:r}))},window.location.origin),this.trayBadgeCount.textContent=String(e);let a=t.find(n=>n.code===this.activeSlotCode)||t[t.length-1];if(a?this.trayImpactPreview.textContent=`\u2605 ${a.impactNote}`:this.trayImpactPreview.textContent="Tap a product on the shelf to sponsor shelter care",this.trayItemsList.innerHTML="",t.length===0){let n=document.createElement("div");n.className="tray-empty-placeholder",n.textContent="No supplies selected yet \u2014 tap A1\u2013D2 above to fill the tray.",this.trayItemsList.appendChild(n)}else t.forEach(n=>{let r=document.createElement("div");r.className="tray-item-pill",r.setAttribute("role","listitem"),r.innerHTML=`
          <div class="tray-item-info">
            <div class="tray-item-top">
              <span class="tray-item-code">${n.code}</span>
              <span class="tray-item-name">${f(n.name)}</span>
            </div>
            <span class="tray-item-sub">${n.priceDisplay} each</span>
          </div>
          <div class="tray-qty-controls">
            <button type="button" class="qty-adj-btn" data-action="dec" aria-label="Decrease quantity of ${f(n.name)}">\u2212</button>
            <span class="tray-qty-value">${n.quantity}</span>
            <button type="button" class="qty-adj-btn" data-action="inc" aria-label="Increase quantity of ${f(n.name)}">+</button>
          </div>
        `;let d=r.querySelector('[data-action="dec"]'),l=r.querySelector('[data-action="inc"]');d.addEventListener("click",()=>this.adjustCartQuantity(n.id,-1)),l.addEventListener("click",()=>this.adjustCartQuantity(n.id,1)),this.trayItemsList.appendChild(r)});this.isDispensing?(this.quickPayBtn.disabled=!0,this.quickPayBtn.classList.remove("is-waiting"),this.quickPayBtnText.textContent="DISPENSING SUPPLIES..."):this.isWaitingForPayment?(this.quickPayBtn.disabled=!0,this.quickPayBtn.classList.add("is-waiting"),this.quickPayBtnText.textContent="WAITING FOR PAYMENT..."):e===0?(this.quickPayBtn.disabled=!0,this.quickPayBtn.classList.remove("is-waiting"),this.quickPayBtnText.textContent="SELECT ITEMS TO SPONSOR ($0)"):(this.quickPayBtn.disabled=!1,this.quickPayBtn.classList.remove("is-waiting"),this.quickPayBtnText.textContent=`DONATE & DISPENSE (${s})`)}triggerQuickPay(){if(this.isDispensing||this.isWaitingForPayment)return;let t=this.getCartItemsArray();if(t.length===0)return;this.sound.playTapTone(1320),this.isWaitingForPayment=!0,this.contactlessReader.classList.add("is-waiting");let e=this.getTotalCents(t);this.updateLedDisplay(`DONATE ${this.formatDollars(e)}`,"Opening secure Stripe checkout...","CHECKOUT",!0),this.renderCartTray(),window.parent.postMessage({type:"RESCUE_VEND_CHECKOUT",items:t.map(({id:i,quantity:s})=>({id:i,quantity:s}))},window.location.origin)}resetPaymentWaitingState(t="SELECT ITEM..."){if(this.isDispensing)return;this.isWaitingForPayment=!1,this.contactlessReader.classList.remove("is-waiting");let e=this.getCartItemsArray(),i=e[e.length-1];i?this.updateLedDisplay(`${i.code}: ${i.brand.toUpperCase()} - ${i.priceDisplay}`,i.impactNote,t,!1):this.updateLedDisplay(t,"Tap any shelf item or enter code","READY",!1),this.renderCartTray()}async runDispenseSequence(t){if(this.isDispensing||t.length===0)return;this.isWaitingForPayment=!1,this.isDispensing=!0,this.hasUncollectedReceipt=!1,this.chuteReceiptPrompt.hidden=!0,this.contactlessReader.classList.remove("is-waiting"),this.lastDispensedItems=t.map(i=>({...i})),this.renderCartTray();let e=[];for(let i of t)for(let s=0;s<i.quantity;s++)e.push(i);for(let i=0;i<e.length;i++){let s=e[i];await this.dispenseSingleUnit(s),i<e.length-1&&await this.delay(240)}this.sound.playCompletionChime(),this.isDispensing=!1,this.hasUncollectedReceipt=!0,this.cart.clear(),this.activeSlotCode=null,this.syncSlotHighlightsAndBadges(),this.renderCartTray(),this.chuteReceiptPrompt.hidden=!1,this.updateLedDisplay("THANK YOU! COLLECT BELOW","Tap the delivery chute for your Shelter Impact Receipt","COMPLETE",!1)}async dispenseSingleUnit(t){this.updateLedDisplay(`VENDING ${t.code}...`,t.impactNote,"DISPENSE",!0);let e=this.shelvesChamber.querySelector(`.vending-slot[data-code="${t.code}"]`),i=e?.querySelector(`[data-package="${t.code}"]`);if(!e||!i){await this.delay(750);return}e.classList.add("is-vending","is-spinning-coil"),this.sound.playCoilMotor(750),await this.delay(220);let s=this.dropChamberLayer.getBoundingClientRect(),a=i.getBoundingClientRect(),n=a.left-s.left,r=a.top-s.top,d=Math.max(180,s.height-r+25),l=i.cloneNode(!0);l.className="product-package-3d falling-package-clone",l.style.left=`${n}px`,l.style.top=`${r}px`,l.style.setProperty("--drop-distance",`${d}px`),i.style.opacity="0.32",this.dropChamberLayer.appendChild(l),await this.delay(740),this.sound.playChuteImpact(),this.chuteFlap.classList.remove("is-bouncing"),this.chuteFlap.offsetWidth,this.chuteFlap.classList.add("is-bouncing"),await this.delay(280),e.classList.remove("is-vending","is-spinning-coil"),i.style.opacity="1",l.remove()}openReceiptModal(){let t=this.lastDispensedItems;if(t.length===0)return;this.hasUncollectedReceipt=!1,this.chuteReceiptPrompt.hidden=!0;let e=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});this.receiptMeta.textContent=`DISPENSED AT ${e} \u2022 SYMBOLIC DONATION`,this.receiptItemsList.innerHTML="",t.forEach(s=>{let a=document.createElement("li");a.className="receipt-line-item";let n=this.formatDollars(s.priceCents*s.quantity);a.innerHTML=`
        <div class="receipt-line-left">
          <span class="receipt-line-title">${s.quantity}\xD7 [${s.code}] ${f(s.name)}</span>
          <span class="receipt-line-impact">${f(s.impactNote)}</span>
        </div>
        <span class="receipt-line-price">${n}</span>
      `,this.receiptItemsList.appendChild(a)});let i=this.getTotalCents(t);this.receiptTotalAmount.textContent=this.formatDollars(i),this.shareGiftBtnText.textContent="Share My Gift",this.receiptModalBackdrop.hidden=!1,this.receiptFocus=document.activeElement,document.querySelector(".app-shell")?.setAttribute("inert",""),this.closeReceiptBtn.focus()}closeReceiptModal(){this.receiptModalBackdrop.hidden=!0,document.querySelector(".app-shell")?.removeAttribute("inert"),this.receiptFocus?.focus(),this.updateLedDisplay("SELECT ITEM...","Tap any shelf item or enter code","READY",!1)}async handleShareGift(){await L(this.shareGiftBtn)}delay(t){return new Promise(e=>setTimeout(e,window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:t))}},m=null,M=!1;window.addEventListener("message",c=>{if(c.origin!==window.location.origin||c.source!==window.parent||window.parent===window)return;let t=c.data;if(t?.type==="RESCUE_VEND_INIT"&&!m&&Array.isArray(t.items)){k(t.shareUrl),window.RESCUE_VENDING_ITEMS=t.items.filter(a=>a&&/^[A-D][12]$/.test(a.code)&&/^[a-z0-9-]+$/.test(a.id)&&typeof a.name=="string"&&Number.isInteger(a.priceCents)&&a.priceCents>=100).map(w);let e=typeof t.machineTitle=="string"?t.machineTitle.slice(0,80):"Rescue Vend";document.querySelector(".marquee-title").textContent=e,document.getElementById("machine-utility-title").textContent=e,m=new E(Array.isArray(t.cart)?t.cart:[]);let i=document.querySelector(".app-shell"),s=()=>window.parent.postMessage({type:"RESCUE_VEND_HEIGHT",height:Math.ceil(i.getBoundingClientRect().height)+2},window.location.origin);new ResizeObserver(s).observe(i),s(),window.parent.postMessage({type:"RESCUE_VEND_READY"},window.location.origin)}if(t?.type==="RESCUE_VEND_RESET"&&m?.resetPaymentWaitingState(),t?.type==="RESCUE_VEND_PAID"&&!M&&m&&Array.isArray(t.items)&&t.items.length){let e=t.items.filter(i=>i&&/^[A-D][12]$/.test(i.code)&&typeof i.name=="string"&&Number.isInteger(i.priceCents)&&Number.isInteger(i.quantity)&&i.quantity>0&&i.quantity<=10).map(i=>({...w(i),quantity:i.quantity}));if(!e.length||e.reduce((i,s)=>i+s.quantity,0)>20)return;M=!0,m.runDispenseSequence(e)}});})();
