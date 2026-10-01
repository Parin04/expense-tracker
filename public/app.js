const CATEGORIES = {
  expense: [
    { name: "อาหาร", emoji: "🍜" },
    { name: "เดินทาง", emoji: "🚗" },
    { name: "ช้อปปิ้ง", emoji: "🛍️" },
    { name: "ค่าน้ำค่าไฟ", emoji: "💡" },
    { name: "ที่พัก", emoji: "🏠" },
    { name: "สุขภาพ", emoji: "💊" },
    { name: "บันเทิง", emoji: "🎬" },
    { name: "อื่นๆ", emoji: "📦" },
  ],
  income: [
    { name: "เงินเดือน", emoji: "💼" },
    { name: "ฟรีแลนซ์", emoji: "💻" },
    { name: "ขายของ", emoji: "🏷️" },
    { name: "ของขวัญ", emoji: "🎁" },
    { name: "อื่นๆ", emoji: "📦" },
  ],
};

const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

const state = {
  month: toMonth(new Date()),
  type: "expense",
  category: CATEGORIES.expense[0].name,
};

// ใช้วันที่ตามเวลาเครื่อง ไม่ใช้ toISOString (เป็น UTC ทำให้วันเพี้ยน)
function toDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toMonth(d) {
  return toDate(d).slice(0, 7);
}
function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  return toMonth(new Date(y, m - 1 + delta, 1));
}
function emojiFor(type, category) {
  return (CATEGORIES[type].find((c) => c.name === category) || { emoji: "📦" }).emoji;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

function showError(err) {
  $("error").textContent = err ? `เกิดข้อผิดพลาด: ${err.message}` : "";
  $("error").hidden = !err;
}

/* ---------- form ---------- */

function renderCategories() {
  $("categories").replaceChildren(
    ...CATEGORIES[state.type].map((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = `${c.emoji} ${c.name}`;
      b.className = c.name === state.category ? "active" : "";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(c.name === state.category));
      b.addEventListener("click", () => {
        state.category = c.name;
        renderCategories();
      });
      return b;
    })
  );
}

document.querySelectorAll(".type-toggle button").forEach((btn) => {
  btn.addEventListener("click", () => {
    state.type = btn.dataset.type;
    state.category = CATEGORIES[state.type][0].name;
    document.querySelectorAll(".type-toggle button").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });
    renderCategories();
  });
});

$("tx-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submit = e.target.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    const date = $("date").value;
    await api("POST", "/api/transactions", {
      type: state.type,
      amount: Number($("amount").value),
      category: state.category,
      note: $("note").value,
      date,
    });
    $("amount").value = "";
    $("note").value = "";
    showError(null);
    // บันทึกของเดือนอื่น ให้เลื่อนไปดูเดือนนั้น
    state.month = date.slice(0, 7);
    await load();
    $("amount").focus();
  } catch (err) {
    showError(err);
  } finally {
    submit.disabled = false;
  }
});

/* ---------- data ---------- */

function renderSummary(s) {
  // ตัวเลขยาวเกินช่องจะถูกตัดด้วย "…" ใส่ title ไว้ให้ดูค่าเต็มได้
  for (const [id, value] of [["sum-income", s.income], ["sum-expense", s.expense], ["sum-balance", s.balance]]) {
    $(id).textContent = $(id).title = money.format(value);
  }
  $("sum-balance").className = `value ${s.balance < 0 ? "expense" : ""}`;

  const max = Math.max(0, ...s.expenseByCategory.map((c) => c.total));
  $("breakdown-card").hidden = s.expenseByCategory.length === 0;
  $("breakdown").replaceChildren(
    ...s.expenseByCategory.map((c) => {
      const li = document.createElement("li");
      const pct = s.expense ? Math.round((c.total / s.expense) * 100) : 0;
      li.innerHTML = `
        <div class="head"><span></span><span></span></div>
        <div class="track"><div class="fill"></div></div>`;
      li.querySelector(".head span:first-child").textContent = `${emojiFor("expense", c.category)} ${c.category}`;
      li.querySelector(".head span:last-child").textContent = `฿${money.format(c.total)} · ${pct}%`;
      li.querySelector(".fill").style.width = `${max ? (c.total / max) * 100 : 0}%`;
      return li;
    })
  );
}

function renderList(rows) {
  $("empty").hidden = rows.length > 0;

  const byDay = new Map();
  for (const r of rows) {
    if (!byDay.has(r.date)) byDay.set(r.date, []);
    byDay.get(r.date).push(r);
  }

  const dayFmt = new Intl.DateTimeFormat("th-TH", { weekday: "short", day: "numeric", month: "short" });

  $("list").replaceChildren(
    ...[...byDay].map(([date, items]) => {
      const day = document.createElement("div");
      day.className = "day";

      const net = items.reduce((s, r) => s + (r.type === "income" ? r.amount : -r.amount), 0);
      const head = document.createElement("div");
      head.className = "day-head";
      const [y, m, d] = date.split("-").map(Number);
      head.innerHTML = "<span></span><span></span>";
      head.children[0].textContent = dayFmt.format(new Date(y, m - 1, d));
      head.children[1].textContent = `${net >= 0 ? "+" : "−"}${money.format(Math.abs(net))}`;
      day.append(head);

      for (const r of items) {
        const row = document.createElement("div");
        row.className = "tx";
        row.innerHTML = `
          <span class="emoji"></span>
          <div class="info"><div class="cat"></div><div class="note"></div></div>
          <span class="amt"></span>
          <button class="del">×</button>`;
        row.querySelector(".emoji").textContent = emojiFor(r.type, r.category);
        row.querySelector(".cat").textContent = r.category;
        row.querySelector(".note").textContent = r.note;
        const amt = row.querySelector(".amt");
        amt.textContent = `${r.type === "income" ? "+" : "−"}${money.format(r.amount)}`;
        amt.classList.add(r.type);
        const del = row.querySelector(".del");
        del.setAttribute("aria-label", `ลบ ${r.category} ${money.format(r.amount)} บาท`);
        del.addEventListener("click", async () => {
          if (!confirm(`ลบรายการ ${r.category} ${money.format(r.amount)} บาท?`)) return;
          try {
            await api("DELETE", `/api/transactions/${r.id}`);
            await load();
          } catch (err) {
            showError(err);
          }
        });
        day.append(row);
      }
      return day;
    })
  );
}

async function load() {
  const [y, m] = state.month.split("-").map(Number);
  $("month-label").textContent = new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric" }).format(
    new Date(y, m - 1, 1)
  );

  const month = state.month;
  const [rows, summary] = await Promise.all([
    api("GET", `/api/transactions?month=${month}`),
    api("GET", `/api/summary?month=${month}`),
  ]);
  // กดเปลี่ยนเดือนเร็วๆ ไม่ให้ผลของเดือนเก่ามาทับ
  if (month !== state.month) return;
  renderList(rows);
  renderSummary(summary);
}

$("prev-month").addEventListener("click", () => {
  state.month = shiftMonth(state.month, -1);
  load().catch(showError);
});
$("next-month").addEventListener("click", () => {
  state.month = shiftMonth(state.month, 1);
  load().catch(showError);
});

$("date").value = toDate(new Date());
renderCategories();
load().catch(showError);
