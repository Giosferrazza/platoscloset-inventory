// ── STATE ────────────────────────────────────────────────────────────────────
let selectedFile=null, factTableData=null, aiSummaryData=null;
let charts={};

// ── TABS ─────────────────────────────────────────────────────────────────────
function showTab(name){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('panel-'+name).classList.add('active');
  event.target.classList.add('active');
}

// ── API KEY ──────────────────────────────────────────────────────────────────
function saveKey(){
  const k=document.getElementById('apiKey').value.trim();
  if(!k.startsWith('sk-ant-')){setStatus('Invalid key format','missing');return;}
  sessionStorage.setItem('ak',k);
  setStatus('&#x25CF; Key saved for this session','ok');
  checkRunnable();
}
function getKey(){return sessionStorage.getItem('ak')||'';}
function setStatus(msg,cls){
  const el=document.getElementById('apiStatus');
  el.innerHTML=msg; el.className='api-status '+cls;
}
window.onload=()=>{
  const k=getKey();
  if(k){document.getElementById('apiKey').value=k;setStatus('&#x25CF; Key loaded from session','ok');}
  checkRunnable();
};

// ── FILE ─────────────────────────────────────────────────────────────────────
function handleFile(file){
  if(!file)return;
  selectedFile=file;
  document.getElementById('fileName').textContent=file.name;
  document.getElementById('fileSize').textContent=(file.size/1024).toFixed(0)+' KB';
  document.getElementById('filePill').classList.add('show');
  checkRunnable();
}
const dz=document.getElementById('dropZone');
dz.addEventListener('dragover',e=>{e.preventDefault();dz.classList.add('dragging');});
dz.addEventListener('dragleave',()=>dz.classList.remove('dragging'));
dz.addEventListener('drop',e=>{e.preventDefault();dz.classList.remove('dragging');const f=e.dataTransfer.files[0];if(f)handleFile(f);});
function checkRunnable(){document.getElementById('runBtn').disabled=!(selectedFile&&getKey());}

// ── COLUMN MAP ───────────────────────────────────────────────────────────────
const MONTHS_COLS=[6,7,8,9,10,11,12,13,14,15,16,17,18];
const SUBCAT_LABEL=19;
const SUBCAT_BOM=[20,21,22,23,24,25,26,27,28,29,30,31,32];
const SUBCAT_SELLS=[50,51,52,53,54,55,56,57,58,59,60,61,62];
const SUBCAT_BUYS=[35,36,37,38,39,40,41,42,43,44,45,46,47];
const SUBCAT_EOM=[65,66,67,68,69,70,71,72,73,74,75,76,77];
const SUBCAT_ST=[79,80,81,82,83,84,85,86,87,88,89,90,91];
const SUBCAT_TURNRATE=92,SUBCAT_RETAIL=48,SUBCAT_AVG_RETAIL=49;
const DETAIL_LABEL=93;
const DETAIL_BOM=[94,95,96,97,98,99,100,101,102,103,104,105,106];
const DETAIL_SELLS=[124,125,126,127,128,129,130,131,132,133,134,135,136];
const DETAIL_BUYS=[109,110,111,112,113,114,115,116,117,118,119,120,121];
const DETAIL_EOM=[139,140,141,142,143,144,145,146,147,148,149,150,151];
const DETAIL_ST=[153,154,155,156,157,158,159,160,161,162,163,164,165];
const DETAIL_TURNRATE=166,DETAIL_RETAIL=122,DETAIL_AVG_RETAIL=123;

function cn(v){
  if(v===undefined||v===null)return null;
  const s=v.toString().trim().replace(/,/g,'').replace(/\$/g,'').replace(/%/g,'');
  if(['-','nan',''].includes(s))return null;
  const n=parseFloat(s);return isNaN(n)?null:n;
}

