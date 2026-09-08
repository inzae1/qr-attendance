const SUPABASE_URL = "https://wkjyavanphojvbutebgo.supabase.co";
const SUPABASE_KEY = "sb_publishable_A1SUvzt-1hVpKN9hrnI6wQ_3oruWDnK";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const app = document.getElementById("app");
const params = new URLSearchParams(location.search);
const mode = params.get("mode");
const isAdmin = params.has("admin");

function fmt(ts){
  if(!ts) return "-";
  return new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date(ts));
}
function statusIn(ts){
  if(!ts) return "";
  const t = new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(ts));
  return t > "10:00" ? '<span class="status late">지각</span>' : '<span class="status normal">정상</span>';
}
function statusOut(ts){
  if(!ts) return "";
  const t = new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(ts));
  return t < "17:00" ? '<span class="status early">조퇴</span>' : '<span class="status normal">정상</span>';
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
    <div class="nav"><a href="?admin=1">관리자 조회</a></div>
  `;

  const {data, error} = await db.rpc("list_members");
  const select = document.getElementById("member");
  if(error){
    select.innerHTML = "<option>명단 조회 실패</option>";
    document.getElementById("result").innerHTML = `<div class="result error">${error.message}</div>`;
    return;
  }
  select.innerHTML = data.map(m => `<option value="${m.id}">${m.name}</option>`).join("");

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
      document.getElementById("result").innerHTML = `<div class="result error">PIN이 틀렸거나 처리에 실패했습니다.</div>`;
      return;
    }
    const r = rows?.[0];
    const label = type === "in" ? "출근" : "퇴근";
    document.getElementById("result").innerHTML = `
      <div class="result">
        <div class="ok">${r.member_name} · ${label} ${r.already_recorded ? "이미 기록됨" : "완료"}</div>
        <div>${fmt(r.scanned_at)}</div>
        <div>${type === "in" ? statusIn(r.scanned_at) : statusOut(r.scanned_at)}</div>
        ${r.already_recorded ? "<div>오늘 최초 기록 시간이 유지됩니다.</div>" : ""}
      </div>`;
  };
}

async function renderAdmin(){
  const today = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  app.innerHTML = `
    <div class="badge">관리자</div>
    <h1>출결 현황</h1>
    <p class="sub">날짜와 관리자 PIN으로 조회합니다.</p>
    <div class="field"><label>날짜</label><input id="date" type="date" value="${today}"></div>
    <div class="field"><label>관리자 PIN</label><input id="adminPin" type="password" inputmode="numeric"></div>
    <button id="load" class="btn btn-admin">조회</button>
    <div id="result"></div>
    <div class="nav"><a href="?mode=in">출근 화면</a><a href="?mode=out">퇴근 화면</a></div>`;

  document.getElementById("load").onclick = async () => {
    const date = document.getElementById("date").value;
    const pin = document.getElementById("adminPin").value.trim();
    const {data, error} = await db.rpc("admin_attendance",{p_date:date,p_admin_pin:pin});
    const result = document.getElementById("result");
    if(error){
      result.innerHTML = `<div class="result error">관리자 PIN이 틀렸거나 조회에 실패했습니다.</div>`;
      return;
    }
    result.innerHTML = `<div class="table-wrap"><table><thead><tr><th>이름</th><th>출근</th><th>퇴근</th></tr></thead><tbody>${
      data.map(r=>`<tr><td>${r.member_name}</td><td>${fmt(r.check_in)} ${statusIn(r.check_in)}</td><td>${fmt(r.check_out)} ${statusOut(r.check_out)}</td></tr>`).join("")
    }</tbody></table></div>`;
  };
}

if(isAdmin) renderAdmin();
else renderScan();
