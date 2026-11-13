"use strict";(()=>{var D=Object.defineProperty;var H=(d,e,t)=>e in d?D(d,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):d[e]=t;var l=(d,e,t)=>H(d,typeof e!="symbol"?e+"":e,t);var w=[{code:"A1",id:"treats",name:"Peanut Butter Treats",priceCents:500,impactNote:"Training rewards",badgeColor:"#f59e0b",imageUrl:""},{code:"A2",id:"toy",name:"Squeaky Plush Toy",priceCents:800,impactNote:"Kennel enrichment",badgeColor:"#ec4899",imageUrl:""},{code:"B1",id:"shampoo",name:"Oatmeal Dog Shampoo",priceCents:1200,impactNote:"Soothing intake baths",badgeColor:"#06b6d4",imageUrl:""},{code:"B2",id:"hay",name:"Sanctuary Hay Bale",priceCents:1500,impactNote:"Feed for rescue horses",badgeColor:"#84cc16",imageUrl:""},{code:"C1",id:"flea",name:"Flea & Tick Chew",priceCents:1800,impactNote:"Parasite prevention support",badgeColor:"#8b5cf6",imageUrl:""},{code:"C2",id:"microchip",name:"Microchip & ID Tag",priceCents:2e3,impactNote:"Lost-pet protection",badgeColor:"#3b82f6",imageUrl:""},{code:"D1",id:"heartworm",name:"Heartworm Prevention",priceCents:2500,impactNote:"Preventative care support",badgeColor:"#ef4444",imageUrl:""},{code:"D2",id:"kibble",name:"30lb Bag of Kibble",priceCents:3500,impactNote:"Food for foster dogs",badgeColor:"#10b981",imageUrl:""}];function V(d){if(!d)return"";let e=d.trim(),t=e.match(/^\[([^\]]+)\]\(([^)]+)\)$/);return t?t[2].trim():e}function b(){return(typeof window<"u"&&Array.isArray(window.VENDING_INVENTORY)?window.VENDING_INVENTORY:w).map(e=>({...e,code:String(e.code).toUpperCase().trim(),imageUrl:V(e.imageUrl)}))}var $={treats:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
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
  </svg>`};function h(d){let e=d.id.toLowerCase(),t=$[e];if(t)return`data:image/svg+xml;utf8,${encodeURIComponent(t)}`;let o=d.name.replace(/[<>&"']/g,"").slice(0,16).toUpperCase(),s=d.code.replace(/[<>&"']/g,"").slice(0,4),i=d.badgeColor||"#38bdf8",r=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
    <rect width="160" height="160" rx="22" fill="#1e293b"/>
    <circle cx="80" cy="74" r="44" fill="${i}" opacity="0.22"/>
    <rect x="36" y="34" width="88" height="92" rx="16" fill="${i}" stroke="#f8fafc" stroke-width="3"/>
    <circle cx="80" cy="70" r="20" fill="#0f172a" opacity="0.35"/>
    <text x="80" y="76" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="900" font-size="16" fill="#ffffff">${s}</text>
    <rect x="44" y="98" width="72" height="18" rx="5" fill="#0f172a" opacity="0.75"/>
    <text x="80" y="110" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="8.5" fill="#f8fafc">${o}</text>
  </svg>`;return`data:image/svg+xml;utf8,${encodeURIComponent(r)}`}var y=class{constructor(){l(this,"ctx",null);l(this,"muted",!1);l(this,"unlocked",!1);this.setupAutoUnlock()}setupAutoUnlock(){if(typeof window>"u")return;let e=()=>{this.ensureContext(),this.ctx&&this.ctx.state==="suspended"&&this.ctx.resume().catch(()=>{}),this.unlocked=!0};window.addEventListener("pointerdown",e,{passive:!0}),window.addEventListener("touchstart",e,{passive:!0}),window.addEventListener("keydown",e,{passive:!0})}ensureContext(){if(this.muted||typeof window>"u")return null;if(!this.ctx){let e=window.AudioContext||window.webkitAudioContext;e&&(this.ctx=new e)}return this.ctx&&this.ctx.state==="suspended"&&this.ctx.resume().catch(()=>{}),this.ctx}isMuted(){return this.muted}setMuted(e){this.muted=e}toggleMute(){return this.muted=!this.muted,this.muted||this.playKeypadBeep("A"),this.muted}playKeypadBeep(e="1"){let t=this.ensureContext();if(!t)return;let o=t.currentTime,s={A:[697,1209],B:[770,1209],C:[852,1209],D:[941,1209],1:[697,1336],2:[770,1477],CLR:[540,900],PLUS:[770,1633],MINUS:[697,1100]},[i,r]=s[e.toUpperCase()]||[740,1380],n=t.createOscillator(),a=t.createOscillator(),c=t.createGain();n.type="sine",a.type="triangle",n.frequency.setValueAtTime(i,o),a.frequency.setValueAtTime(r,o),c.gain.setValueAtTime(.001,o),c.gain.exponentialRampToValueAtTime(.14,o+.008),c.gain.exponentialRampToValueAtTime(1e-4,o+.095),n.connect(c),a.connect(c),c.connect(t.destination),n.start(o),a.start(o),n.stop(o+.1),a.stop(o+.1)}playSelectItem(){let e=this.ensureContext();if(!e)return;let t=e.currentTime;[880,1318.5].forEach((s,i)=>{let r=t+i*.055,n=e.createOscillator(),a=e.createGain();n.type="triangle",n.frequency.setValueAtTime(s,r),a.gain.setValueAtTime(.001,r),a.gain.exponentialRampToValueAtTime(.15,r+.01),a.gain.exponentialRampToValueAtTime(1e-4,r+.09),n.connect(a),a.connect(e.destination),n.start(r),n.stop(r+.095)})}playErrorBeep(){let e=this.ensureContext();if(!e)return;let t=e.currentTime;for(let o=0;o<2;o++){let s=t+o*.09,i=e.createOscillator(),r=e.createGain();i.type="sawtooth",i.frequency.setValueAtTime(210,s),r.gain.setValueAtTime(.001,s),r.gain.exponentialRampToValueAtTime(.1,s+.01),r.gain.exponentialRampToValueAtTime(1e-4,s+.075),i.connect(r),r.connect(e.destination),i.start(s),i.stop(s+.08)}}playCoilMotor(e=600){let t=this.ensureContext();if(!t)return;let o=t.currentTime,s=e/1e3,i=t.createOscillator(),r=t.createOscillator(),n=t.createOscillator(),a=t.createGain(),c=t.createBiquadFilter(),p=t.createGain();i.type="sawtooth",i.frequency.setValueAtTime(118,o),i.frequency.linearRampToValueAtTime(136,o+s*.25),i.frequency.setValueAtTime(132,o+s*.8),i.frequency.linearRampToValueAtTime(92,o+s),r.type="square",r.frequency.setValueAtTime(59,o),r.frequency.linearRampToValueAtTime(66,o+s*.8),n.type="sine",n.frequency.setValueAtTime(28,o),a.gain.setValueAtTime(18,o),c.type="bandpass",c.frequency.setValueAtTime(340,o),c.Q.setValueAtTime(2.4,o),p.gain.setValueAtTime(.001,o),p.gain.linearRampToValueAtTime(.14,o+.045),p.gain.setValueAtTime(.13,o+s-.06),p.gain.exponentialRampToValueAtTime(1e-4,o+s),n.connect(a),a.connect(i.frequency),i.connect(c),r.connect(c),c.connect(p),p.connect(t.destination),i.start(o),r.start(o),n.start(o),i.stop(o+s),r.stop(o+s),n.stop(o+s)}playItemDrop(){let e=this.ensureContext();if(!e)return;let t=e.currentTime,o=e.createOscillator(),s=e.createGain();o.type="sine",o.frequency.setValueAtTime(165,t),o.frequency.exponentialRampToValueAtTime(42,t+.16),s.gain.setValueAtTime(.32,t),s.gain.exponentialRampToValueAtTime(.001,t+.19),o.connect(s),s.connect(e.destination),o.start(t),o.stop(t+.2);let i=e.createOscillator(),r=e.createBiquadFilter(),n=e.createGain();i.type="triangle",i.frequency.setValueAtTime(420,t+.015),i.frequency.exponentialRampToValueAtTime(115,t+.11),r.type="bandpass",r.frequency.setValueAtTime(520,t+.015),r.Q.setValueAtTime(3.5,t+.015),n.gain.setValueAtTime(.24,t+.015),n.gain.exponentialRampToValueAtTime(.001,t+.13),i.connect(r),r.connect(n),n.connect(e.destination),i.start(t+.015),i.stop(t+.14);let a=e.createOscillator(),c=e.createGain();a.type="sine",a.frequency.setValueAtTime(130,t+.095),a.frequency.exponentialRampToValueAtTime(52,t+.19),c.gain.setValueAtTime(.16,t+.095),c.gain.exponentialRampToValueAtTime(.001,t+.2),a.connect(c),c.connect(e.destination),a.start(t+.095),a.stop(t+.21)}playVictoryChime(){let e=this.ensureContext();if(!e)return;let t=e.currentTime,o=[{freq:523.25,delay:0,duration:.13},{freq:659.25,delay:.11,duration:.13},{freq:783.99,delay:.22,duration:.14},{freq:1046.5,delay:.34,duration:.42}];for(let s of o){let i=t+s.delay,r=e.createOscillator(),n=e.createOscillator(),a=e.createGain();r.type="triangle",n.type="square",r.frequency.setValueAtTime(s.freq,i),n.frequency.setValueAtTime(s.freq*.5,i),a.gain.setValueAtTime(.001,i),a.gain.exponentialRampToValueAtTime(.18,i+.015),a.gain.exponentialRampToValueAtTime(1e-4,i+s.duration);let c=e.createGain();c.gain.setValueAtTime(.04,i),r.connect(a),n.connect(c),c.connect(a),a.connect(e.destination),r.start(i),n.start(i),r.stop(i+s.duration+.02),n.stop(i+s.duration+.02)}}};var E=class{constructor(e=[]){l(this,"inventory",[]);l(this,"cart",new Map);l(this,"selectedCode",null);l(this,"popoverCode",null);l(this,"pendingKeypadLetter",null);l(this,"isDispensing",!1);l(this,"isWaitingForCheckout",!1);l(this,"lastDispensedItems",[]);l(this,"sound");l(this,"shelvesGrid");l(this,"physicsStage");l(this,"flyingLayer");l(this,"lcdScreen");l(this,"lcdStatusCode");l(this,"lcdCartTotal");l(this,"lcdMainLine");l(this,"lcdSubLine");l(this,"cartStrip");l(this,"cartCountBadge");l(this,"stickyTotalAmount");l(this,"checkoutBtn");l(this,"checkoutBtnText");l(this,"popoverEl");l(this,"deliveryChute");l(this,"chuteDroppedTray");l(this,"collectBadge");l(this,"collectCountPill");l(this,"receiptBackdrop");l(this,"receiptItemsList");l(this,"receiptTotalValue");l(this,"receiptMeta");l(this,"muteBtn");l(this,"muteIcon");l(this,"toastBanner");this.sound=new y,this.inventory=b();for(let t of e){let o=this.inventory.find(s=>s.id===t.id);o&&Number.isInteger(t.quantity)&&t.quantity>0&&t.quantity<=10&&Array.from(this.cart.values()).reduce((s,i)=>s+i,0)+t.quantity<=20&&this.cart.set(o.code,t.quantity)}this.bindDomElements(),this.renderShelves(),this.renderCart(),this.updateLcdReadout(),this.attachEventListeners()}bindDomElements(){this.shelvesGrid=document.getElementById("shelves-grid"),this.physicsStage=document.getElementById("physics-drop-stage"),this.flyingLayer=document.getElementById("flying-clone-layer"),this.lcdScreen=document.getElementById("lcd-screen"),this.lcdStatusCode=document.getElementById("lcd-status-code"),this.lcdCartTotal=document.getElementById("lcd-cart-total"),this.lcdMainLine=document.getElementById("lcd-main-line"),this.lcdSubLine=document.getElementById("lcd-sub-line"),this.cartStrip=document.getElementById("cart-items-strip"),this.cartCountBadge=document.getElementById("cart-count-badge"),this.stickyTotalAmount=document.getElementById("sticky-total-amount"),this.checkoutBtn=document.getElementById("checkout-dispense-btn"),this.checkoutBtnText=document.getElementById("checkout-btn-text"),this.popoverEl=document.getElementById("cart-item-popover"),this.deliveryChute=document.getElementById("delivery-chute"),this.chuteDroppedTray=document.getElementById("chute-dropped-tray"),this.collectBadge=document.getElementById("collect-items-badge"),this.collectCountPill=document.getElementById("collect-count-pill"),this.receiptBackdrop=document.getElementById("receipt-modal-backdrop"),this.receiptItemsList=document.getElementById("receipt-items-list"),this.receiptTotalValue=document.getElementById("receipt-total-value"),this.receiptMeta=document.getElementById("receipt-meta"),this.muteBtn=document.getElementById("mute-toggle-btn"),this.muteIcon=document.getElementById("mute-icon"),this.toastBanner=document.getElementById("toast-banner")}resetCheckout(){this.isWaitingForCheckout=!1,this.renderCart(),this.updateLcdReadout()}createSpiralCoilSvg(e){return`
      <svg class="spiral-coil-svg" data-coil="${e}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="metal-coil-${e}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#f8fafc"/>
            <stop offset="35%" stop-color="#94a3b8"/>
            <stop offset="70%" stop-color="#334155"/>
            <stop offset="100%" stop-color="#cbd5e1"/>
          </linearGradient>
        </defs>
        <!-- Back mounting hub -->
        <circle cx="50" cy="50" r="10" fill="#0f172a" stroke="#475569" stroke-width="2.5"/>
        <!-- Outer helix ring -->
        <circle cx="50" cy="50" r="41" fill="none" stroke="#1e293b" stroke-width="7" opacity="0.8"/>
        <circle cx="50" cy="50" r="41" fill="none" stroke="url(#metal-coil-${e})" stroke-width="4.5" stroke-dasharray="195 25" stroke-linecap="round"/>
        <!-- Middle 3D coil loop -->
        <circle cx="50" cy="50" r="29" fill="none" stroke="#0f172a" stroke-width="6.5" opacity="0.85"/>
        <circle cx="50" cy="50" r="29" fill="none" stroke="url(#metal-coil-${e})" stroke-width="4.2" stroke-dasharray="140 22" stroke-dashoffset="35" stroke-linecap="round"/>
        <!-- Inner helix loop & pusher tip -->
        <circle cx="50" cy="50" r="18" fill="none" stroke="url(#metal-coil-${e})" stroke-width="3.8" stroke-dasharray="85 18" stroke-dashoffset="70" stroke-linecap="round"/>
        <!-- Pusher wire end -->
        <line x1="50" y1="50" x2="50" y2="91" stroke="url(#metal-coil-${e})" stroke-width="4.5" stroke-linecap="round"/>
        <circle cx="50" cy="91" r="3.5" fill="#fde68a" stroke="#0f172a" stroke-width="1.2"/>
      </svg>
    `}formatDollars(e,t=!1){let o=e/100;return t&&e%100===0?`$${o.toFixed(0)}`:`$${o.toFixed(2)}`}renderShelves(){this.inventory=b(),this.shelvesGrid.innerHTML="";for(let e of this.inventory){let t=this.cart.get(e.code)||0,o=this.selectedCode===e.code||t>0,s=h(e),i=e.imageUrl||s,r=document.createElement("div");r.className=`vending-slot${o?" selected-slot":""}`,r.dataset.code=e.code,r.setAttribute("role","button"),r.tabIndex=0,r.setAttribute("aria-label",`Slot ${e.code}: ${e.name}, ${this.formatDollars(e.priceCents)}. ${e.impactNote}`),r.innerHTML=`
        <div class="coil-wrapper" aria-hidden="true">
          ${this.createSpiralCoilSvg(e.code)}
        </div>
        ${t>0?`<span class="slot-qty-badge" aria-label="${t} in cart">x${t}</span>`:""}
        <div class="slot-product-visual" data-visual="${e.code}">
          <div class="slot-product-img-frame" style="border-color: ${e.badgeColor}">
            <img
              class="slot-product-img"
              src="${i}"
              alt="${e.name}"
              loading="eager"
            />
          </div>
          <span class="slot-product-name">${e.name}</span>
        </div>
        <div class="shelf-price-badge">
          <span class="badge-slot-code">${e.code}</span>
          <span class="badge-dot">\u2022</span>
          <span class="badge-slot-price">${this.formatDollars(e.priceCents,!0)}</span>
        </div>
      `;let n=r.querySelector("img");n.addEventListener("error",()=>{n.src!==s&&(n.src=s)}),r.addEventListener("click",()=>{this.isDispensing||this.handleProductSelect(e.code,!0)}),r.addEventListener("keydown",a=>{(a.key==="Enter"||a.key===" ")&&(a.preventDefault(),this.handleProductSelect(e.code,!0))}),this.shelvesGrid.appendChild(r)}}handleProductSelect(e,t=!0){if(this.isWaitingForCheckout||this.isDispensing)return;let o=e.toUpperCase().trim(),s=this.inventory.find(r=>r.code===o);if(!s){this.sound.playErrorBeep(),this.showLcdMessage(`ERR: ${o}`,"INVALID SLOT CODE","TRY A1 - D2",!0);return}this.pendingKeypadLetter=null,this.selectedCode=s.code;let i=this.cart.get(s.code)||0;if(i>=10||this.getCartPayload().totalCount>=20){this.showToast("Limit: 10 of each supply and 20 items per donation.");return}this.cart.set(s.code,i+1),this.sound.playSelectItem(),this.refreshShelfSelectionStates(),this.renderCart(),this.updateLcdReadout(s),t&&this.animateFlyingCopyToCart(s)}refreshShelfSelectionStates(){this.shelvesGrid.querySelectorAll(".vending-slot").forEach(t=>{let o=t.dataset.code||"",s=this.cart.get(o)||0,i=this.selectedCode===o||s>0;t.classList.toggle("selected-slot",i);let r=t.querySelector(".slot-qty-badge");s>0?(r||(r=document.createElement("span"),r.className="slot-qty-badge",t.appendChild(r)),r.textContent=`x${s}`):r&&r.remove()})}animateFlyingCopyToCart(e){if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;let t=this.shelvesGrid.querySelector(`.vending-slot[data-code="${e.code}"]`);if(!t)return;let o=t.querySelector(".slot-product-img"),s=(o||t).getBoundingClientRect(),i=this.cartStrip.getBoundingClientRect(),r=document.createElement("div");r.className="flying-mini-copy",r.style.left=`${s.left+s.width/2-22}px`,r.style.top=`${s.top+s.height/2-22}px`,r.style.borderColor=e.badgeColor;let n=document.createElement("img");n.src=o?o.src:h(e),n.alt="",r.appendChild(n),this.flyingLayer.appendChild(r);let a=i.left+Math.min(i.width*.5,140)-(s.left+s.width/2),c=i.top+i.height/2-(s.top+s.height/2);requestAnimationFrame(()=>{r.style.transform=`translate(${a}px, ${c}px) scale(0.55) rotate(12deg)`,r.style.opacity="0.25"}),window.setTimeout(()=>{r.remove()},500)}adjustCartQuantity(e,t){if(this.isDispensing||this.isWaitingForCheckout||!this.inventory.find(n=>n.code===e))return;let i=(this.cart.get(e)||0)+t;if(t>0&&(i>10||this.getCartPayload().totalCount>=20)){this.showToast("Limit: 10 of each supply and 20 items per donation.");return}if(i<=0){if(this.cart.delete(e),this.popoverCode===e&&(this.popoverCode=null),this.selectedCode===e){let n=Array.from(this.cart.keys());this.selectedCode=n.length>0?n[n.length-1]:null}}else this.cart.set(e,i),this.selectedCode=e;this.sound.playKeypadBeep(t>0?"PLUS":"MINUS"),this.refreshShelfSelectionStates(),this.renderCart(),this.renderPopover();let r=this.selectedCode?this.inventory.find(n=>n.code===this.selectedCode):void 0;this.updateLcdReadout(r)}removeCartItem(e){let t=this.cart.get(e)||0;t>0&&this.adjustCartQuantity(e,-t)}getCartPayload(){let e=[],t=0,o=0;for(let[s,i]of this.cart.entries()){if(i<=0)continue;let r=this.inventory.find(n=>n.code===s);r&&(e.push({id:r.id,code:r.code,name:r.name,priceCents:r.priceCents,quantity:i}),t+=r.priceCents*i,o+=i)}return{items:e,totalCents:t,totalCount:o}}updateLcdReadout(e){let{totalCents:t,totalCount:o}=this.getCartPayload();if(this.lcdScreen.classList.remove("amber-mode"),this.lcdCartTotal.textContent=this.formatDollars(t),this.pendingKeypadLetter){this.lcdStatusCode.textContent=`KEY: ${this.pendingKeypadLetter}_`,this.lcdMainLine.textContent=`SELECT ${this.pendingKeypadLetter}1 OR ${this.pendingKeypadLetter}2`,this.lcdSubLine.textContent="PRESS NUMBER KEY";return}let s=e||(this.selectedCode?this.inventory.find(i=>i.code===this.selectedCode):void 0);if(s){let i=s.name.toUpperCase().slice(0,14),r=this.cart.get(s.code)||0;this.lcdStatusCode.textContent=r>1?`${s.code} (x${r})`:s.code,this.lcdMainLine.textContent=`${s.code}: ${i} - ${this.formatDollars(s.priceCents)}`,this.lcdSubLine.textContent=s.impactNote.toUpperCase()}else o>0?(this.lcdStatusCode.textContent=`${o} ITEM${o>1?"S":""}`,this.lcdMainLine.textContent=`CART TOTAL: ${this.formatDollars(t)}`,this.lcdSubLine.textContent="READY TO DISPENSE"):(this.lcdStatusCode.textContent="READY",this.lcdMainLine.textContent="TAP ITEM OR KEY",this.lcdSubLine.textContent="SPONSOR SHELTER CARE")}showLcdMessage(e,t,o,s=!1){let{totalCents:i}=this.getCartPayload();this.lcdScreen.classList.toggle("amber-mode",s),this.lcdStatusCode.textContent=e,this.lcdCartTotal.textContent=this.formatDollars(i),this.lcdMainLine.textContent=t,this.lcdSubLine.textContent=o}renderCart(){let{items:e,totalCents:t,totalCount:o}=this.getCartPayload();if(window.parent.postMessage({type:"RESCUE_VEND_CART",items:e},window.location.origin),this.cartCountBadge.textContent=`${o} ${o===1?"item":"items"}`,this.stickyTotalAmount.textContent=this.formatDollars(t),!this.isWaitingForCheckout&&!this.isDispensing&&(this.checkoutBtn.disabled=o===0,this.checkoutBtn.classList.remove("waiting-state"),this.checkoutBtnText.textContent="DONATE & DISPENSE"),this.cartStrip.innerHTML="",e.length===0){let s=document.createElement("div");s.className="cart-empty-placeholder",s.textContent="Tap any supply inside the glass window or punch A1\u2013D2 on the keypad",this.cartStrip.appendChild(s),this.popoverCode=null,this.renderPopover();return}for(let s of e){let i=this.inventory.find(c=>c.code===s.code),r=h(i),n=document.createElement("div");n.className=`cart-chip${this.popoverCode===i.code?" active-chip":""}`,n.setAttribute("role","listitem"),n.innerHTML=`
        <div class="cart-chip-thumb-wrap" data-open-popover="${i.code}" title="Tap for shelter impact details">
          <img class="cart-chip-thumb" src="${i.imageUrl||r}" alt="${i.name}" />
          <span class="cart-chip-qty">x${s.quantity}</span>
        </div>
        <div class="cart-chip-info">
          <span class="cart-chip-code" data-open-popover="${i.code}">${i.code} \u2022 ${this.formatDollars(i.priceCents*s.quantity,!0)}</span>
          <div class="cart-chip-controls">
            <button type="button" class="chip-adj-btn" data-dec="${i.code}" aria-label="Remove one ${i.name}">\u2212</button>
            <button type="button" class="chip-adj-btn" data-inc="${i.code}" aria-label="Add one ${i.name}">+</button>
          </div>
        </div>
      `;let a=n.querySelector("img");a.addEventListener("error",()=>{a.src!==r&&(a.src=r)}),n.addEventListener("click",c=>{let p=c.target;if(p.dataset.dec){c.stopPropagation(),this.adjustCartQuantity(i.code,-1);return}if(p.dataset.inc){c.stopPropagation(),this.adjustCartQuantity(i.code,1);return}this.toggleItemPopover(i.code)}),this.cartStrip.appendChild(n)}}toggleItemPopover(e){this.sound.playKeypadBeep("1"),this.popoverCode===e?this.popoverCode=null:(this.popoverCode=e,this.selectedCode=e),this.renderCart(),this.renderPopover()}renderPopover(){if(!this.popoverCode){this.popoverEl.classList.add("hidden"),this.popoverEl.innerHTML="";return}let e=this.inventory.find(i=>i.code===this.popoverCode),t=this.cart.get(this.popoverCode)||0;if(!e||t<=0){this.popoverCode=null,this.popoverEl.classList.add("hidden");return}let o=h(e);this.popoverEl.classList.remove("hidden"),this.popoverEl.innerHTML=`
      <div class="popover-row">
        <img class="popover-thumb" src="${e.imageUrl||o}" alt="${e.name}" />
        <div class="popover-text">
          <h3 class="popover-title">${e.code}: ${e.name} (${this.formatDollars(e.priceCents)})</h3>
          <p class="popover-impact">\u{1F43E} Impact: ${e.impactNote}</p>
        </div>
        <button type="button" class="popover-close-btn" id="popover-close-btn" aria-label="Close item details">\u2715</button>
      </div>
      <div class="popover-actions">
        <div class="popover-qty-group">
          <button type="button" class="popover-step-btn" id="popover-dec-btn" aria-label="Decrease quantity">\u2212</button>
          <span class="popover-qty-num">${t} in cart (${this.formatDollars(e.priceCents*t)})</span>
          <button type="button" class="popover-step-btn" id="popover-inc-btn" aria-label="Increase quantity">+</button>
        </div>
        <button type="button" class="popover-remove-btn" id="popover-remove-btn">Remove</button>
      </div>
    `;let s=this.popoverEl.querySelector("img");s.addEventListener("error",()=>{s.src!==o&&(s.src=o)}),this.popoverEl.querySelector("#popover-close-btn")?.addEventListener("click",()=>{this.popoverCode=null,this.renderCart(),this.renderPopover()}),this.popoverEl.querySelector("#popover-dec-btn")?.addEventListener("click",()=>{this.adjustCartQuantity(e.code,-1)}),this.popoverEl.querySelector("#popover-inc-btn")?.addEventListener("click",()=>{this.adjustCartQuantity(e.code,1)}),this.popoverEl.querySelector("#popover-remove-btn")?.addEventListener("click",()=>{this.removeCartItem(e.code)})}handleKeypadPress(e){if(!(this.isDispensing||this.isWaitingForCheckout)){if(["A","B","C","D"].includes(e)){this.sound.playKeypadBeep(e),this.pendingKeypadLetter=e,this.updateLcdReadout();return}if(["1","2","3","4"].includes(e)){if(this.sound.playKeypadBeep(e),this.pendingKeypadLetter){let t=`${this.pendingKeypadLetter}${e}`;this.pendingKeypadLetter=null,this.handleProductSelect(t,!0)}else this.showLcdMessage("KEYPAD","PRESS A-D FIRST","THEN 1 OR 2",!0);return}if(e==="CLR"){this.sound.playKeypadBeep("CLR"),this.pendingKeypadLetter=null,this.popoverCode=null,this.selectedCode=null,this.renderPopover(),this.refreshShelfSelectionStates(),this.updateLcdReadout();return}if(e==="PLUS"){let t=this.selectedCode||Array.from(this.cart.keys()).pop()||this.inventory[0]?.code;t&&this.handleProductSelect(t,!0);return}if(e==="MINUS"){let t=this.selectedCode||Array.from(this.cart.keys()).pop();t&&(this.cart.get(t)||0)>0?this.adjustCartQuantity(t,-1):this.sound.playErrorBeep();return}if(e==="VEND"){let{totalCount:t}=this.getCartPayload();t>0?this.initiateCheckout():(this.sound.playErrorBeep(),this.showLcdMessage("EMPTY","CART IS EMPTY","SELECT AN ITEM FIRST",!0))}}}initiateCheckout(){if(this.isDispensing||this.isWaitingForCheckout)return;let{items:e,totalCents:t,totalCount:o}=this.getCartPayload();o!==0&&(this.sound.playKeypadBeep("A"),this.popoverCode=null,this.renderPopover(),this.isWaitingForCheckout=!0,this.checkoutBtn.disabled=!0,this.checkoutBtn.classList.add("waiting-state"),this.checkoutBtnText.textContent="WAITING FOR CHECKOUT...",this.showLcdMessage("CHECKOUT","WAITING FOR PAYMENT",`TOTAL: ${this.formatDollars(t)}`,!0),window.parent.postMessage({type:"RESCUE_VEND_CHECKOUT",items:e},window.location.origin))}async runDispenseSequence(e){if(this.isDispensing)return;let t=e&&e.length>0?e:this.getCartPayload().items;if(t.length===0)return;this.isDispensing=!0,this.isWaitingForCheckout=!1,this.popoverCode=null,this.renderPopover(),this.checkoutBtn.disabled=!0,this.checkoutBtn.classList.remove("waiting-state"),this.checkoutBtnText.textContent="DISPENSING SUPPLIES...",this.chuteDroppedTray.innerHTML="",this.collectBadge.classList.add("hidden"),this.deliveryChute.classList.remove("chute-has-items","flap-bounce");let o=[];for(let i of t){let n=this.inventory.find(c=>c.id===i.id)||w.find(c=>c.id===i.id)||{id:i.id,code:i.code,name:i.name,priceCents:i.priceCents,impactNote:"",badgeColor:"#45a896",imageUrl:""},a={...n,...i,impactNote:i.impactNote??n.impactNote};o.push({product:a,quantity:i.quantity});for(let c=0;c<Math.min(i.quantity,3);c++)this.showLcdMessage(`VEND ${a.code}`,`VENDING ${a.code}...`,a.name.toUpperCase(),!0),await this.spinCoilAndWhir(a.code,600),await this.animateGravityProductDrop(a),this.sound.playItemDrop(),this.triggerChuteFlapBounce(a),await this.delay(240)}this.lastDispensedItems=o;let s=o.reduce((i,r)=>i+r.quantity,0);this.sound.playVictoryChime(),this.showLcdMessage("COMPLETE!","THANK YOU, HERO!","TAP CHUTE TO COLLECT",!1),this.cart.clear(),this.selectedCode=null,this.refreshShelfSelectionStates(),this.isDispensing=!1,this.renderCart(),this.collectCountPill.textContent=`${s}`,this.collectBadge.classList.remove("hidden")}spinCoilAndWhir(e,t=600){return window.matchMedia("(prefers-reduced-motion: reduce)").matches?Promise.resolve():new Promise(o=>{let s=this.shelvesGrid.querySelector(`.vending-slot[data-code="${e}"]`),i=this.shelvesGrid.querySelector(`.spiral-coil-svg[data-coil="${e}"]`);s&&s.classList.add("dispensing-active"),i&&(i.classList.remove("spinning"),i.getBoundingClientRect(),i.classList.add("spinning")),this.sound.playCoilMotor(t),window.setTimeout(()=>{i&&i.classList.remove("spinning"),s&&s.classList.remove("dispensing-active"),o()},t)})}animateGravityProductDrop(e){return window.matchMedia("(prefers-reduced-motion: reduce)").matches?Promise.resolve():new Promise(t=>{let o=this.physicsStage.getBoundingClientRect(),s=this.shelvesGrid.querySelector(`.vending-slot[data-code="${e.code}"]`),i=s?.querySelector(".slot-product-img"),r=(i||s||this.shelvesGrid).getBoundingClientRect(),n=r.left-o.left+r.width/2-28,a=r.top-o.top+r.height/2-28,c=o.height-24,p=o.width/2-28,u=document.createElement("div");u.className="falling-product-clone",u.style.borderColor=e.badgeColor;let x=document.createElement("img");x.src=i?i.src:h(e),x.alt=e.name,u.appendChild(x),this.physicsStage.appendChild(u);let C=n,m=a,T=-65,I=(p-n)*.85,B=1950,k=0,R=(Math.random()>.5?1:-1)*(42+Math.random()*28),L=performance.now(),M=S=>{let g=Math.min((S-L)/1e3,.05);L=S,T+=B*g,m+=T*g,C+=I*g,k+=R*g,u.style.transform=`translate3d(${C}px, ${m}px, 0) rotate(${k}deg)`,m>=c?(u.remove(),t()):requestAnimationFrame(M)};u.style.transform=`translate3d(${C}px, ${m}px, 0) rotate(0deg)`,requestAnimationFrame(M)})}triggerChuteFlapBounce(e){this.deliveryChute.classList.remove("flap-bounce"),this.deliveryChute.getBoundingClientRect(),this.deliveryChute.classList.add("flap-bounce","chute-has-items");let t=document.createElement("img");t.className="chute-mini-item";let o=this.shelvesGrid.querySelector(`.vending-slot[data-code="${e.code}"] .slot-product-img`);t.src=o?o.src:h(e),t.alt=e.name;let s=(Math.random()*18-9).toFixed(1);t.style.setProperty("--tilt",`${s}deg`),this.chuteDroppedTray.children.length>=6&&this.chuteDroppedTray.removeChild(this.chuteDroppedTray.firstChild),this.chuteDroppedTray.appendChild(t)}openImpactReceiptModal(){if(this.lastDispensedItems.length===0){this.showToast("Dispense an item first to collect your Shelter Impact Receipt!");return}this.sound.playSelectItem(),this.receiptItemsList.innerHTML="";let e=0;for(let t of this.lastDispensedItems){let{product:o,quantity:s}=t,i=o.priceCents*s;e+=i;let r=h(o),n=document.createElement("div");n.className="receipt-line-item",n.setAttribute("role","listitem"),n.innerHTML=`
        <div class="receipt-line-left">
          <img class="receipt-line-thumb" src="${o.imageUrl||r}" alt="${o.name}" />
          <div>
            <div class="receipt-line-name">${s}x ${o.name} (${o.code})</div>
            <div class="receipt-line-impact">\u2713 ${o.impactNote}</div>
          </div>
        </div>
        <div class="receipt-line-price">${this.formatDollars(i)}</div>
      `;let a=n.querySelector("img");a.addEventListener("error",()=>{a.src!==r&&(a.src=r)}),this.receiptItemsList.appendChild(n)}this.receiptMeta.textContent="PAYMENT VERIFIED \u2022 SYMBOLIC DONATION",this.receiptTotalValue.textContent=this.formatDollars(e),this.receiptBackdrop.classList.remove("hidden")}closeImpactReceiptModal(){this.receiptBackdrop.classList.add("hidden"),this.collectBadge.classList.add("hidden"),this.chuteDroppedTray.innerHTML="",this.deliveryChute.classList.remove("chute-has-items","flap-bounce"),this.updateLcdReadout()}async shareDonationReceipt(){window.parent.postMessage({type:"RESCUE_VEND_SHARE"},window.location.origin)}showToast(e){this.toastBanner.textContent=e,this.toastBanner.classList.remove("hidden"),window.setTimeout(()=>{this.toastBanner.classList.add("hidden")},2800)}delay(e){return new Promise(t=>window.setTimeout(t,window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:e))}attachEventListeners(){document.getElementById("keypad-grid").addEventListener("click",t=>{let o=t.target.closest(".key-btn");!o||!o.dataset.key||this.handleKeypadPress(o.dataset.key)}),this.checkoutBtn.addEventListener("click",()=>{this.initiateCheckout()}),this.muteBtn.addEventListener("click",()=>{let t=this.sound.toggleMute();this.muteBtn.classList.toggle("muted",t),this.muteBtn.setAttribute("aria-pressed",String(t)),this.muteIcon.textContent=t?"SOUND OFF":"SOUND ON"}),this.deliveryChute.addEventListener("click",()=>{this.lastDispensedItems.length>0&&!this.isDispensing&&this.openImpactReceiptModal()}),this.deliveryChute.addEventListener("keydown",t=>{(t.key==="Enter"||t.key===" ")&&this.lastDispensedItems.length>0&&(t.preventDefault(),this.openImpactReceiptModal())}),document.getElementById("close-receipt-btn")?.addEventListener("click",()=>{this.closeImpactReceiptModal()}),document.getElementById("share-donation-btn")?.addEventListener("click",()=>{this.shareDonationReceipt()}),this.receiptBackdrop.addEventListener("click",t=>{t.target===this.receiptBackdrop&&this.closeImpactReceiptModal()})}},f=null,A=!1,v=d=>String(d).replace(/[&<>"']/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[e]);window.addEventListener("message",d=>{if(d.origin!==window.location.origin||d.source!==window.parent||window.parent===window)return;let e=d.data;if(e?.type==="RESCUE_VEND_INIT"&&!f&&Array.isArray(e.items)){let t=document.querySelector(".marquee-title");t&&(t.textContent=typeof e.machineTitle=="string"?e.machineTitle.slice(0,80):"Rescue Vend"),window.VENDING_INVENTORY=e.items.filter(i=>/^[A-D][12]$/.test(i.code)&&/^[a-z0-9-]+$/.test(i.id)).map(i=>({...i,name:v(i.name),impactNote:v(i.impactNote),badgeColor:/^#[0-9a-f]{6}$/i.test(i.badgeColor)?i.badgeColor:"#45a896",imageUrl:h(i)})),f=new E(Array.isArray(e.cart)?e.cart:[]);let o=document.querySelector(".app-shell"),s=()=>window.parent.postMessage({type:"RESCUE_VEND_HEIGHT",height:Math.ceil(o.getBoundingClientRect().height)+2},window.location.origin);new ResizeObserver(s).observe(o),s(),window.parent.postMessage({type:"RESCUE_VEND_READY"},window.location.origin)}if(e?.type==="RESCUE_VEND_RESET"&&f?.resetCheckout(),e?.type==="RESCUE_VEND_PAID"&&!A&&f&&Array.isArray(e.items)&&e.items.length){A=!0;let t=e.items.map(o=>({...o,name:v(o.name),impactNote:o.impactNote===void 0?void 0:v(o.impactNote)}));f.runDispenseSequence(t)}});})();
