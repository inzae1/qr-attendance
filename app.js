const SUPABASE_URL = "https://wkjyavanphojvbutebgo.supabase.co";
const SUPABASE_KEY = "sb_publishable_A1SUvzt-1hVpKN9hrnI6wQ_3oruWDnK";
const EDGE_URL = `${SUPABASE_URL}/functions/v1/passkey-attendance`;
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const app = document.getElementById("app");
const params = new URLSearchParams(location.search);

const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
}[c]));

function kstDate(){
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function firstDayOfMonth(){ return `${kstDate().slice(0,7)}-01`; }
function fmtTime(ts){
  if(!ts) return "-";
  return new Intl.DateTimeFormat("ko-KR",{
    timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false
  }).format(new Date(ts));
}
function fmt(ts){
  if(!ts) return "-";
  return new Intl.DateTimeFormat("ko-KR",{
    timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false
  }).format(new Date(ts));
}
function hhmm(ts){
  if(!ts) return "";
  return new Intl.DateTimeFormat("en-GB",{
    timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false
  }).format(new Date(ts));
}
function statusIn(ts){
  if(!ts) return '<span class="status absent">미출근</span>';
  return hhmm(ts) > "10:00" ? '<span class="status late">지각</span>' : '<span class="status normal">정상</span>';
}
function statusOut(ts){
  if(!ts) return '<span class="status absent">미퇴근</span>';
  return hhmm(ts) < "17:00" ? '<span class="status early">조퇴</span>' : '<span class="status normal">정상</span>';
}

async function edge(action, payload={}){
  const r = await fetch(EDGE_URL, {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "apikey":SUPABASE_KEY,
      "Authorization":`Bearer ${SUPABASE_KEY}`
    },
    body:JSON.stringify({action,...payload})
  });
  const data = await r.json().catch(()=>({error:`HTTP ${r.status}`}));
  if(!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

function copyText(text, btn){
  navigator.clipboard.writeText(text).then(()=>{
    const old = btn.textContent;
    btn.textContent = "복사됨";
    setTimeout(()=>btn.textContent=old,1000);
  });
}

async function renderEnrollment(token){
  app.innerHTML = `
    <div class="badge">Passkey 등록</div>
    <h1>출결 기기 등록</h1>
    <p class="sub">이 휴대폰을 본인 출결 기기로 등록합니다.</p>
    <div id="enrollBody"><div class="result">등록 정보를 확인하는 중...</div></div>`;

  const body = document.getElementById("enrollBody");
  try{
    if(!window.SimpleWebAuthnBrowser?.browserSupportsWebAuthn()){
      throw new Error("이 브라우저는 Passkey/WebAuthn을 지원하지 않습니다.");
    }
    const data = await edge("registration-options",{token});
    body.innerHTML = `
      <div class="hero-name">${esc(data.memberName)}</div>
      <p>아래 버튼을 누르면 휴대폰의 Face ID / 지문 / 화면 잠금으로 Passkey를 저장합니다.</p>
      <button id="registerPasskey" class="btn btn-admin">이 휴대폰 등록</button>
      <div id="enrollResult"></div>`;
    document.getElementById("registerPasskey").onclick = async ()=>{
      const btn = document.getElementById("registerPasskey");
      btn.disabled = true;
      try{
        const response = await SimpleWebAuthnBrowser.startRegistration({optionsJSON:data.options});
        await edge("registration-verify",{token,response});
        body.innerHTML = `
          <div class="success-big">등록 완료</div>
          <p>${esc(data.memberName)}님의 Passkey가 이 기기에 등록됐습니다.</p>
          <p class="hint">이제 현장 태블릿의 동적 QR을 찍으면 바로 출결할 수 있습니다.</p>`;
      }catch(e){
        btn.disabled = false;
        document.getElementById("enrollResult").innerHTML = `<div class="result error">${esc(e.message)}</div>`;
      }
    };
  }catch(e){
    body.innerHTML = `<div class="result error">${esc(e.message)}</div>`;
  }
}

async function renderAttendance(token){
  app.innerHTML = `
    <div class="badge">현장 출결</div>
    <h1>본인 확인</h1>
    <p class="sub">등록된 Passkey로 출결을 승인합니다.</p>
    <div id="attendBody"><div class="result">QR을 확인하는 중...</div></div>`;

  const body = document.getElementById("attendBody");
  try{
    if(!window.SimpleWebAuthnBrowser?.browserSupportsWebAuthn()){
      throw new Error("이 브라우저는 Passkey/WebAuthn을 지원하지 않습니다.");
    }
    const data = await edge("authentication-options",{attendanceToken:token});
    const label = data.mode === "out" ? "퇴근" : "출근";
    body.innerHTML = `
      <div class="mode-badge ${data.mode}">${label}</div>
      <button id="authPasskey" class="btn ${data.mode==="out"?"btn-out":"btn-in"}">${label} 인증</button>
      <p class="hint">Face ID·지문 등은 휴대폰에서만 처리되며 출결 시스템으로 전송되지 않습니다.</p>
      <div id="attendResult"></div>`;
    document.getElementById("authPasskey").onclick = async ()=>{
      const btn = document.getElementById("authPasskey");
      btn.disabled = true;
      try{
        const response = await SimpleWebAuthnBrowser.startAuthentication({optionsJSON:data.options});
        const verified = await edge("authentication-verify",{attendanceToken:token,response});
        const a = verified.attendance;
        const duplicate = a?.already_recorded;
        body.innerHTML = `
          <div class="success-big">${esc(a?.member_name || "")} ${label} ${duplicate ? "확인" : "완료"}</div>
          <div class="success-time">${fmtTime(a?.scanned_at)}</div>
          ${duplicate ? '<p class="hint">오늘 최초 기록 시간이 유지됩니다.</p>' : ''}`;
      }catch(e){
        btn.disabled = false;
        document.getElementById("attendResult").innerHTML = `<div class="result error">${esc(e.message)}</div>`;
      }
    };
  }catch(e){
    body.innerHTML = `<div class="result error">${e.message.includes("expired") ? "QR 유효시간이 지났습니다. 태블릿의 새 QR을 다시 찍어주세요." : esc(e.message)}</div>`;
  }
}

async function renderKiosk(){
  app.innerHTML = `
    <div class="badge">태블릿 키오스크</div>
    <h1>현장 출결 QR</h1>
    <div id="kioskLogin">
      <p class="sub">처음 한 번만 관리자 PIN으로 키오스크를 시작합니다.</p>
      <div class="field"><label>관리자 PIN</label><input id="kioskPin" type="password" inputmode="numeric"></div>
      <button id="kioskStart" class="btn btn-admin">키오스크 시작</button>
      <div id="kioskError"></div>
    </div>
    <div id="kioskPanel" class="hidden">
      <div class="mode-switch">
        <button id="modeIn" class="mode-btn active in">출근</button>
        <button id="modeOut" class="mode-btn out">퇴근</button>
      </div>
      <div id="kioskModeTitle" class="kiosk-title">출근 QR</div>
      <div id="dynamicQr" class="dynamic-qr"></div>
      <div class="countdown"><b id="countdown">-</b>초 후 QR 갱신</div>
      <p class="hint center">학생은 자기 휴대폰 카메라로 이 QR을 찍고 Passkey로 승인합니다.</p>
      <div class="kiosk-links"><a href="?admin=1">관리자 페이지</a></div>
    </div>`;

  let kioskToken = "";
  let mode = "in";
  let expiresAt = 0;
  let refreshTimer = null;
  let countdownTimer = null;

  async function refreshQr(){
    if(!kioskToken) return;
    try{
      const data = await edge("kiosk-challenge",{kioskToken,mode});
      expiresAt = new Date(data.expiresAt).getTime();
      const qr = document.getElementById("dynamicQr");
      qr.innerHTML = "";
      new QRCode(qr,{text:data.url,width:300,height:300,correctLevel:QRCode.CorrectLevel.M});
    }catch(e){
      document.getElementById("dynamicQr").innerHTML = `<div class="result error">${esc(e.message)}</div>`;
    }
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshQr, 13000);
  }
  function startCountdown(){
    clearInterval(countdownTimer);
    countdownTimer = setInterval(()=>{
      const left = Math.max(0, Math.ceil((expiresAt-Date.now())/1000));
      const el = document.getElementById("countdown");
      if(el) el.textContent = left;
    },250);
  }
  async function switchMode(next){
    mode = next;
    document.getElementById("modeIn").classList.toggle("active",mode==="in");
    document.getElementById("modeOut").classList.toggle("active",mode==="out");
    document.getElementById("kioskModeTitle").textContent = mode==="in" ? "출근 QR" : "퇴근 QR";
    clearTimeout(refreshTimer);
    await refreshQr();
  }

  document.getElementById("kioskStart").onclick = async ()=>{
    const pin = document.getElementById("kioskPin").value.trim();
    try{
      const data = await edge("kiosk-login",{adminPin:pin});
      kioskToken = data.token;
      sessionStorage.setItem("attendanceKioskToken",kioskToken);
      document.getElementById("kioskLogin").classList.add("hidden");
      document.getElementById("kioskPanel").classList.remove("hidden");
      startCountdown();
      await refreshQr();
    }catch(e){
      document.getElementById("kioskError").innerHTML = `<div class="result error">관리자 PIN을 확인하세요.</div>`;
    }
  };
  document.getElementById("modeIn").onclick = ()=>switchMode("in");
  document.getElementById("modeOut").onclick = ()=>switchMode("out");

  const saved = sessionStorage.getItem("attendanceKioskToken");
  if(saved){
    kioskToken = saved;
    try{
      await edge("kiosk-challenge",{kioskToken,mode});
      document.getElementById("kioskLogin").classList.add("hidden");
      document.getElementById("kioskPanel").classList.remove("hidden");
      startCountdown();
      await refreshQr();
    }catch{
      sessionStorage.removeItem("attendanceKioskToken");
      kioskToken = "";
    }
  }
}

function attendanceStatus(r){
  return {
    inStatus: r.check_in ? (hhmm(r.check_in) > "10:00" ? "지각" : "정상") : "미출근",
    outStatus: r.check_out ? (hhmm(r.check_out) < "17:00" ? "조퇴" : "정상") : "미퇴근"
  };
}

function buildStats(rows){
  const total = rows.length;
  const present = rows.filter(r=>r.check_in).length;
  const normalIn = rows.filter(r=>r.check_in && hhmm(r.check_in) <= "10:00").length;
  const late = rows.filter(r=>r.check_in && hhmm(r.check_in) > "10:00").length;
  const absent = rows.filter(r=>!r.check_in).length;
  const checkedOut = rows.filter(r=>r.check_out).length;
  const early = rows.filter(r=>r.check_out && hhmm(r.check_out) < "17:00").length;
  const normalOut = rows.filter(r=>r.check_out && hhmm(r.check_out) >= "17:00").length;
  const missingOut = rows.filter(r=>r.check_in && !r.check_out).length;
  const attendanceRate = total ? present / total : 0;

  const byMemberMap = new Map();
  const byDateMap = new Map();

  for(const r of rows){
    const st = attendanceStatus(r);
    if(!byMemberMap.has(r.member_name)){
      byMemberMap.set(r.member_name,{
        name:r.member_name,total:0,present:0,normalIn:0,late:0,absent:0,
        checkedOut:0,normalOut:0,early:0,missingOut:0,checkInMinutes:[]
      });
    }
    const m=byMemberMap.get(r.member_name);
    m.total++;
    if(r.check_in){
      m.present++;
      const [h,mi]=hhmm(r.check_in).split(":").map(Number);
      m.checkInMinutes.push(h*60+mi);
      st.inStatus==="지각" ? m.late++ : m.normalIn++;
    } else m.absent++;
    if(r.check_out){
      m.checkedOut++;
      st.outStatus==="조퇴" ? m.early++ : m.normalOut++;
    } else if(r.check_in) m.missingOut++;

    if(!byDateMap.has(r.work_date)){
      byDateMap.set(r.work_date,{date:r.work_date,total:0,present:0,normalIn:0,late:0,absent:0,early:0,missingOut:0});
    }
    const d=byDateMap.get(r.work_date);
    d.total++;
    if(r.check_in){d.present++;st.inStatus==="지각"?d.late++:d.normalIn++;} else d.absent++;
    if(r.check_out && st.outStatus==="조퇴")d.early++;
    if(r.check_in && !r.check_out)d.missingOut++;
  }

  const byMember=[...byMemberMap.values()].map(m=>{
    const avg=m.checkInMinutes.length ? Math.round(m.checkInMinutes.reduce((a,b)=>a+b,0)/m.checkInMinutes.length) : null;
    return {
      ...m,
      attendanceRate:m.total ? m.present/m.total : 0,
      avgCheckIn:avg===null ? "-" : `${String(Math.floor(avg/60)).padStart(2,"0")}:${String(avg%60).padStart(2,"0")}`
    };
  }).sort((a,b)=>a.name.localeCompare(b.name,"ko"));

  const byDate=[...byDateMap.values()].sort((a,b)=>a.date.localeCompare(b.date));
  return {total,present,normalIn,late,absent,checkedOut,normalOut,early,missingOut,attendanceRate,byMember,byDate};
}

function downloadCsv(rows){
  const lines = [["날짜","이름","출근","출근상태","퇴근","퇴근상태"]];
  for(const r of rows){
    const st=attendanceStatus(r);
    lines.push([r.work_date,r.member_name,r.check_in?fmt(r.check_in):"",st.inStatus,r.check_out?fmt(r.check_out):"",st.outStatus]);
  }
  const csv="\uFEFF"+lines.map(row=>row.map(v=>`"${String(v??"").replaceAll('"','""')}"`).join(",")).join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob), a=document.createElement("a");
  a.href=url;a.download=`출결내역_${document.getElementById("fromDate").value}_${document.getElementById("toDate").value}.csv`;a.click();
  URL.revokeObjectURL(url);
}