function parseCSV(text){
  const rows=[];let cur='',inQ=false,row=[];
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){inQ=!inQ;}
    else if(c===','&&!inQ){row.push(cur);cur='';}
    else if((c==='\n'||c==='\r')&&!inQ){
      if(cur||row.length){row.push(cur);rows.push(row);cur='';row=[];}
      if(c==='\r'&&text[i+1]==='\n')i++;
    }else{cur+=c;}
  }
  if(cur||row.length){row.push(cur);rows.push(row);}
  return rows;
}

function setStep(n){
  for(let i=1;i<=5;i++){
    const el=document.getElementById('step'+i);
    el.classList.remove('active','done');
    const num=el.querySelector('.step-num');
    if(i<n){el.classList.add('done');num.textContent='✓';}
    else if(i===n){el.classList.add('active');num.textContent=String(i).padStart(2,'0');}
    else{num.textContent=String(i).padStart(2,'0');}
  }
}

function doneAll(){
  for(let i=1;i<=5;i++){
    const el=document.getElementById('step'+i);
    el.classList.remove('active');el.classList.add('done');
    el.querySelector('.step-num').textContent='✓';
  }
}

function showError(msg){
  const b=document.getElementById('errorBox');
  b.textContent=msg;b.className=msg?'error-box show':'error-box';
}

const delay=ms=>new Promise(r=>setTimeout(r,ms));

// ── CHART HELPERS ────────────────────────────────────────────────────────────
const chartDefaults={
  color:'#888',
  borderColor:'#2a2a2a',
  plugins:{legend:{labels:{color:'#888',font:{family:'JetBrains Mono',size:10}}}},
  scales:{
    x:{ticks:{color:'#888',font:{family:'JetBrains Mono',size:9}},grid:{color:'#1a1a1a'},border:{color:'#2a2a2a'}},
    y:{ticks:{color:'#888',font:{family:'JetBrains Mono',size:9}},grid:{color:'#1a1a1a'},border:{color:'#2a2a2a'}}
  }
};

function destroyChart(id){if(charts[id]){charts[id].destroy();delete charts[id];}}

