const SUPABASE_URL = "https://wkjyavanphojvbutebgo.supabase.co";
const SUPABASE_KEY = "sb_publishable_A1SUvzt-1hVpKN9hrnI6wQ_3oruWDnK";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const app = document.getElementById("app");
const params = new URLSearchParams(location.search);
const mode = params.get("mode");
const isAdmin = params.has("admin");
const BASE_URL = `${location.origin}${location.pathname}`;

function esc(v){
  return String(v ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function fmt(ts){
  if(!ts) return "-";
  return new Intl.DateTimeFormat("ko-KR",{
    timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false
  }).format(new Date(ts));
}

function fmtTime(ts){
  if(!ts) return "-";
  return new Intl.DateTimeFormat("ko-KR",{
    timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false
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
  return hhmm(ts) > "10:00"
    ? '<span class="status late">지각</span>'
    : '<span class="status normal">정상</span>';
}

function statusOut(ts){
  if(!ts) return '<span class="status absent">미퇴근</span>';
  return hhmm(ts) < "17:00"
    ? '<span class="status early">조퇴</span>'
    : '<span class="status normal">정상</span>';
}

function kstDate(d = new Date()){
  const parts = new Intl.DateTimeFormat("en-US",{
    timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(d);
  const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${m.year}-${m.month}-${m.day}`;
}

function firstDayOfMonth(){
  const t = kstDate();
  return `${t.slice(0,7)}-01`;
}

function downloadCsv(rows){
  const header = ["날짜","이름","출근","출근상태","퇴근","퇴근상태"];
  const lines = [header];
  for(const r of rows){
    lines.push([
      r.work_date,
      r.member_name,
      r.check_in ? fmt(r.check_in) : "",
      r.check_in ? (hhmm(r.check_in) > "10:00" ? "지각" : "정상") : "미출근",
      r.check_out ? fmt(r.check_out) : "",
      r.check_out ? (hhmm(r.check_out) < "17:00" ? "조퇴" : "정상") : "미퇴근"
    ]);
  }
  const csv = "\uFEFF" + lines.map(row =>
    row.map(v => `"${String(v ?? "").replaceAll('"','""')}"`).join(",")
  ).join("\r\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `출결내역_${document.getElementById("fromDate").value}_${document.getElementById("toDate").value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function renderScan(){
  const type = mode === "out" ? "out" : "in";
  const title = type === "in" ? "출근 체크" : "퇴근 체크";
  const buttonClass = type === "in" ? "btn-in" : "btn-out";

  app.innerHTML = `
    <div class="badge">${type === "in" ? "출근 QR" : "퇴근 QR"}</div>
    <h1>${title}</h1>
    <p class="sub">이름을 선택하고 개인 PIN을 입력하세요.</p>
    <div class="field"><label>이름</label><select id="member"><option>불러오는 중...</option></select></div>
    <div class="field"><label>PIN</label><input id="pin" type="password" inputmode="numeric" maxlength="12" placeholder="PIN 입력"></div>
    <button id="submit" class="btn ${buttonClass}">${type === "in" ? "출근 기록" : "퇴근 기록"}</button>
    <div id="result"></div>
    <div class="nav"><a href="?admin=1">관리자</a></div>
  `;

  const {data, error} = await db.rpc("list_members");
  const select = document.getElementById("member");
  if(error){
    select.innerHTML = "<option>명단 조회 실패</option>";
    document.getElementById("result").innerHTML = `<div class="result error">${esc(error.message)}</div>`;
    return;
  }
  select.innerHTML = data.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join("");

  document.getElementById("submit").onclick = async () => {
    const pin = document.getElementById("pin").value.trim();
    const memberId = select.value;
    if(!pin) return;
    const btn = document.getElementById("submit");
    btn.disabled = true;
    btn.textContent = "처리 중...";

    const {data: rows, error: err} = await db.rpc("record_attendance",{
      p_member_id: memberId, p_pin: pin, p_type: type
    });

    btn.disabled = false;
    btn.textContent = type === "in" ? "출근 기록" : "퇴근 기록";

    if(err){
      document.getElementById("result").innerHTML =
        `<div class="result error">PIN이 틀렸거나 처리에 실패했습니다.</div>`;
      return;
    }

    const r = rows?.[0];
    const label = type === "in" ? "출근" : "퇴근";
    document.getElementById("result").innerHTML = `
      <div class="result">
        <div class="ok">${esc(r.member_name)} · ${label} ${r.already_recorded ? "이미 기록됨" : "완료"}</div>
        <div>${fmt(r.scanned_at)}</div>
        <div>${type === "in" ? statusIn(r.scanned_at) : statusOut(r.scanned_at)}</div>
        ${r.already_recorded ? "<div>오늘 최초 기록 시간이 유지됩니다.</div>" : ""}
      </div>`;
  };
}

async function renderAdmin(){
  const today = kstDate();

  app.innerHTML = `
    <div class="badge">관리자</div>
    <h1>QR 출결 관리자</h1>
    <p class="sub">학생 관리 · QR · 전체 출결 내역</p>

    <div class="login-row">
      <div class="field grow">
        <label>관리자 PIN</label>
        <input id="adminPin" type="password" inputmode="numeric" placeholder="관리자 PIN">
      </div>
      <button id="unlock" class="btn btn-admin compact">관리 시작</button>
    </div>

    <div id="adminError"></div>

    <div id="adminPanel" class="hidden">
      <div class="tabs">
        <button class="tab active" data-tab="today">오늘 출결</button>
        <button class="tab" data-tab="members">학생 관리</button>
        <button class="tab" data-tab="qr">QR 코드</button>
        <button class="tab" data-tab="history">전체 내역</button>
      </div>

      <section id="tab-today" class="tab-panel">
        <div class="section-head">
          <h2>오늘 출결</h2>
          <input id="todayDate" type="date" value="${today}">
        </div>
        <div id="todayResult"></div>
      </section>

      <section id="tab-members" class="tab-panel hidden">
        <div class="section-head"><h2>학생 관리</h2></div>
        <div class="member-add">
          <input id="newName" placeholder="학생 이름">
          <input id="newPin" placeholder="PIN (4자리 이상)" inputmode="numeric">
          <button id="addMember" class="btn btn-admin compact">학생 추가</button>
        </div>
        <p class="hint">기존 학생의 PIN은 빈칸으로 저장하면 유지됩니다.</p>
        <div id="memberResult"></div>
      </section>

      <section id="tab-qr" class="tab-panel hidden">
        <div class="section-head"><h2>고정 QR 코드</h2></div>
        <div class="qr-grid">
          <div class="qr-card">
            <h3>출근 QR</h3>
            <div id="qrIn" class="qr-box"></div>
            <div class="qr-url">${esc(BASE_URL)}?mode=in</div>
            <a class="btn-link in" href="${esc(BASE_URL)}?mode=in" target="_blank">출근 페이지 열기</a>
          </div>
          <div class="qr-card">
            <h3>퇴근 QR</h3>
            <div id="qrOut" class="qr-box"></div>
            <div class="qr-url">${esc(BASE_URL)}?mode=out</div>
            <a class="btn-link out" href="${esc(BASE_URL)}?mode=out" target="_blank">퇴근 페이지 열기</a>
          </div>
        </div>
        <p class="hint">이 QR은 고정입니다. 출력해서 계속 사용하면 됩니다.</p>
      </section>

      <section id="tab-history" class="tab-panel hidden">
        <div class="section-head"><h2>전체 출결 내역</h2></div>
        <div class="range-row">
          <div class="field"><label>시작일</label><input id="fromDate" type="date" value="${firstDayOfMonth()}"></div>
          <div class="field"><label>종료일</label><input id="toDate" type="date" value="${today}"></div>
          <button id="loadHistory" class="btn btn-admin compact">조회</button>
          <button id="downloadCsv" class="btn btn-secondary compact" disabled>CSV 다운로드</button>
        </div>
        <div id="historySummary"></div>
        <div id="historyResult"></div>
      </section>
    </div>

    <div class="nav"><a href="?mode=in">출근 화면</a><a href="?mode=out">퇴근 화면</a></div>
  `;

  let adminPin = "";
  let historyRows = [];

  function showError(msg){
    document.getElementById("adminError").innerHTML = msg
      ? `<div class="result error">${esc(msg)}</div>` : "";
  }

  async function loadToday(){
    const date = document.getElementById("todayDate").value;
    const {data, error} = await db.rpc("admin_attendance",{p_date:date,p_admin_pin:adminPin});
    const el = document.getElementById("todayResult");
    if(error){
      el.innerHTML = `<div class="result error">조회 실패: ${esc(error.message)}</div>`;
      return;
    }
    el.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>이름</th><th>출근</th><th>상태</th><th>퇴근</th><th>상태</th></tr></thead>
      <tbody>${data.map(r => `<tr>
        <td>${esc(r.member_name)}</td>
        <td>${fmtTime(r.check_in)}</td><td>${statusIn(r.check_in)}</td>
        <td>${fmtTime(r.check_out)}</td><td>${statusOut(r.check_out)}</td>
      </tr>`).join("")}</tbody></table></div>`;
  }

  async function loadMembers(){
    const {data, error} = await db.rpc("admin_list_members",{p_admin_pin:adminPin});
    const el = document.getElementById("memberResult");
    if(error){
      el.innerHTML = `<div class="result error">학생 조회 실패: ${esc(error.message)}</div>`;
      return;
    }

    el.innerHTML = `<div class="member-list">${data.map(m => `
      <div class="member-row" data-id="${m.member_id}">
        <input class="member-name" value="${esc(m.member_name)}">
        <input class="member-pin" placeholder="새 PIN (변경시에만)">
        <label class="switch-label"><input class="member-active" type="checkbox" ${m.active ? "checked" : ""}> 사용</label>
        <button class="save-member btn btn-secondary compact">저장</button>
      </div>`).join("")}</div>`;

    document.querySelectorAll(".save-member").forEach(btn => {
      btn.onclick = async () => {
        const row = btn.closest(".member-row");
        const {error} = await db.rpc("admin_upsert_member",{
          p_admin_pin: adminPin,
          p_member_id: row.dataset.id,
          p_name: row.querySelector(".member-name").value.trim(),
          p_pin: row.querySelector(".member-pin").value.trim() || null,
          p_active: row.querySelector(".member-active").checked
        });
        if(error){
          alert(`저장 실패: ${error.message}`);
          return;
        }
        row.querySelector(".member-pin").value = "";
        btn.textContent = "저장됨";
        setTimeout(()=>btn.textContent="저장",900);
      };
    });
  }

  async function loadHistory(){
    const from = document.getElementById("fromDate").value;
    const to = document.getElementById("toDate").value;
    const {data, error} = await db.rpc("admin_attendance_range",{
      p_from:from,p_to:to,p_admin_pin:adminPin
    });

    const el = document.getElementById("historyResult");
    if(error){
      el.innerHTML = `<div class="result error">전체 내역 조회 실패: ${esc(error.message)}</div>`;
      document.getElementById("downloadCsv").disabled = true;
      return;
    }

    historyRows = data || [];
    const present = historyRows.filter(r=>r.check_in).length;
    const late = historyRows.filter(r=>r.check_in && hhmm(r.check_in) > "10:00").length;
    const early = historyRows.filter(r=>r.check_out && hhmm(r.check_out) < "17:00").length;
    const absent = historyRows.filter(r=>!r.check_in).length;

    document.getElementById("historySummary").innerHTML = `
      <div class="summary-grid">
        <div><b>${present}</b><span>출근</span></div>
        <div><b>${late}</b><span>지각</span></div>
        <div><b>${early}</b><span>조퇴</span></div>
        <div><b>${absent}</b><span>미출근</span></div>
      </div>`;

    el.innerHTML = `<div class="table-wrap history-table"><table>
      <thead><tr><th>날짜</th><th>이름</th><th>출근</th><th>출근상태</th><th>퇴근</th><th>퇴근상태</th></tr></thead>
      <tbody>${historyRows.map(r=>`<tr>
        <td>${esc(r.work_date)}</td><td>${esc(r.member_name)}</td>
        <td>${fmtTime(r.check_in)}</td><td>${statusIn(r.check_in)}</td>
        <td>${fmtTime(r.check_out)}</td><td>${statusOut(r.check_out)}</td>
      </tr>`).join("")}</tbody></table></div>`;

    document.getElementById("downloadCsv").disabled = historyRows.length === 0;
  }

  function makeQr(){
    document.getElementById("qrIn").innerHTML = "";
    document.getElementById("qrOut").innerHTML = "";
    new QRCode(document.getElementById("qrIn"), {
      text: `${BASE_URL}?mode=in`, width:220, height:220,
      correctLevel: QRCode.CorrectLevel.H
    });
    new QRCode(document.getElementById("qrOut"), {
      text: `${BASE_URL}?mode=out`, width:220, height:220,
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  document.getElementById("unlock").onclick = async () => {
    adminPin = document.getElementById("adminPin").value.trim();
    if(!adminPin) return;
    const {error} = await db.rpc("admin_list_members",{p_admin_pin:adminPin});
    if(error){
      showError("관리자 PIN이 틀렸습니다.");
      return;
    }
    showError("");
    document.getElementById("adminPanel").classList.remove("hidden");
    document.getElementById("adminPin").disabled = true;
    document.getElementById("unlock").disabled = true;
    document.getElementById("unlock").textContent = "인증됨";
    await loadToday();
  };

  document.querySelectorAll(".tab").forEach(tab => {
    tab.onclick = async () => {
      document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p=>p.classList.add("hidden"));
      tab.classList.add("active");
      document.getElementById(`tab-${tab.dataset.tab}`).classList.remove("hidden");

      if(tab.dataset.tab === "today") await loadToday();
      if(tab.dataset.tab === "members") await loadMembers();
      if(tab.dataset.tab === "qr") makeQr();
      if(tab.dataset.tab === "history") await loadHistory();
    };
  });

  document.getElementById("todayDate").onchange = loadToday;

  document.getElementById("addMember").onclick = async () => {
    const name = document.getElementById("newName").value.trim();
    const pin = document.getElementById("newPin").value.trim();
    if(!name || pin.length < 4){
      alert("이름과 4자리 이상의 PIN을 입력하세요.");
      return;
    }
    const {error} = await db.rpc("admin_upsert_member",{
      p_admin_pin:adminPin,p_member_id:null,p_name:name,p_pin:pin,p_active:true
    });
    if(error){
      alert(`학생 추가 실패: ${error.message}`);
      return;
    }
    document.getElementById("newName").value = "";
    document.getElementById("newPin").value = "";
    await loadMembers();
  };

  document.getElementById("loadHistory").onclick = loadHistory;
  document.getElementById("downloadCsv").onclick = () => downloadCsv(historyRows);
}

if(isAdmin) renderAdmin();
else renderScan();