function downloadXlsx(rows){
  if(!window.XLSX) return alert("엑셀 모듈을 불러오지 못했습니다.");
  const stats=buildStats(rows);
  const wb=XLSX.utils.book_new();

  const detail=rows.map(r=>{
    const st=attendanceStatus(r);
    return {
      "날짜":r.work_date,"이름":r.member_name,
      "출근":r.check_in?fmt(r.check_in):"","출근상태":st.inStatus,
      "퇴근":r.check_out?fmt(r.check_out):"","퇴근상태":st.outStatus
    };
  });
  const summary=[
    ["항목","값"],
    ["조회기간",`${document.getElementById("fromDate").value} ~ ${document.getElementById("toDate").value}`],
    ["총 예정",stats.total],["출근",stats.present],["정상출근",stats.normalIn],
    ["지각",stats.late],["미출근",stats.absent],["출석률",stats.attendanceRate],
    ["정상퇴근",stats.normalOut],["조퇴",stats.early],["미퇴근",stats.missingOut]
  ];
  const members=stats.byMember.map(m=>({
    "이름":m.name,"예정일":m.total,"출근":m.present,"정상출근":m.normalIn,"지각":m.late,
    "미출근":m.absent,"출석률":m.attendanceRate,"평균출근":m.avgCheckIn,
    "정상퇴근":m.normalOut,"조퇴":m.early,"미퇴근":m.missingOut
  }));
  const daily=stats.byDate.map(d=>({
    "날짜":d.date,"예정":d.total,"출근":d.present,"정상출근":d.normalIn,
    "지각":d.late,"미출근":d.absent,"조퇴":d.early,"미퇴근":d.missingOut,
    "출석률":d.total?d.present/d.total:0
  }));

  const ws1=XLSX.utils.json_to_sheet(detail);
  const ws2=XLSX.utils.aoa_to_sheet(summary);
  const ws3=XLSX.utils.json_to_sheet(members);
  const ws4=XLSX.utils.json_to_sheet(daily);

  ws1["!cols"]=[{wch:12},{wch:14},{wch:23},{wch:12},{wch:23},{wch:12}];
  ws2["!cols"]=[{wch:18},{wch:28}];
  ws3["!cols"]=[{wch:14},{wch:10},{wch:10},{wch:12},{wch:10},{wch:10},{wch:12},{wch:12},{wch:12},{wch:10},{wch:10}];
  ws4["!cols"]=[{wch:12},{wch:10},{wch:10},{wch:12},{wch:10},{wch:10},{wch:10},{wch:10},{wch:12}];

  if(ws2["B8"]) ws2["B8"].z="0.0%";
  for(let r=2;r<=members.length+1;r++){
    const c=ws3[`G${r}`]; if(c)c.z="0.0%";
  }
  for(let r=2;r<=daily.length+1;r++){
    const c=ws4[`I${r}`]; if(c)c.z="0.0%";
  }

  XLSX.utils.book_append_sheet(wb,ws1,"출결내역");
  XLSX.utils.book_append_sheet(wb,ws2,"요약통계");
  XLSX.utils.book_append_sheet(wb,ws3,"학생별통계");
  XLSX.utils.book_append_sheet(wb,ws4,"일자별통계");
  XLSX.writeFile(wb,`출결통계_${document.getElementById("fromDate").value}_${document.getElementById("toDate").value}.xlsx`);
}

