import { useState, useRef } from "react";

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY;

function parseJSON(raw) {
  try { return JSON.parse(raw.trim()); } catch {}
  const s = raw.replace(/^```[\w]*\s*/m,"").replace(/\s*```\s*$/m,"").trim();
  try { return JSON.parse(s); } catch {}
  const m = raw.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch {}
  return null;
}

async function fetchWikiPhoto(name) {
  try {
    const searchRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name+" footballer")}&format=json&origin=*&srlimit=1`
    );
    const searchData = await searchRes.json();
    const title = searchData?.query?.search?.[0]?.title;
    if (!title) return null;
    const imgRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=400&format=json&origin=*`
    );
    const imgData = await imgRes.json();
    const pages = imgData?.query?.pages;
    const page = pages?.[Object.keys(pages)[0]];
    return page?.thumbnail?.source || null;
  } catch { return null; }
}

async function ai(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text || "";
}

function Dots({ color = "#C8A84B" }) {
  return (
    <span style={{ display:"inline-flex", gap:4, alignItems:"center" }}>
      {[0,1,2].map(i=>(
        <span key={i} style={{ width:5,height:5,borderRadius:"50%",background:color,
          animation:`blink 1.2s ${i*0.4}s infinite`,display:"inline-block" }}/>
      ))}
    </span>
  );
}