// ── MAIN PIPELINE ─────────────────────────────────────────────────────────────
async function runPipeline(){
  showError('');
  document.getElementById('progressCard').classList.add('show');
  document.getElementById('uploadResults').style.display='none';
  document.getElementById('runBtn').disabled=true;

  try{
    const text=await selectedFile.text();
    const lines=parseCSV(text);

    // STEP 1 - Parse
    setStep(1);await delay(400);
    const months=MONTHS_COLS.map(i=>lines[1]?.[i]?.trim()||'');

    // STEP 2 - Fact table
    setStep(2);await delay(300);
    const factRecords=[];

    for(let ri=1;ri<lines.length;ri++){
      const row=lines[ri];
      if(!row||row.length<100)continue;
      const scl=row[SUBCAT_LABEL]?.trim()||'';
      const dl=row[DETAIL_LABEL]?.trim()||'';
      const sm=scl.match(/\[(\d+)\]\s+(.+)/);if(!sm)continue;
      const sid=sm[1],sname=sm[2].trim();
      const dm=dl.match(/:\s+[^:]+:\s+(.+)$/)??dl.match(/\[\d+\]\s+(.+)$/);if(!dm)continue;
      const dname=dm[1].trim();
      months.forEach((month,mi)=>{
        factRecords.push({
          SubcategoryID:sid,Subcategory:sname,Detail:dname,Month:month,
          SubCat_BOM:cn(row[SUBCAT_BOM[mi]]),SubCat_Sells:cn(row[SUBCAT_BUYS[mi]]),
          SubCat_Buys:cn(row[SUBCAT_SELLS[mi]]),SubCat_EOM:cn(row[SUBCAT_EOM[mi]]),
          SubCat_SellThrough_Pct:cn(row[SUBCAT_ST[mi]]),SubCat_TurnRate:cn(row[SUBCAT_TURNRATE]),
          SubCat_LatestRetail:cn(row[SUBCAT_RETAIL]),SubCat_AvgRetail:cn(row[SUBCAT_AVG_RETAIL]),
          Detail_BOM:cn(row[DETAIL_BOM[mi]]),Detail_Sells:cn(row[DETAIL_BUYS[mi]]),
          Detail_Buys:cn(row[DETAIL_SELLS[mi]]),Detail_EOM:cn(row[DETAIL_EOM[mi]]),
          Detail_SellThrough_Pct:cn(row[DETAIL_ST[mi]]),Detail_TurnRate:cn(row[DETAIL_TURNRATE]),
          Detail_LatestRetail:cn(row[DETAIL_RETAIL]),Detail_AvgRetail:cn(row[DETAIL_AVG_RETAIL]),
        });
      });
    }
    factTableData=factRecords;

    // STEP 3 - AI Summary
    setStep(3);await delay(300);
    const latestMonth=months[months.length-1];
    const recentMonths=months.slice(-3);
    const latestRecs=factRecords.filter(r=>r.Month===latestMonth);

    const aiSummary=latestRecs.map(r=>{
      const recent=factRecords.filter(f=>f.Detail===r.Detail&&recentMonths.includes(f.Month));
      const avg3mo=recent.length?recent.reduce((s,f)=>s+(f.Detail_SellThrough_Pct||0),0)/recent.length:0;
      const t3b=recent.reduce((s,f)=>s+(f.Detail_Sells||0),0);
      const t3s=recent.reduce((s,f)=>s+(f.Detail_Buys||0),0);
      const st=r.Detail_SellThrough_Pct,tr=r.Detail_TurnRate;
      let flag='Normal';
      if(st===null)flag='No Data';
      else if(tr!==null&&tr>=1.0)flag='Strong Turner';
      else if(st>=10)flag='High Sell-Through';
      else if(st<3)flag='Low Sell-Through';
      return{
        ReportMonth:latestMonth,Subcategory:r.Subcategory,Detail:r.Detail,
        OnHand_BOM:r.Detail_BOM,Buys_LatestMo:r.Detail_Sells,Sells_LatestMo:r.Detail_Buys,
        OnHand_EOM:r.Detail_EOM,SellThrough_Pct:st,Avg3Mo_SellThrough_Pct:Math.round(avg3mo*10)/10,
        Total3Mo_Buys:t3b,Total3Mo_Sells:t3s,TurnRate:tr,
        TotalRetailValue:r.Detail_LatestRetail,AvgRetailPrice:r.Detail_AvgRetail,Flag:flag,
      };
    });
    aiSummaryData=aiSummary;

    const flags={
      strong:aiSummary.filter(r=>r.Flag==='Strong Turner').length,
      high:aiSummary.filter(r=>r.Flag==='High Sell-Through').length,
      low:aiSummary.filter(r=>r.Flag==='Low Sell-Through').length,
      normal:aiSummary.filter(r=>r.Flag==='Normal').length,
    };

    // STEP 4 - Build dashboards
    setStep(4);await delay(300);
    buildBuyBreakdown(aiSummary,factRecords,months,latestMonth);
    buildAging(aiSummary,factRecords,months);
    buildEventReadiness(aiSummary);

    // Update overview KPIs
    document.getElementById('ovMonth').textContent=latestMonth;
    document.getElementById('ovStrong').textContent=flags.strong;
    document.getElementById('ovLow').textContent=flags.low;
    document.getElementById('ovTotal').textContent=aiSummary.length;
    document.getElementById('insightsMonth').textContent=latestMonth;

    // Show results
    document.getElementById('uploadResults').style.display='block';

    // STEP 5 - Claude AI
    setStep(5);
    const top=aiSummary.filter(r=>r.Flag==='Strong Turner'||r.Flag==='High Sell-Through')
      .sort((a,b)=>(b.SellThrough_Pct||0)-(a.SellThrough_Pct||0)).slice(0,15);
    const low=aiSummary.filter(r=>r.Flag==='Low Sell-Through')
      .sort((a,b)=>(a.SellThrough_Pct||0)-(b.SellThrough_Pct||0)).slice(0,15);

    const resp=await fetch('/api/claude',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':getKey(),
        'anthropic-version':'2023-06-01',
      },
      body:JSON.stringify({
        model:'claude-sonnet-4-20250514',
        max_tokens:1024,
        messages:[{role:'user',content:`You are a retail inventory analyst for Plato's Closet Store #80209 in Reno, NV — a used clothing resale store.

Analyze this inventory data for ${latestMonth}.

SUMMARY: Strong Turners: ${flags.strong} | High Sell-Through: ${flags.high} | Low Sell-Through: ${flags.low} | Normal: ${flags.normal}

TOP PERFORMERS:
${JSON.stringify(top.map(r=>({detail:r.Detail,st:r.SellThrough_Pct,avg3mo:r.Avg3Mo_SellThrough_Pct,tr:r.TurnRate,buys3mo:r.Total3Mo_Buys,onHand:r.OnHand_EOM,flag:r.Flag})),null,1)}

UNDERPERFORMERS:
${JSON.stringify(low.map(r=>({detail:r.Detail,st:r.SellThrough_Pct,avg3mo:r.Avg3Mo_SellThrough_Pct,tr:r.TurnRate,onHand:r.OnHand_EOM})),null,1)}

Provide exactly:
**Strengths** — top 3-4 categories to keep buying aggressively (cite specific numbers)
**Weaknesses** — top 3-4 dead weight categories (cite specific numbers)
**Buying Plan** — specific actions for next month
**Immediate Action** — one thing the store manager should do THIS WEEK

Use actual category names. Under 400 words.`}]
      })
    });

    if(!resp.ok){const e=await resp.json();throw new Error(e.error?.message||'API error');}
    const data=await resp.json();
    document.getElementById('insightsText').textContent=data.content[0].text;

    doneAll();

  }catch(err){
    showError('Error: '+err.message);
    console.error(err);
  }
  document.getElementById('runBtn').disabled=false;
}