async function renderAdmin(){
  const today = kstDate();
  app.innerHTML = `
    <div class="badge">관리자</div>
    <h1>출결 관리자</h1>
    <p class="sub">학생 · Passkey · 키오스크 · 전체 출결</p>

    <div class="login-row">
      <div class="field grow"><label>관리자 PIN</label><input id="adminPin" type="password" inputmode="numeric"></div>
      <button id="unlock" class="btn btn-admin compact">관리 시작</button>
    </div>
    <div id="adminError"></div>

    <div id="adminPanel" class="hidden">
      <div class="tabs">
        <button class="tab active" data-tab="today">오늘 출결</button>
        <button class="tab" data-tab="members">학생 관리</button>
        <button class="tab" data-tab="passkeys">Passkey</button>
        <button class="tab" data-tab="stats">통계</button>
        <button class="tab" data-tab="history">전체 내역</button>
      </div>

      <section id="tab-today" class="tab-panel">
        <div class="section-head"><h2>오늘 출결</h2><input id="todayDate" type="date" value="${today}"></div>
        <div class="kiosk-launch"><a class="btn-link kiosk" href="?kiosk=1" target="_blank">태블릿 키오스크 열기</a></div>
        <div id="todayResult"></div>
      </section>

      <section id="tab-members" class="tab-panel hidden">
        <div class="section-head"><h2>학생 관리</h2></div>
        <div class="member-add">
          <input id="newName" placeholder="학생 이름">
          <input id="newPin" placeholder="관리용 임시 PIN (4자리 이상)" inputmode="numeric">
          <button id="addMember" class="btn btn-admin compact">학생 추가</button>
        </div>
        <p class="hint">출결에는 학생 PIN을 사용하지 않습니다. 기존 관리 호환용으로만 남겨둡니다.</p>
        <div id="memberResult"></div>
      </section>

      <section id="tab-passkeys" class="tab-panel hidden">
        <div class="section-head"><h2>학생 Passkey 등록</h2></div>
        <p class="hint">등록 링크는 10분간 유효합니다. 해당 학생의 휴대폰에서 링크를 열고 기기 인증을 완료하세요.</p>
        <div id="passkeyResult"></div>
      </section>


      <section id="tab-stats" class="tab-panel hidden">
        <div class="section-head"><h2>출결 통계</h2></div>
        <div class="range-row">
          <div class="field"><label>시작일</label><input id="statsFromDate" type="date" value="${firstDayOfMonth()}"></div>
          <div class="field"><label>종료일</label><input id="statsToDate" type="date" value="${today}"></div>
          <button id="loadStats" class="btn btn-admin compact">통계 조회</button>
        </div>
        <div id="statsResult"></div>
      </section>

      <section id="tab-history" class="tab-panel hidden">
        <div class="section-head"><h2>전체 출결 내역</h2></div>
        <div class="range-row">
          <div class="field"><label>시작일</label><input id="fromDate" type="date" value="${firstDayOfMonth()}"></div>
          <div class="field"><label>종료일</label><input id="toDate" type="date" value="${today}"></div>
          <button id="loadHistory" class="btn btn-admin compact">조회</button>
          <button id="downloadCsv" class="btn btn-secondary compact" disabled>CSV 다운로드</button>
          <button id="downloadXlsx" class="btn btn-excel compact" disabled>Excel (.xlsx)</button>
        </div>
        <div id="historyResult"></div>
      </section>
    </div>
    <div class="nav"><a href="?kiosk=1">키오스크</a></div>`;

  let adminPin="", historyRows=[];

  async function loadToday(){
    const {data,error}=await db.rpc("admin_attendance",{p_date:document.getElementById("todayDate").value,p_admin_pin:adminPin});
    const el=document.getElementById("todayResult");
    if(error){el.innerHTML=`<div class="result error">${esc(error.message)}</div>`;return;}
    el.innerHTML=`<div class="table-wrap"><table><thead><tr><th>이름</th><th>출근</th><th>상태</th><th>퇴근</th><th>상태</th></tr></thead><tbody>${
      data.map(r=>`<tr><td>${esc(r.member_name)}</td><td>${fmtTime(r.check_in)}</td><td>${statusIn(r.check_in)}</td><td>${fmtTime(r.check_out)}</td><td>${statusOut(r.check_out)}</td></tr>`).join("")
    }</tbody></table></div>`;
  }

  async function loadMembers(){
    const {data,error}=await db.rpc("admin_list_members",{p_admin_pin:adminPin});
    const el=document.getElementById("memberResult");
    if(error){el.innerHTML=`<div class="result error">${esc(error.message)}</div>`;return;}
    el.innerHTML=`<div class="member-list">${data.map(m=>`
      <div class="member-row" data-id="${m.member_id}">
        <input class="member-name" value="${esc(m.member_name)}">
        <input class="member-pin" placeholder="관리용 PIN 변경시에만">
        <label class="switch-label"><input class="member-active" type="checkbox" ${m.active?"checked":""}> 사용</label>
        <button class="save-member btn btn-secondary compact">저장</button>
      </div>`).join("")}</div>`;
    document.querySelectorAll(".save-member").forEach(btn=>btn.onclick=async()=>{
      const row=btn.closest(".member-row");
      const {error}=await db.rpc("admin_upsert_member",{
        p_admin_pin:adminPin,p_member_id:row.dataset.id,
        p_name:row.querySelector(".member-name").value.trim(),
        p_pin:row.querySelector(".member-pin").value.trim()||null,
        p_active:row.querySelector(".member-active").checked
      });
      if(error)return alert(error.message);
      row.querySelector(".member-pin").value="";
      btn.textContent="저장됨";setTimeout(()=>btn.textContent="저장",900);
    });
  }

  async function loadPasskeys(){
    const el=document.getElementById("passkeyResult");
    try{
      const data=await edge("member-passkey-status",{adminPin});
      el.innerHTML=`<div class="passkey-list">${data.members.map(m=>{
        const keys=m.member_passkeys||[];
        return `<div class="passkey-row" data-id="${m.id}">
          <div><b>${esc(m.name)}</b><div class="hint">${keys.length ? `등록 기기 ${keys.length}개` : "미등록"}</div></div>
          <div class="passkey-actions">
            <button class="enroll-key btn btn-admin compact">등록 링크</button>
            ${keys.length?'<button class="revoke-key btn btn-danger compact">등록 해제</button>':""}
          </div>
          <div class="enroll-link"></div>
        </div>`;
      }).join("")}</div>`;

      document.querySelectorAll(".enroll-key").forEach(btn=>btn.onclick=async()=>{
        const row=btn.closest(".passkey-row");
        try{
          const d=await edge("create-enrollment",{adminPin,memberId:row.dataset.id});
          row.querySelector(".enroll-link").innerHTML=`
            <div class="link-box">
              <input value="${esc(d.url)}" readonly>
              <button class="copy-link btn btn-secondary compact">복사</button>
              <a class="btn-link kiosk" href="${esc(d.url)}" target="_blank">열기</a>
            </div>
            <div class="hint">10분 후 만료</div>`;
          row.querySelector(".copy-link").onclick=(e)=>copyText(d.url,e.currentTarget);
        }catch(e){alert(e.message);}
      });
      document.querySelectorAll(".revoke-key").forEach(btn=>btn.onclick=async()=>{
        if(!confirm("이 학생의 등록된 Passkey를 전부 해제할까요?"))return;
        const row=btn.closest(".passkey-row");
        try{await edge("revoke-passkeys",{adminPin,memberId:row.dataset.id});await loadPasskeys();}
        catch(e){alert(e.message);}
      });
    }catch(e){el.innerHTML=`<div class="result error">${esc(e.message)}</div>`;}
  }


  async function loadStats(){
    const from=document.getElementById("statsFromDate").value;
    const to=document.getElementById("statsToDate").value;
    const el=document.getElementById("statsResult");
    el.innerHTML='<div class="result">통계를 계산하는 중...</div>';
    const {data,error}=await db.rpc("admin_attendance_range",{p_from:from,p_to:to,p_admin_pin:adminPin});
    if(error){el.innerHTML=`<div class="result error">${esc(error.message)}</div>`;return;}
    const stats=buildStats(data||[]);
    const pct=n=>`${(n*100).toFixed(1)}%`;
    const maxPresent=Math.max(1,...stats.byDate.map(d=>d.present));
    el.innerHTML=`
      <div class="stat-cards">
        <div class="stat-card primary"><span>출석률</span><b>${pct(stats.attendanceRate)}</b><small>${stats.present} / ${stats.total}</small></div>
        <div class="stat-card"><span>정상출근</span><b>${stats.normalIn}</b><small>10:00 이전</small></div>
        <div class="stat-card warn"><span>지각</span><b>${stats.late}</b><small>${stats.present?pct(stats.late/stats.present):"0.0%"}</small></div>
        <div class="stat-card danger"><span>미출근</span><b>${stats.absent}</b><small>${stats.total?pct(stats.absent/stats.total):"0.0%"}</small></div>
        <div class="stat-card warn"><span>조퇴</span><b>${stats.early}</b><small>17:00 이전</small></div>
        <div class="stat-card danger"><span>미퇴근</span><b>${stats.missingOut}</b><small>출근 후 퇴근 기록 없음</small></div>
      </div>

      <h3 class="stats-heading">학생별 통계</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>이름</th><th>출석률</th><th>출근</th><th>지각</th><th>미출근</th><th>평균 출근</th><th>조퇴</th><th>미퇴근</th></tr></thead>
        <tbody>${stats.byMember.map(m=>`<tr>
          <td><b>${esc(m.name)}</b></td>
          <td><span class="rate-pill">${pct(m.attendanceRate)}</span></td>
          <td>${m.present}/${m.total}</td><td>${m.late}</td><td>${m.absent}</td>
          <td>${m.avgCheckIn}</td><td>${m.early}</td><td>${m.missingOut}</td>
        </tr>`).join("")}</tbody>
      </table></div>

      <h3 class="stats-heading">일자별 출석 추이</h3>
      <div class="trend-list">${stats.byDate.map(d=>{
        const rate=d.total?d.present/d.total:0;
        return `<div class="trend-row">
          <div class="trend-date">${esc(d.date)}</div>
          <div class="trend-track"><div class="trend-fill" style="width:${Math.max(2,rate*100)}%"></div></div>
          <div class="trend-value">${d.present}/${d.total} · ${pct(rate)}</div>
          <div class="trend-meta">지각 ${d.late} · 결석 ${d.absent}</div>
        </div>`;
      }).join("") || '<div class="result">조회 기간에 데이터가 없습니다.</div>'}</div>`;
  }

  async function loadHistory(){
    const from=document.getElementById("fromDate").value,to=document.getElementById("toDate").value;
    const {data,error}=await db.rpc("admin_attendance_range",{p_from:from,p_to:to,p_admin_pin:adminPin});
    const el=document.getElementById("historyResult");
    if(error){el.innerHTML=`<div class="result error">${esc(error.message)}</div>`;return;}
    historyRows=data||[];
    el.innerHTML=`<div class="table-wrap history-table"><table><thead><tr><th>날짜</th><th>이름</th><th>출근</th><th>상태</th><th>퇴근</th><th>상태</th></tr></thead><tbody>${
      historyRows.map(r=>`<tr><td>${esc(r.work_date)}</td><td>${esc(r.member_name)}</td><td>${fmtTime(r.check_in)}</td><td>${statusIn(r.check_in)}</td><td>${fmtTime(r.check_out)}</td><td>${statusOut(r.check_out)}</td></tr>`).join("")
    }</tbody></table></div>`;
    document.getElementById("downloadCsv").disabled=!historyRows.length;
    document.getElementById("downloadXlsx").disabled=!historyRows.length;
  }

  document.getElementById("unlock").onclick=async()=>{
    adminPin=document.getElementById("adminPin").value.trim();
    const {error}=await db.rpc("admin_list_members",{p_admin_pin:adminPin});
    if(error){document.getElementById("adminError").innerHTML='<div class="result error">관리자 PIN을 확인하세요.</div>';return;}
    document.getElementById("adminPanel").classList.remove("hidden");
    document.getElementById("adminPin").disabled=true;
    document.getElementById("unlock").disabled=true;
    document.getElementById("unlock").textContent="인증됨";
    await loadToday();
  };
  document.querySelectorAll(".tab").forEach(tab=>tab.onclick=async()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(x=>x.classList.add("hidden"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.remove("hidden");
    if(tab.dataset.tab==="today")await loadToday();
    if(tab.dataset.tab==="members")await loadMembers();
    if(tab.dataset.tab==="passkeys")await loadPasskeys();
    if(tab.dataset.tab==="stats")await loadStats();
    if(tab.dataset.tab==="history")await loadHistory();
  });
  document.getElementById("todayDate").onchange=loadToday;
  document.getElementById("addMember").onclick=async()=>{
    const name=document.getElementById("newName").value.trim();
    const pin=document.getElementById("newPin").value.trim();
    if(!name||pin.length<4)return alert("이름과 4자리 이상의 관리용 PIN을 입력하세요.");
    const {error}=await db.rpc("admin_upsert_member",{p_admin_pin:adminPin,p_member_id:null,p_name:name,p_pin:pin,p_active:true});
    if(error)return alert(error.message);
    document.getElementById("newName").value="";document.getElementById("newPin").value="";
    await loadMembers();
  };
  document.getElementById("loadHistory").onclick=loadHistory;
  document.getElementById("loadStats").onclick=loadStats;
  document.getElementById("downloadCsv").onclick=()=>downloadCsv(historyRows);
  document.getElementById("downloadXlsx").onclick=()=>downloadXlsx(historyRows);
}

function renderHome(){
  app.innerHTML=`
    <div class="badge">출결 시스템</div>
    <h1>Passkey 출결</h1>
    <p class="sub">태블릿 키오스크의 동적 QR을 이용하세요.</p>
    <div class="home-actions">
      <a class="btn-link kiosk large" href="?kiosk=1">태블릿 키오스크</a>
      <a class="btn-link admin-link large" href="?admin=1">관리자</a>
    </div>`;
}

const enroll=params.get("enroll");
const attend=params.get("attend");
if(enroll) renderEnrollment(enroll);
else if(attend) renderAttendance(attend);
else if(params.has("kiosk")) renderKiosk();
else if(params.has("admin")) renderAdmin();
else renderHome();