export default function App() {
  const [page, setPage] = useState("search");
  const [inp, setInp] = useState("");
  const [player, setPlayer] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [showFC26, setShowFC26] = useState(false);
  const [fc26Data, setFc26Data] = useState(null);
  const [fc26Loading, setFc26Loading] = useState(false);
  const [q, setQ] = useState("");
  const [qas, setQas] = useState([]);
  const [qaL, setQaL] = useState(false);
  const [pressed, setPressed] = useState(false);
  const qaEnd = useRef(null);
  const acc = player?.colorAccent || "#C8A84B";

  async function search() {
    if (!inp.trim() || loading) return;
    setLoading(true); setErr("");
    setFc26Data(null); setShowFC26(false); setQas([]); setPhotoUrl(null);
    try {
      setLoadingMsg("📸 Fotoğraf aranıyor...");
      const photo = await fetchWikiPhoto(inp.trim());
      setPhotoUrl(photo);
      setLoadingMsg("⚙️ Profil oluşturuluyor...");
      const raw = await ai(
        `Sen bir futbol uzmanısın. "${inp.trim()}" futbolcusu hakkında bilgi ver.
SADECE ham JSON döndür, markdown veya açıklama yok. Başı { sonu } olsun.
{"fullName":"","position":"","nationality":"","birthDate":"","currentClub":"","shirtNumber":"","height":"","weight":"","preferredFoot":"","marketValue":"","stats":{"appearances":"","goals":"","assists":"","trophies":""},"career":["","",""],"achievements":["","","",""],"detailedBio":"Türkçe 80 kelime biyografi","playstyle":"Türkçe 2 cümle oyun tarzı","famousFor":"Türkçe tek cümle","emoji":"","colorAccent":"#hex"}`
      );
      const parsed = parseJSON(raw);
      if (!parsed) throw new Error("Veri alınamadı, tekrar deneyin.");
      setPlayer(parsed);
      setPage("profile");
    } catch(e) { setErr(e.message); }
    setLoading(false); setLoadingMsg("");
  }

  async function sendQ() {
    if (!q.trim() || qaL) return;
    const qq = q.trim(); setQ("");
    setQas(p=>[...p,{q:qq,a:null,loading:true}]);
    setQaL(true);
    try {
      const ans = await ai(
        `Sen bir futbol uzmanısın. ${player.fullName} hakkında şu soruyu Türkçe, kısa cevapla (max 3 cümle).
Evet/hayır sorularında "✅ Evet" veya "❌ Hayır" ile başla.
Söylenti/rumor ise "📰 RUMOR:" ile başla ve doğrulanmamış olduğunu belirt.
Soru: ${qq}`
      );
      setQas(p=>p.map((it,i)=>i===p.length-1?{...it,a:ans,loading:false}:it));
    } catch(e) {
      setQas(p=>p.map((it,i)=>i===p.length-1?{...it,a:"Hata: "+e.message,loading:false}:it));
    }
    setQaL(false);
  }

  async function loadFC26() {
    if (fc26Data) { setShowFC26(v=>!v); return; }
    setFc26Loading(true); setShowFC26(true);
    try {
      const raw = await ai(
        `FC 26 / EA Sports FC için ${player.fullName} oyuncusunun gerçekçi kart istatistiklerini ver.
SADECE ham JSON döndür:
{"overall":"","pace":"","shooting":"","passing":"","dribbling":"","defending":"","physical":"","weakFoot":"1-5","skillMoves":"1-5","position":"","playerStyle":"","traits":["","",""],"alternatePositions":[""],"cardType":"Gold/Silver/Icon/Hero","nation":"","club":""}`
      );
      const parsed = parseJSON(raw);
      setFc26Data(parsed || { error: "Veri alınamadı" });
    } catch(e) { setFc26Data({ error: e.message }); }
    setFc26Loading(false);
  }

  const statColor = v => {
    const n = parseInt(v);
    return n>=85?"#4ade80":n>=70?"#facc15":n>=55?"#fb923c":"#f87171";
  };

  if (page === "search") return (
    <div style={{ minHeight:"100vh",background:"#080808",color:"#e8e0d0",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 20px",position:"relative",overflow:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;700&display=swap');
        @keyframes blink{0%,80%,100%{opacity:.12}40%{opacity:1}}
        @keyframes shimmer{0%{background-position:-300% center}100%{background-position:300% center}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box;margin:0;padding:0}
      `}</style>
      <div style={{ position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(200,168,75,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(200,168,75,.04) 1px,transparent 1px)",backgroundSize:"60px 60px",pointerEvents:"none" }}/>
      <div style={{ position:"absolute",inset:0,background:"radial-gradient(ellipse at 50% 40%,rgba(200,168,75,.07) 0%,transparent 65%)",pointerEvents:"none" }}/>

      <div style={{ position:"relative",zIndex:1,width:"100%",maxWidth:520,animation:"fadeUp .7s ease both" }}>
        <div style={{ textAlign:"center",marginBottom:50 }}>
          <div style={{ display:"inline-flex",alignItems:"center",gap:8,background:"rgba(200,168,75,.07)",border:"1px solid rgba(200,168,75,.18)",padding:"6px 18px",marginBottom:22 }}>
            <span>⚽</span>
            <span style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".57rem",letterSpacing:"5px",color:"#C8A84B",textTransform:"uppercase" }}>Futbolcu Ansiklopedisi</span>
          </div>
          <h1 style={{ fontFamily:"'Playfair Display',serif",fontSize:"clamp(2.2rem,8vw,4.2rem)",fontWeight:900,lineHeight:1.05,letterSpacing:"-1px",
            background:"linear-gradient(135deg,#f0ead8 0%,#C8A84B 40%,#e8c96b 60%,#f0ead8 100%)",backgroundSize:"300% auto",
            WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",animation:"shimmer 5s linear infinite" }}>
            Futbolcuyu<br/>Keşfet
          </h1>
          <div style={{ display:"flex",gap:16,justifyContent:"center",marginTop:14,flexWrap:"wrap" }}>
            {["📸 Fotoğraf","📖 Detaylı Profil","🎮 FC 26","𝕏 Dedikodular"].map(t=>(
              <span key={t} style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".58rem",color:"#2a2a2a" }}>{t}</span>
            ))}
          </div>
        </div>

        <div style={{ position:"relative" }}>
          <input
            style={{ background:"rgba(255,255,255,.03)",border:"1px solid #252525",borderBottom:"2px solid #C8A84B",color:"#e8e0d0",fontSize:"clamp(1.1rem,3.5vw,1.6rem)",fontFamily:"'Playfair Display',serif",width:"100%",outline:"none",padding:"16px 52px 16px 18px",letterSpacing:1 }}
            placeholder="Messi, Ronaldo, Mbappé..."
            value={inp} onChange={e=>setInp(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&search()}
          />
          <span style={{ position:"absolute",right:16,top:"50%",transform:"translateY(-50%)",color:"#333",fontSize:18,pointerEvents:"none" }}>→</span>
        </div>

        {err && <div style={{ marginTop:10,padding:"9px 14px",background:"rgba(255,60,60,.06)",border:"1px solid rgba(255,60,60,.14)",fontFamily:"'DM Sans',sans-serif",fontSize:".74rem",color:"#ff9999" }}>⚠ {err}</div>}

        <div style={{ display:"flex",justifyContent:"center",marginTop:20 }}>
          <button onMouseDown={()=>setPressed(true)} onMouseUp={()=>setPressed(false)} onMouseLeave={()=>setPressed(false)}
            onClick={search} disabled={loading}
            style={{ background:pressed?"#7a5010":"linear-gradient(135deg,#C8A84B,#e8c96b)",color:"#080808",border:"none",cursor:loading?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:".76rem",letterSpacing:"4px",textTransform:"uppercase",padding:"15px 50px",boxShadow:pressed?"none":"0 6px 0 #7a5010, 0 8px 20px rgba(200,168,75,.2)",transform:pressed?"translateY(6px)":"translateY(0)",transition:"all .1s",opacity:loading?.5:1 }}>
            {loading?<span style={{ display:"flex",alignItems:"center",gap:10 }}><Dots/>Yükleniyor</span>:"Profili Getir →"}
          </button>
        </div>

        {loadingMsg&&<div style={{ textAlign:"center",marginTop:14,fontFamily:"'DM Sans',sans-serif",fontSize:".7rem",color:"#383838" }}>{loadingMsg}</div>}

        <div style={{ marginTop:42,display:"flex",gap:"clamp(12px,2.5vw,22px)",flexWrap:"wrap",justifyContent:"center" }}>
          {["Pelé","Maradona","Zidane","Ronaldo","Messi","Mbappé"].map(n=>(
            <span key={n} onClick={()=>setInp(n)}
              style={{ cursor:"pointer",fontFamily:"'Playfair Display',serif",fontSize:".63rem",color:"#202020",letterSpacing:"2px",textTransform:"uppercase",fontStyle:"italic" }}
              onMouseEnter={e=>e.target.style.color="#C8A84B"} onMouseLeave={e=>e.target.style.color="#202020"}
            >{n}</span>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh",background:"#080808",color:"#e8e0d0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@400;500;700&display=swap');
        @keyframes blink{0%,80%,100%{opacity:.12}40%{opacity:1}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box;margin:0;padding:0}
        .icard{background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.055);padding:17px;text-align:center;transition:all .2s}
        .icard:hover{background:rgba(255,255,255,.045);transform:translateY(-2px)}
        .qbu{background:rgba(200,168,75,.09);border:1px solid rgba(200,168,75,.18);padding:10px 14px;border-radius:2px 12px 12px 12px;max-width:82%;font-family:'DM Sans',sans-serif;font-size:.83rem;color:#e8e0d0;line-height:1.6}
        .qba{background:rgba(255,255,255,.022);border:1px solid rgba(255,255,255,.055);padding:12px 16px;border-radius:12px 2px 12px 12px;max-width:90%;font-family:'DM Sans',sans-serif;font-size:.83rem;color:#7a7a7a;line-height:1.82}
        .tag{display:inline-flex;align-items:center;background:rgba(200,168,75,.07);border:1px solid rgba(200,168,75,.16);padding:3px 10px;font-family:'DM Sans',sans-serif;font-size:.57rem;letter-spacing:2px;color:#C8A84B;text-transform:uppercase}
        .fcbar{height:6px;border-radius:3px;background:#181818;overflow:hidden;margin-top:5px}
        .fcfill{height:100%;border-radius:3px;transition:width .8s ease}
      `}</style>

      <div style={{ maxWidth:880,margin:"0 auto",padding:"30px 20px 80px" }}>

        <button onClick={()=>{setPage("search");setErr("");setExpanded(false);setQas([]);setShowFC26(false);setFc26Data(null);setPhotoUrl(null);}}
          style={{ background:"transparent",border:"none",color:"#303030",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:".65rem",letterSpacing:"3px",textTransform:"uppercase",marginBottom:38,display:"flex",alignItems:"center",gap:8,padding:0,transition:"color .2s" }}
          onMouseEnter={e=>e.currentTarget.style.color="#C8A84B"} onMouseLeave={e=>e.currentTarget.style.color="#303030"}
        >← Geri Dön</button>

        <div style={{ animation:"fadeUp .5s ease both" }}>
          <div style={{ display:"flex",gap:6,alignItems:"center",marginBottom:20 }}>
            <div style={{ width:40,height:3,background:`linear-gradient(90deg,${acc},transparent)` }}/>
            <span className="tag">{player.position}</span>
          </div>
          <div style={{ display:"flex",gap:24,flexWrap:"wrap",alignItems:"flex-start" }}>
            <div style={{ flexShrink:0 }}>
              {photoUrl ? (
                <div style={{ position:"relative" }}>
                  <div style={{ width:130,height:160,overflow:"hidden",border:`2px solid ${acc}44`,boxShadow:`0 0 40px ${acc}22,0 20px 40px rgba(0,0,0,.6)` }}>
                    <img src={photoUrl} alt={player.fullName}
                      style={{ width:"100%",height:"100%",objectFit:"cover",objectPosition:"top center",filter:"brightness(1.05) contrast(1.05)" }}
                      onError={e=>{e.target.parentNode.style.display="none";}}
                    />
                  </div>
                  <div style={{ position:"absolute",bottom:-1,left:0,right:0,height:40,background:`linear-gradient(to top,${acc}22,transparent)` }}/>
                </div>
              ) : (
                <div style={{ width:130,height:160,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"4rem",background:`radial-gradient(circle,${acc}20,${acc}05)`,border:`2px solid ${acc}30` }}>
                  {player.emoji||"⚽"}
                </div>
              )}
            </div>

            <div style={{ flex:1,minWidth:180 }}>
              <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".52rem",letterSpacing:"5px",color:acc,textTransform:"uppercase",marginBottom:5 }}>{player.nationality}</div>
              <h1 style={{ fontFamily:"'Playfair Display',serif",fontSize:"clamp(1.7rem,5vw,3rem)",fontWeight:900,lineHeight:1.05,color:"#f5efe0",letterSpacing:"-0.5px" }}>{player.fullName}</h1>
              <p style={{ fontFamily:"'DM Sans',sans-serif",color:"#464646",fontSize:".8rem",marginTop:9,lineHeight:1.75,maxWidth:440 }}>{player.famousFor}</p>
              <div style={{ display:"flex",gap:20,marginTop:16,flexWrap:"wrap" }}>
                {[["⚽ Gol",player.stats?.goals],["🎯 Maç",player.stats?.appearances],["🏆 Kupa",player.stats?.trophies]].map(([l,v])=>(
                  <div key={l}>
                    <span style={{ fontFamily:"'Playfair Display',serif",fontSize:"1.3rem",color:acc,fontWeight:900 }}>{v||"—"}</span>
                    <span style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".6rem",color:"#303030",marginLeft:5 }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background:`linear-gradient(135deg,${acc}12,${acc}04)`,border:`1px solid ${acc}30`,padding:"14px 20px",textAlign:"center",flexShrink:0,position:"relative" }}>
              <div style={{ position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${acc},transparent)` }}/>
              <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".5rem",letterSpacing:"4px",color:"#3a3a3a",textTransform:"uppercase",marginBottom:5 }}>Piyasa Değeri</div>
              <div style={{ fontFamily:"'Playfair Display',serif",fontSize:"1.25rem",color:acc,fontWeight:700 }}>{player.marketValue}</div>
            </div>
          </div>
        </div>

        <div style={{ height:1,background:`linear-gradient(90deg,transparent,${acc}30,transparent)`,margin:"26px 0" }}/>

        <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(125px,1fr))",gap:1,background:"#0c0c0c",animation:"fadeUp .5s .06s ease both",opacity:0,animationFillMode:"forwards" }}>
          {[["Doğum",player.birthDate],["Kulüp",player.currentClub],["Forma",player.shirtNumber],["Boy",player.height],["Kilo",player.weight],["Ayak",player.preferredFoot]].map(([l,v])=>(
            <div className="icard" key={l}>
              <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".5rem",letterSpacing:"3px",color:"#282828",textTransform:"uppercase",marginBottom:5 }}>{l}</div>
              <div style={{ fontFamily:"'Playfair Display',serif",fontSize:".88rem",color:"#d5c9b0",fontWeight:700 }}>{v||"—"}</div>
            </div>
          ))}
        </div>

        <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",borderTop:`2px solid ${acc}`,marginTop:1,animation:"fadeUp .5s .11s ease both",opacity:0,animationFillMode:"forwards" }}>
          {[["Maç",player.stats?.appearances],["Gol",player.stats?.goals],["Asist",player.stats?.assists],["Kupa",player.stats?.trophies]].map(([l,v])=>(
            <div key={l} style={{ padding:"18px 8px",textAlign:"center",borderRight:"1px solid #0c0c0c",background:"rgba(255,255,255,.01)" }}>
              <div style={{ fontFamily:"'Playfair Display',serif",fontSize:"1.9rem",color:acc,fontWeight:900,lineHeight:1 }}>{v||"—"}</div>
              <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".5rem",letterSpacing:"3px",color:"#282828",textTransform:"uppercase",marginTop:5 }}>{l}</div>
            </div>
          ))}
        </div>

        {player.career?.length>0&&(
          <div style={{ marginTop:36,animation:"fadeUp .5s .16s ease both",opacity:0,animationFillMode:"forwards" }}>
            <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".5rem",letterSpacing:"5px",color:acc,textTransform:"uppercase",marginBottom:15 }}>Kariyer</div>
            {player.career.map((c,i)=>(
              <div key={i} style={{ display:"flex",gap:13,paddingBottom:14 }}>
                <div style={{ display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0,paddingTop:4 }}>
                  <div style={{ width:8,height:8,borderRadius:"50%",background:i===0?acc:"transparent",border:`2px solid ${i===0?acc:"#262626"}`,boxShadow:i===0?`0 0 7px ${acc}77`:"" }}/>
                  {i<player.career.length-1&&<div style={{ width:1,flex:1,background:"#171717",marginTop:4 }}/>}
                </div>
                <p style={{ fontFamily:"'DM Sans',sans-serif",color:"#4c4c4c",fontSize:".82rem",lineHeight:1.65 }}>{c}</p>
              </div>
            ))}
          </div>
        )}

        <div style={{ display:"flex",gap:9,flexWrap:"wrap",justifyContent:"center",marginTop:32 }}>
          <button onClick={()=>setExpanded(v=>!v)}
            style={{ background:"transparent",border:`1px solid ${expanded?"#C8A84B":"#1a1a1a"}`,color:"#C8A84B",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:".64rem",letterSpacing:"2px",textTransform:"uppercase",padding:"11px 24px",transition:"all .2s" }}>
            {expanded?"▲ Daha az":"▼ Daha fazla"}
          </button>
          <button onClick={loadFC26}
            style={{ background:showFC26?`linear-gradient(135deg,${acc},#e8c96b)`:"transparent",border:`1px solid ${showFC26?"transparent":"#1a1a1a"}`,color:showFC26?"#080808":"#C8A84B",cursor:"pointer",fontFamily:"'DM Sans',sans-serif",fontSize:".64rem",letterSpacing:"2px",textTransform:"uppercase",padding:"11px 24px",transition:"all .22s",fontWeight:showFC26?700:400 }}>
            🎮 FC 26 Kartı
          </button>
        </div>

        {showFC26&&(
          <div style={{ marginTop:20,background:"rgba(255,255,255,.018)",border:`1px solid ${acc}30`,padding:"24px 20px",animation:"fadeUp .4s ease both",position:"relative" }}>
            <div style={{ position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${acc},transparent)` }}/>
            <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".5rem",letterSpacing:"5px",color:acc,textTransform:"uppercase",marginBottom:16 }}>🎮 FC 26 Oyuncu Kartı</div>
            {fc26Loading&&<div style={{ textAlign:"center",padding:24 }}><Dots/></div>}
            {fc26Data?.error&&<div style={{ color:"#f77",fontFamily:"'DM Sans',sans-serif",fontSize:".78rem" }}>⚠ {fc26Data.error}</div>}
            {fc26Data&&!fc26Data.error&&!fc26Loading&&(
              <div>
                <div style={{ display:"flex",alignItems:"center",gap:18,marginBottom:22,flexWrap:"wrap" }}>
                  <div style={{ textAlign:"center",background:`linear-gradient(135deg,${acc}18,${acc}06)`,border:`1px solid ${acc}33`,padding:"16px 22px",position:"relative" }}>
                    <div style={{ position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,transparent,${acc},transparent)` }}/>
                    <div style={{ fontFamily:"'Playfair Display',serif",fontSize:"3.6rem",fontWeight:900,color:acc,lineHeight:1 }}>{fc26Data.overall}</div>
                    <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".5rem",letterSpacing:"3px",color:"#343434",textTransform:"uppercase",marginTop:3 }}>Overall</div>
                  </div>
                  <div>
                    <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:7 }}>
                      {[fc26Data.cardType,fc26Data.position,fc26Data.playerStyle].filter(Boolean).map((t,i)=><span key={i} className="tag">{t}</span>)}
                    </div>
                    <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".74rem",color:"#444" }}>{fc26Data.nation} · {fc26Data.club}</div>
                    <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".7rem",color:"#343434",marginTop:3 }}>
                      Zayıf ayak: {"⭐".repeat(parseInt(fc26Data.weakFoot)||3)} · Beceri: {"⭐".repeat(parseInt(fc26Data.skillMoves)||3)}
                    </div>
                  </div>
                </div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px 20px" }}>
                  {[["PAC",fc26Data.pace],["SHO",fc26Data.shooting],["PAS",fc26Data.passing],["DRI",fc26Data.dribbling],["DEF",fc26Data.defending],["PHY",fc26Data.physical]].map(([label,val])=>(
                    <div key={label}>
                      <div style={{ display:"flex",justifyContent:"space-between" }}>
                        <span style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".57rem",letterSpacing:"3px",color:"#353535",textTransform:"uppercase" }}>{label}</span>
                        <span style={{ fontFamily:"'Playfair Display',serif",fontSize:".9rem",color:statColor(val),fontWeight:700 }}>{val}</span>
                      </div>
                      <div className="fcbar"><div className="fcfill" style={{ width:`${Math.min(parseInt(val)||0,99)}%`,background:statColor(val) }}/></div>
                    </div>
                  ))}
                </div>
                {fc26Data.traits?.length>0&&(
                  <div style={{ marginTop:16 }}>
                    <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".5rem",letterSpacing:"4px",color:"#2c2c2c",textTransform:"uppercase",marginBottom:8 }}>Özellikler</div>
                    <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
                      {fc26Data.traits.map((t,i)=><span key={i} style={{ background:"rgba(255,255,255,.025)",border:"1px solid #1a1a1a",padding:"3px 10px",fontFamily:"'DM Sans',sans-serif",fontSize:".68rem",color:"#525252" }}>{t}</span>)}
                    </div>
                  </div>
                )}
                <div style={{ marginTop:12,padding:"6px 10px",background:"rgba(255,255,255,.015)",border:"1px solid #141414",fontFamily:"'DM Sans',sans-serif",fontSize:".62rem",color:"#2a2a2a" }}>
                  ⚠ FC 26 henüz çıkmadığından veriler tahminidir.
                </div>
              </div>
            )}
          </div>
        )}

        {expanded&&(
          <div style={{ marginTop:24,animation:"fadeUp .4s ease both" }}>
            <div style={{ height:1,background:`linear-gradient(90deg,transparent,${acc}30,transparent)`,margin:"0 0 24px" }}/>
            <div style={{ marginBottom:30 }}>
              <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".5rem",letterSpacing:"5px",color:acc,textTransform:"uppercase",marginBottom:11 }}>Biyografi</div>
              <p style={{ fontFamily:"'DM Sans',sans-serif",color:"#4c4c4c",lineHeight:1.9,fontSize:".84rem" }}>{player.detailedBio}</p>
            </div>
            <div style={{ marginBottom:30,borderLeft:`3px solid ${acc}40`,paddingLeft:16 }}>
              <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".5rem",letterSpacing:"5px",color:acc,textTransform:"uppercase",marginBottom:8 }}>Oyun Tarzı</div>
              <p style={{ fontFamily:"'Playfair Display',serif",color:"#666",lineHeight:1.85,fontStyle:"italic",fontSize:".88rem" }}>{player.playstyle}</p>
            </div>
            {player.achievements?.length>0&&(
              <div>
                <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".5rem",letterSpacing:"5px",color:acc,textTransform:"uppercase",marginBottom:11 }}>Başarılar</div>
                <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(188px,1fr))",gap:7 }}>
                  {player.achievements.map((a,i)=>(
                    <div key={i} style={{ background:"rgba(255,255,255,.018)",border:"1px solid #141414",padding:"10px 12px",display:"flex",gap:8 }}>
                      <span style={{ color:acc,fontSize:".66rem",marginTop:2,flexShrink:0 }}>✦</span>
                      <span style={{ fontFamily:"'DM Sans',sans-serif",color:"#4c4c4c",fontSize:".76rem",lineHeight:1.55 }}>{a}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop:50 }}>
          <div style={{ height:1,background:`linear-gradient(90deg,transparent,${acc}30,transparent)`,marginBottom:26 }}/>
          <div style={{ marginBottom:20 }}>
            <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".5rem",letterSpacing:"5px",color:acc,textTransform:"uppercase",marginBottom:6 }}>Soru Sor</div>
            <h2 style={{ fontFamily:"'Playfair Display',serif",fontSize:"1.4rem",color:"#e8e0d0",fontWeight:700,lineHeight:1.2 }}>
              {player.fullName} hakkında<br/>sorunuz var mı?
            </h2>
            <div style={{ display:"flex",gap:12,marginTop:10,flexWrap:"wrap" }}>
              <span style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".61rem",color:"#272727" }}>📖 Genel bilgiler</span>
              <span style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".61rem",color:"#272727" }}>📰 Söylenti varsa RUMOR etiketi</span>
            </div>
          </div>

          {qas.length>0&&(
            <div style={{ display:"flex",flexDirection:"column",gap:14,marginBottom:16 }}>
              {qas.map((it,i)=>(
                <div key={i}>
                  <div style={{ display:"flex",justifyContent:"flex-end",marginBottom:5 }}>
                    <div className="qbu">{it.q}</div>
                  </div>
                  <div style={{ display:"flex" }}>
                    <div className="qba">{it.loading?<Dots color="#3a3a3a"/>:it.a}</div>
                  </div>
                </div>
              ))}
              <div ref={qaEnd}/>
            </div>
          )}

          <div style={{ display:"flex",background:"rgba(255,255,255,.02)",border:`1px solid #1a1a1a`,borderBottom:`2px solid ${acc}40` }}>
            <textarea rows={2}
              style={{ flex:1,background:"transparent",border:"none",color:"#e8e0d0",fontFamily:"'DM Sans',sans-serif",fontSize:".83rem",padding:"13px 14px",outline:"none",resize:"none" }}
              placeholder={`${player.fullName} hakkında bir şey sorun...`}
              value={q} onChange={e=>setQ(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&!qaL&&(e.preventDefault(),sendQ())}
            />
            <button onClick={sendQ} disabled={qaL||!q.trim()}
              style={{ background:(qaL||!q.trim())?"transparent":`linear-gradient(135deg,${acc},#e8c96b)`,color:(qaL||!q.trim())?"#222":"#080808",border:"none",cursor:(qaL||!q.trim())?"not-allowed":"pointer",fontFamily:"'DM Sans',sans-serif",fontWeight:700,fontSize:".64rem",letterSpacing:"2px",textTransform:"uppercase",padding:"0 18px",transition:"all .18s",minWidth:74 }}>
              {qaL?<Dots/>:"Sor →"}
            </button>
          </div>
          <div style={{ fontFamily:"'DM Sans',sans-serif",fontSize:".58rem",color:"#1c1c1c",marginTop:5 }}>
            Enter ile gönder · Örnek: "Beckham ile bağlantısı var mı?"
          </div>
        </div>

      </div>
    </div>
  );
}