// ── BUY BREAKDOWN DASHBOARD ──────────────────────────────────────────────────
function buildBuyBreakdown(aiSummary,factRecords,months,latestMonth){
  document.getElementById('bb-empty').style.display='none';
  document.getElementById('bb-content').style.display='block';

  // KPIs
  const totalBuys=aiSummary.reduce((s,r)=>s+(r.Buys_LatestMo||0),0);
  const totalSells=aiSummary.reduce((s,r)=>s+(r.Sells_LatestMo||0),0);
  const stVals=aiSummary.filter(r=>r.SellThrough_Pct!==null).map(r=>r.SellThrough_Pct);
  const avgST=stVals.length?(stVals.reduce((a,b)=>a+b,0)/stVals.length).toFixed(1):'--';
  const topCat=aiSummary.sort((a,b)=>(b.Sells_LatestMo||0)-(a.Sells_LatestMo||0))[0]?.Subcategory||'--';

  document.getElementById('bb-totalBuys').textContent=totalBuys;
  document.getElementById('bb-totalSells').textContent=totalSells;
  document.getElementById('bb-avgST').textContent=avgST+'%';
  document.getElementById('bb-topCat').textContent=topCat.replace('Accessories ','').replace('Womens ','W. ').replace('Mens ','M. ');

  // Group by subcategory
  const bySub={};
  aiSummary.forEach(r=>{
    if(!bySub[r.Subcategory]) bySub[r.Subcategory]={buys:0,sells:0,st:[],tr:[]};
    bySub[r.Subcategory].buys+=(r.Buys_LatestMo||0);
    bySub[r.Subcategory].sells+=(r.Sells_LatestMo||0);
    if(r.SellThrough_Pct!==null) bySub[r.Subcategory].st.push(r.SellThrough_Pct);
    if(r.TurnRate!==null) bySub[r.Subcategory].tr.push(r.TurnRate);
  });

  const subs=Object.keys(bySub).sort((a,b)=>bySub[b].sells-bySub[a].sells).slice(0,12);
  const shortLabels=subs.map(s=>s.replace('Accessories ','').replace('Womens ','W.').replace('Mens ','M.').substring(0,14));

  // Buys vs Sells chart
  destroyChart('buySell');
  charts['buySell']=new Chart(document.getElementById('buySellChart'),{
    type:'bar',
    data:{
      labels:shortLabels,
      datasets:[
        {label:'Buys',data:subs.map(s=>bySub[s].buys),backgroundColor:'rgba(59,130,246,0.7)',borderColor:'#3b82f6',borderWidth:1},
        {label:'Sells',data:subs.map(s=>bySub[s].sells),backgroundColor:'rgba(34,197,94,0.7)',borderColor:'#22c55e',borderWidth:1},
      ]
    },
    options:{...chartDefaults,responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:'#888',font:{family:'JetBrains Mono',size:10}}}}}
  });

  // Sell-through chart
  const stData=subs.map(s=>bySub[s].st.length?(bySub[s].st.reduce((a,b)=>a+b)/bySub[s].st.length).toFixed(1):0);
  const stColors=stData.map(v=>v>=10?'rgba(34,197,94,0.7)':v<3?'rgba(204,31,31,0.7)':'rgba(249,115,22,0.7)');
  destroyChart('stChart');
  charts['stChart']=new Chart(document.getElementById('stChart'),{
    type:'bar',
    data:{labels:shortLabels,datasets:[{label:'Sell-Through %',data:stData,backgroundColor:stColors,borderWidth:0}]},
    options:{...chartDefaults,responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}}}
  });

  // Trend chart - monthly buys and sells totals
  const monthlyBuys=months.map(m=>{
    const recs=factRecords.filter(r=>r.Month===m);
    return recs.reduce((s,r)=>s+(r.Detail_Sells||0),0);
  });
  const monthlySells=months.map(m=>{
    const recs=factRecords.filter(r=>r.Month===m);
    return recs.reduce((s,r)=>s+(r.Detail_Buys||0),0);
  });

  destroyChart('trend');
  charts['trend']=new Chart(document.getElementById('trendChart'),{
    type:'line',
    data:{
      labels:months,
      datasets:[
        {label:'Total Buys',data:monthlyBuys,borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,0.1)',tension:0.3,fill:true},
        {label:'Total Sells',data:monthlySells,borderColor:'#22c55e',backgroundColor:'rgba(34,197,94,0.1)',tension:0.3,fill:true},
      ]
    },
    options:{...chartDefaults,responsive:true,maintainAspectRatio:false}
  });

  // Table
  const tbody=document.getElementById('bbTableBody');
  tbody.innerHTML='';
  aiSummary.sort((a,b)=>(b.Sells_LatestMo||0)-(a.Sells_LatestMo||0)).forEach(r=>{
    const flagClass={
      'Strong Turner':'strong','High Sell-Through':'high',
      'Low Sell-Through':'low','Normal':'normal','No Data':'nodata'
    }[r.Flag]||'normal';
    tbody.innerHTML+=`<tr>
      <td style="color:var(--gray);font-size:11px">${r.Subcategory}</td>
      <td>${r.Detail}</td>
      <td style="color:var(--blue)">${r.Buys_LatestMo??'--'}</td>
      <td style="color:var(--green)">${r.Sells_LatestMo??'--'}</td>
      <td>${r.OnHand_EOM??'--'}</td>
      <td>${r.SellThrough_Pct!=null?r.SellThrough_Pct+'%':'--'}</td>
      <td>${r.TurnRate??'--'}</td>
      <td><span class="flag ${flagClass}">${r.Flag}</span></td>
    </tr>`;
  });
}

