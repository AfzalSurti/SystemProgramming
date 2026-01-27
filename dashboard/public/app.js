let INCIDENTS=[];

function sevBadge(incident){ // severity badge ? - based on status code
    if(incident.status===500) return `<span class="badge b-high">HIGH</span>`;
    if(incident.status===404) return `<span class="badge b-med">MEDIUM</span>`;
    return `<span class="badge b-low">LOW</span>`;
}

function statusBadge(status){ // status badge - based on status code
    if (status === 500) return `<span class="badge b-high">500</span>`;
    if (status === 404) return `<span class="badge b-low">404</span>`;
    return `<span class="badge b-low">${status}</span>`;
}

function setLive(ok, text){ // set live status indicator
  const dot = document.getElementById("liveDot");
  const liveText = document.getElementById("liveText");
  dot.style.background = ok ? "var(--good)" : "var(--bad)";
  liveText.textContent = text;
}


function escapeHtml(s){ // escape html special characters ? - for safe display
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

async function loadAll(manual=false){ // load all incidents from server
    try{
        const [stats,incidents]=await Promise.all([
            fetch("/api/stats").then(res=>res.json()),
            fetch("/api/incidents").then(res=>res.json())
        ]);

        const total=stats.total ?? 0;
        const error404=stats.error404 ?? 0;
        const error500=stats.error500 ?? 0;
        const ts=stats.timestamp ?? "N/A";

        document.getElementById("statTotal").textContent=total;
        document.getElementById("stat404").textContent=error404;
        document.getElementById("stat500").textContent=error500;
        document.getElementById("statTime").textContent=`Last Updated: ${ts || "-"}`; //- whatr is this? - timestamp

        INCIDENTS=Array.isArray(incidents) ? incidents : [];
        renderTable();

        setLive(true, manual ? "Manual refresh successful" : "Live");
    }catch(err){
        setLive(false,"API Error");
    }
}

function renderTable(){ // render incidents table
    const q=(document.getElementById("q").value || "").toLowerCase().trim();
    const filter=document.getElementById("filter").value;
    const sort=document.getElementById("sort").value;

    let list=INCIDENTS.slice(); // copy array 

    if(filter!=="all"){ // apply filter
        list=list.filter(x=>String(x.status)===filter);
    }

    if (q){ // apply search query
        list = list.filter(x =>   // search in path, status, key
        String(x.path||"").toLowerCase().includes(q) ||
        String(x.status||"").includes(q) ||
        String(x.key||"").toLowerCase().includes(q)
        );
    }
    list.sort((a,b)=>{ // apply sorting
        if (sort === "count") return (b.count||0) - (a.count||0); // sort by count descending
        if (sort === "status") return (b.status||0) - (a.status||0); // sort by status descending
        if (sort === "path") return String(a.path||"").localeCompare(String(b.path||"")); // sort by path ascending
        if (sort === "lastSeen") return String(b.lastSeen||"").localeCompare(String(a.lastSeen||"")); // sort by lastSeen descending
        return 0;
    });


    if (!list.length){ // no incidents to show
        document.getElementById("tableWrap").innerHTML =
        `<div class="empty">No incidents match your filter/search.</div>`;
        return;
    }

    const rows = list.map((i)=>`
        <tr data-key="${escapeHtml(i.key)}">
        <td class="mono">${escapeHtml(i.path||"")}</td>
        <td>${statusBadge(i.status)}</td>
        <td>${sevBadge(i)}</td>
        <td>${i.count ?? 0}</td>
        <td class="mono muted">${escapeHtml(i.lastSeen||"")}</td>
        <td class="muted">${escapeHtml((i.samples && i.samples[0]) ? i.samples[0] : "")}</td>
        </tr>
    `).join("");
    
    document.getElementById("tableWrap").innerHTML = `
        <table>
        <thead>
            <tr>
            <th>Path</th><th>Status</th><th>Severity</th><th>Count</th><th>Last Seen (UTC)</th><th>Sample</th>
            </tr>
        </thead>
        <tbody id="tbody">${rows}</tbody>
        </table>
    `;

    // attach click handler
  document.getElementById("tbody").onclick = (e) => {
    const tr = e.target.closest("tr");
    if (!tr) return;
    const key = tr.getAttribute("data-key");
    const incident = INCIDENTS.find(x => x.key === key);
    if (incident) showDetails(incident);
  };

}

function showDetails(i){
  document.getElementById("detailEmpty").style.display = "none";
  const d = document.getElementById("detail");
  d.style.display = "block";

  const samples = (i.samples || []).join("\n");

  d.innerHTML = `
    <div class="panelBox">
      <div class="muted">Key</div>
      <div class="mono" style="margin:4px 0 10px 0;">${escapeHtml(i.key||"")}</div>

      <div style="display:grid; grid-template-columns: 110px 1fr; gap:8px 10px; font-size:13px;">
        <div class="muted">Path</div><div class="mono">${escapeHtml(i.path||"")}</div>
        <div class="muted">Status</div><div>${statusBadge(i.status)}</div>
        <div class="muted">Severity</div><div>${sevBadge(i)}</div>
        <div class="muted">Count</div><div>${i.count ?? 0}</div>
        <div class="muted">Last Seen</div><div class="mono">${escapeHtml(i.lastSeen||"")}</div>
      </div>
    </div>

    <div class="sp10"></div>

    <div class="panelBox">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-weight:800;">Samples</div>
          <div class="muted">Used later for AI analysis</div>
        </div>
        <button class="btn" id="copyBtn">Copy Incident JSON</button>
      </div>

      <div class="sp10"></div>
      <pre>${escapeHtml(samples || "No samples")}</pre>
    </div>

    <div class="sp10"></div>
    <div class="muted">Next: we will add “Analyze with Gemini” here (Step D).</div>
  `;

  document.getElementById("copyBtn").onclick = async () => {
    await navigator.clipboard.writeText(JSON.stringify(i, null, 2));
    alert("Copied incident JSON ✅");
  };
}

// wire inputs
document.getElementById("q").addEventListener("input", renderTable);
document.getElementById("filter").addEventListener("change", renderTable);
document.getElementById("sort").addEventListener("change", renderTable);
document.getElementById("refreshBtn").addEventListener("click", () => loadAll(true));

// start polling
loadAll();
setInterval(loadAll, 2000);