// ── AGING DASHBOARD ──────────────────────────────────────────────────────────
function buildAging(aiSummary,factRecords,months){
  document.getElementById('ag-empty').style.display='none';
  document.getElementById('ag-content').style.display='block';

  // Estimate aging by turn rate
  // Turn rate >= 2 = fresh, 1-2 = ok, 0.5-1 = aging, <0.5 = dead
  const fresh=aiSummary.filter(r=>r.TurnRate!==null&&r.TurnRate>=2).length;
  const aging=aiSummary.filter(r=>r.TurnRate!==null&&r.TurnRate>=1&&r.TurnRate<2).length;
  const old=aiSummary.filter(r=>r.TurnRate!==null&&r.TurnRate>=0.5&&r.TurnRate<1).length;
  const dead=aiSummary.filter(r=>r.TurnRate!==null&&r.TurnRate<0.5).length;
  const total=aiSummary.filter(r=>r.TurnRate!==null).length||1;

  document.getElementById('ag-fresh').textContent=Math.round(fresh/total*100)+'%';
  document.getElementById('ag-aging').textContent=Math.round(aging/total*100)+'%';
  document.getElementById('ag-old').textContent=Math.round(old/total*100)+'%';
  document.getElementById('ag-dead').textContent=Math.round(dead/total*100)+'%';

  // Donut
  destroyChart('agingDonut');
  charts['agingDonut']=new Chart(document.getElementById('agingDonut'),{
    type:'doughnut',
    data:{
      labels:['Fresh (Turn ≥2)','Normal (1-2)','Aging (0.5-1)','Dead (<0.5)'],
      datasets:[{data:[fresh,aging,old,dead],backgroundColor:['#22c55e','#3b82f6','#f97316','#cc1f1f'],borderWidth:0,hoverOffset:4}]
    },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#888',font:{family:'JetBrains Mono',size:10},padding:12}}}}
  });

  // Ghost inventory - low ST + high on hand
  const ghosts=aiSummary.filter(r=>(r.SellThrough_Pct!==null&&r.SellThrough_Pct<3)&&(r.OnHand_EOM!==null&&r.OnHand_EOM>50))
    .sort((a,b)=>b.OnHand_EOM-a.OnHand_EOM);
  const ghostPct=Math.round(ghosts.length/aiSummary.length*100);
  document.getElementById('ag-ghostPct').textContent=ghostPct+'%';
  document.getElementById('ag-ghostCount').textContent=ghosts.length+' categories';

  const ghostList=document.getElementById('ghostList');
  ghostList.innerHTML='';
  ghosts.slice(0,8).forEach(r=>{
    ghostList.innerHTML+=`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:12px;flex:1">${r.Detail}</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--red);margin-left:12px">${r.OnHand_EOM} on hand</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:10px;color:var(--gray);margin-left:12px">${r.SellThrough_Pct}% ST</span>
    </div>`;
  });

  // Inventory trend - top 6 subcategories by on-hand
  const topSubs=[...new Set(aiSummary.sort((a,b)=>(b.OnHand_EOM||0)-(a.OnHand_EOM||0)).map(r=>r.Subcategory))].slice(0,6);
  const colors=['#cc1f1f','#3b82f6','#22c55e','#f59e0b','#f97316','#8b5cf6'];

  const datasets=topSubs.map((sub,i)=>{
    const data=months.map(m=>{
      const rec=factRecords.find(r=>r.Subcategory===sub&&r.Month===m);
      return rec?rec.SubCat_EOM:null;
    });
    return{label:sub.replace('Accessories ','').replace('Womens ','W. ').replace('Mens ','M. '),data,borderColor:colors[i],backgroundColor:'transparent',tension:0.3,pointRadius:2};
  });

  destroyChart('invTrend');
  charts['invTrend']=new Chart(document.getElementById('invTrendChart'),{
    type:'line',
    data:{labels:months,datasets},
    options:{...chartDefaults,responsive:true,maintainAspectRatio:false}
  });
}

// ── EVENT READINESS DASHBOARD ────────────────────────────────────────────────
function buildEventReadiness(aiSummary){
  document.getElementById('ev-empty').style.display='none';
  document.getElementById('ev-content').style.display='block';

  // Readiness score: turn rate * sell-through weighted
  const scored=aiSummary.map(r=>{
    const tr=r.TurnRate||0;
    const st=r.SellThrough_Pct||0;
    const onHand=r.OnHand_EOM||0;
    const score=Math.min(100,Math.round((tr*30)+(st*3)+(onHand>50?20:onHand>20?10:0)));
    let status='Not Ready';
    if(score>=60)status='Ready';
    else if(score>=35)status='Caution';
    return{...r,readinessScore:score,status};
  }).sort((a,b)=>b.readinessScore-a.readinessScore);

  const ready=scored.filter(r=>r.status==='Ready').length;
  const caution=scored.filter(r=>r.status==='Caution').length;
  const notReady=scored.filter(r=>r.status==='Not Ready').length;

  document.getElementById('ev-ready').textContent=ready;
  document.getElementById('ev-caution').textContent=caution;
  document.getElementById('ev-notready').textContent=notReady;

  // Readiness bars
  const list=document.getElementById('readinessList');
  list.innerHTML='';
  scored.slice(0,20).forEach(r=>{
    const color=r.status==='Ready'?'var(--green)':r.status==='Caution'?'var(--yellow)':'var(--red)';
    list.innerHTML+=`<div class="readiness-row">
      <div class="readiness-name" title="${r.Detail}">${r.Detail}</div>
      <div class="readiness-bar-wrap">
        <div class="readiness-bar" style="width:${r.readinessScore}%;background:${color}">
          <span class="readiness-bar-val">${r.readinessScore}</span>
        </div>
      </div>
      <div class="readiness-status" style="color:${color}">${r.status}</div>
    </div>`;
  });

  // Top 10 ready chart
  const top10=scored.filter(r=>r.status==='Ready').slice(0,10);
  destroyChart('evReady');
  charts['evReady']=new Chart(document.getElementById('evReadyChart'),{
    type:'bar',
    data:{
      labels:top10.map(r=>r.Detail.substring(0,16)),
      datasets:[{label:'Readiness Score',data:top10.map(r=>r.readinessScore),backgroundColor:'rgba(34,197,94,0.7)',borderColor:'#22c55e',borderWidth:1}]
    },
    options:{...chartDefaults,responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}}}
  });

  // Buy plan table
  const tbody=document.getElementById('evBuyBody');
  tbody.innerHTML='';
  scored.slice(0,15).forEach(r=>{
    let rec='Hold';
    if(r.status==='Ready'&&(r.TurnRate||0)>=1)rec='Buy More';
    else if(r.status==='Caution')rec='Monitor';
    else if(r.status==='Not Ready')rec='Stop Buying';
    const recColor=rec==='Buy More'?'var(--green)':rec==='Stop Buying'?'var(--red)':rec==='Monitor'?'var(--yellow)':'var(--gray)';
    tbody.innerHTML+=`<tr>
      <td style="font-size:11px">${r.Detail}</td>
      <td>${r.OnHand_EOM??'--'}</td>
      <td>${r.TurnRate??'--'}</td>
      <td style="color:var(--green)">${r.Total3Mo_Sells??'--'}</td>
      <td style="color:${recColor};font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:600">${rec}</td>
    </tr>`;
  });
}

// ── DOWNLOADS ────────────────────────────────────────────────────────────────
function dlCSV(data,fname){
  if(!data?.length)return;
  const h=Object.keys(data[0]).join(',');
  const rows=data.map(r=>Object.values(r).map(v=>{
    if(v===null||v===undefined)return'';
    const s=String(v);return s.includes(',')?`"${s}"`:s;
  }).join(','));
  const blob=new Blob([[h,...rows].join('\n')],{type:'text/csv'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=fname;a.click();
}
function downloadFact(){dlCSV(factTableData,'fact_table_clean.csv');}
function downloadAI(){dlCSV(aiSummaryData,'ai_summary_table.csv');}
