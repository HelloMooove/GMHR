import Airtable from 'airtable';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

const doughnutTextPlugin = {
  id: 'doughnutText',
  afterDraw(chart, args, options) {
    if (chart.config.type === 'doughnut') {
      const { ctx } = chart;
      const meta = chart.getDatasetMeta(0);
      const total = meta.total;
      if (!total) return;

      ctx.save();
      ctx.font = 'bold 12px Segoe UI, sans-serif';
      ctx.fillStyle = 'white';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      meta.data.forEach((element, index) => {
        const val = chart.config.data.datasets[0].data[index];
        if (!val || val === 0) return;
        const pct = Math.round((val / total) * 100) + '%';
        const { x, y } = element.tooltipPosition();
        ctx.fillText(pct, x, y);
      });
      ctx.restore();
    }
  }
};
Chart.register(doughnutTextPlugin);

// Config
const PAT = 'patzTw53nHhBhl0ct.e65ace286c3752d1a4077dfce1944ec64207b4587b8f8a5b00feb2a3166ade71';
const BASE_ID = 'app7ZuPZvg2zgpYJO';
const TABLE_NAME = 'AI Business Diagnostic Leads';

Airtable.configure({
    endpointUrl: 'https://api.airtable.com',
    apiKey: PAT
});
const base = Airtable.base(BASE_ID);

// Constants & Colors
const T='#3d7a6e', TL='#5da090', TP='#9ecfc6', TX='#cde8e4', AM='#c9a227', RD='#c0392b', GR='#1a6b5a';
const tc = { font: { size: 10 }, color: '#999' };
const gs = { color: 'rgba(0,0,0,0.05)' };

// Chart Helpers
function hb(mx) {
  return {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { 
      x: { min: 0, max: mx, grid: gs, ticks: Object.assign({ stepSize: 1 }, tc) }, 
      y: { grid: { display: false }, ticks: Object.assign({ autoSkip: false }, tc) } 
    }
  };
}
const dn = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, cutout: '62%' };

let chartInstances = {};

function renderChart(id, config) {
  if (chartInstances[id]) { chartInstances[id].destroy(); }
  const ctx = document.getElementById(id);
  if (ctx) { 
    ctx.parentElement.style.flex = "1";
    ctx.parentElement.style.minHeight = "165px";
    if (config.type === 'bar' && config.options && config.options.indexAxis === 'y') {
       const labelCount = config.data.labels.length;
       ctx.parentElement.style.minHeight = Math.max(165, labelCount * 22) + 'px';
    }
    chartInstances[id] = new Chart(ctx, config); 
  }
}

let appData = {
  respondents: [],
  scores: [],
  scoreRange: { min: 0, max: 0 },
  avgScore: 0,
  tiers: { ignition: 0, momentum: 0, mastery: 0 },
  dominantTier: '',
  losingTimeCount: 0,
  stats: {
    size: {}, role: {}, press: {}, time: {}, ai: {}, diff: {}, wow: {}, imp: {}, ind: {}
  }
};

// Main Init
async function init() {
  document.getElementById('hdr-meta').innerText = 'Fetching data from Airtable...';
  try {
    const records = await base(TABLE_NAME).select().all();
    processData(records);
    updateDashboardUI();
    console.log("Successfully rendered dashboard with data");
  } catch (error) {
    console.error("Error fetching Airtable raw data", error);
    document.getElementById('hdr-meta').innerText = 'Error loading data. Check console.';
  }
}

function normalizeStr(str) {
  return str ? String(str).trim() : '';
}

function processData(records) {
  appData.respondents = records.map(r => r.fields);
  let totalScore = 0;
  appData.losingTimeCount = 0;
  
  appData.respondents.forEach(f => {
    let score = 0;
    
    // Safety generic getters (Airtable fields might vary in exact case/spacing)
    const getField = (keywords) => {
      let key = Object.keys(f).find(k => keywords.some(kw => k.toLowerCase().includes(kw)));
      return key ? f[key] : null;
    };

    let size = normalizeStr(getField(['company size', 'size', '1.2']));
    let role = normalizeStr(getField(['role', 'current role', '1.3']));
    let loss = getField(['lose time', 'lost', '3.2']) || [];
    if (!Array.isArray(loss) && loss) loss = [loss];
    let wow = normalizeStr(getField(['way of working', '4.1', 'working']));
    let imp = normalizeStr(getField(['impact', '4.2', 'measurement']));
    let aiu = normalizeStr(getField(['ai usage', '5.1', 'usage level']));
    let diff = normalizeStr(getField(['difficulty', '5.3', 'main ai difficulty']));
    let pressRaw = getField(['business pressures', '2.1', 'pressures']) || [];
    if (!Array.isArray(pressRaw)) pressRaw = [pressRaw];
    let press = [];
    pressRaw.forEach(p => {
      if (typeof p === 'string') {
        press.push(...p.split(',').map(s => s.trim()).filter(s => s));
      } else if (p) {
        press.push(p);
      }
    });
    let ind = normalizeStr(getField(['industry']));

    // Scoring Engine
    if (size.includes('1-50') || size.includes('1–50')) score += 1;
    else if (size.includes('50-200') || size.includes('50–200')) score += 3;
    else if (size.includes('200-500') || size.includes('200–500')) score += 5;
    else if (size.includes('500+')) score += 8;

    if (role.toLowerCase().includes('ceo') || role.toLowerCase().includes('founder') || role.toLowerCase().includes('director') || role.toLowerCase().includes('head of')) score += 10;
    else if (role.toLowerCase().includes('hr') || role.toLowerCase().includes('l&d')) score += 5;
    else if (role.toLowerCase().includes('operational')) score += 2;
    else if (role) score += 1;

    let lossStr = loss.join(" ").toLowerCase();
    if(loss.length > 0) appData.losingTimeCount++;
    if (lossStr.includes('decision')) score += 10;
    if (lossStr.includes('reporting') || lossStr.includes('admin')) score += 8;
    if (lossStr.includes('search')) score += 8;
    if (lossStr.includes('recruit')) score += 5;
    if (lossStr.includes('train') || lossStr.includes('upskill')) score += 5;
    if (lossStr.includes('team')) score += 3;
    else if (lossStr.includes('content') || lossStr.includes('other')) score += 1;

    let wowL = wow.toLowerCase();
    if (wowL.includes('kpi')) score += 10;
    else if (wowL.includes('not measured')) score += 5;
    else if (wowL.includes('some tools') || wowL.includes('unstructured')) score += 3;
    else if (wowL.includes('intuition')) score += 1;

    let impL = imp.toLowerCase();
    if (impL.includes('yes')) score += 10;
    else if (impL.includes('partial')) score += 5;
    else if (impL.includes('no')) score += 1;

    let aiuL = aiu.toLowerCase();
    if (aiuL.includes('yes') || aiuL.includes('regular')) score += 10;
    else if (aiuL.includes('occasion')) score += 5;
    else if (aiuL.includes('not yet')) score += 1;

    appData.scores.push(score);
    totalScore += score;

    if(score < 20) appData.tiers.ignition++;
    else if(score < 40) appData.tiers.momentum++;
    else appData.tiers.mastery++;

    // Aggregate Stats
    appData.stats.size[size] = (appData.stats.size[size] || 0) + 1;
    appData.stats.role[role] = (appData.stats.role[role] || 0) + 1;
    loss.forEach(l => { appData.stats.time[l] = (appData.stats.time[l] || 0) + 1; });
    appData.stats.ai[aiu] = (appData.stats.ai[aiu] || 0) + 1;
    appData.stats.diff[diff] = (appData.stats.diff[diff] || 0) + 1;
    appData.stats.wow[wow] = (appData.stats.wow[wow] || 0) + 1;
    appData.stats.imp[imp] = (appData.stats.imp[imp] || 0) + 1;
    appData.stats.ind[ind] = (appData.stats.ind[ind] || 0) + 1;
    press.forEach(p => { appData.stats.press[p] = (appData.stats.press[p] || 0) + 1; });
  });

  const count = appData.scores.length;
  appData.avgScore = count ? (totalScore / count).toFixed(1) : 0;
  if (count) {
    appData.scoreRange.min = Math.min(...appData.scores);
    appData.scoreRange.max = Math.max(...appData.scores);
  }

  appData.dominantTier = 'Ignition';
  if(appData.tiers.momentum > appData.tiers.ignition && appData.tiers.momentum >= appData.tiers.mastery) appData.dominantTier = 'Momentum';
  if(appData.tiers.mastery > appData.tiers.momentum && appData.tiers.mastery > appData.tiers.ignition) appData.dominantTier = 'Mastery';
}

function updateDashboardUI() {
  const count = appData.respondents.length;
  
  // Update header meta
  let dateStamp = new Date().toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
  document.getElementById('hdr-meta').innerText = `${count} respondents · Session: ${dateStamp} · Score range: ${appData.scoreRange.min} – ${appData.scoreRange.max}`;

  // Update KPIs
  document.getElementById('kpi-total').innerText = count;
  document.getElementById('kpi-avg').innerText = appData.avgScore;
  document.getElementById('kpi-range').innerText = `Range: ${appData.scoreRange.min} – ${appData.scoreRange.max}`;

  let tierFormat = { 'Ignition': '🔥 Ignition', 'Momentum': '⚙️ Momentum', 'Mastery': '🚀 Mastery' };
  let domTierColor = { 'Ignition': '#f9eaea', 'Momentum': '#fdf3d7', 'Mastery': '#e5f3f0' };
  let domTierText = { 'Ignition': '#c0392b', 'Momentum': '#7a5e00', 'Mastery': '#1a6b5a' };

  let maxTierCount = Math.max(appData.tiers.ignition, appData.tiers.momentum, appData.tiers.mastery);
  document.getElementById('kpi-tier').innerHTML = `<span class="badge-mo" style="background:${domTierColor[appData.dominantTier]};color:${domTierText[appData.dominantTier]}">${tierFormat[appData.dominantTier]}</span>`;
  document.getElementById('kpi-tier-sub').innerText = `${maxTierCount} / ${count} respondents`;

  let pctLost = count ? Math.round((appData.losingTimeCount / count) * 100) : 0;
  document.getElementById('kpi-loss').innerText = `${pctLost}%`;
  document.getElementById('kpi-loss-sub').innerText = `${appData.losingTimeCount} of ${count} answered Yes`;

  generateInsightBot();

  renderAllCharts();
}


function generateInsightBot() {
  // Rule-based synthesis. Frames the cohort's AI readiness for Mauritius
  // businesses in line with the maturity score (Ignition / Momentum / Mastery).
  // Tool-agnostic on purpose — recommendations are strategic, not prescriptive.
  let sortedDiffs = Object.entries(appData.stats.diff).sort((a,b) => b[1]-a[1]);
  let topDiff = sortedDiffs.length ? sortedDiffs[0][0] : 'General Adoption';
  if(!topDiff || topDiff==='undefined') topDiff = "Not knowing where to start";

  let sortedTime = Object.entries(appData.stats.time).sort((a,b) => b[1]-a[1]);
  let topTimeLoss = sortedTime.length ? sortedTime[0][0] : 'admin tasks';
  if(!topTimeLoss || topTimeLoss==='undefined') topTimeLoss = "reporting / admin";

  const tier = appData.dominantTier;

  let readiness = '';
  let recommendation = '';

  if (tier === 'Ignition') {
    readiness = `Most Mauritius businesses in this cohort sit at the <strong>early stage</strong> of AI readiness — operating largely on intuition, with little or no structured AI practice in place. Time is still lost on "${topTimeLoss}".`;
    recommendation = `start by building AI literacy across leadership and teams, identify two or three high-friction processes worth automating, and put basic data and security hygiene in place before scaling.`;
  } else if (tier === 'Momentum') {
    readiness = `The cohort is at the <strong>building stage</strong> of AI readiness — first use cases are live but value is uneven, and processes remain bottlenecked by "${topTimeLoss}".`;
    recommendation = `connect isolated initiatives into a single AI roadmap, define ownership for each priority, and turn ad-hoc wins into repeatable workflows that the whole team can rely on.`;
  } else { // Mastery
    readiness = `The cohort is at the <strong>advanced stage</strong> of AI readiness — AI is part of how the business runs, with measurable gains and a structured approach to operations.`;
    recommendation = `shift the focus to scaling impact across the whole organisation, hardening governance and data quality, and turning AI capability into a competitive advantage on the Mauritius market.`;
  }

  let sentences = [
    readiness,
    `The most cited block to progress is "${topDiff}".`,
    `<strong>Architect Recommendation:</strong> ${recommendation}`
  ];
  document.getElementById('insight-bot-text').innerHTML = sentences.join(" ");
}

// Chart Render Orchestrator
function getObjArr(obj) {
  let cleaned = {};
  for(let k in obj) { if(k && k!=='undefined' && k.trim() !== '') cleaned[k] = obj[k]; }
  let entries = Object.entries(cleaned).sort((a,b) => b[1]-a[1]);
  return { labels: entries.map(e=>e[0]), data: entries.map(e=>e[1]) };
}

function renderAllCharts() {
  // Tier distribution
  let tierMax = Math.max(appData.tiers.ignition, appData.tiers.momentum, appData.tiers.mastery) + 1;
  renderChart('c_score', { 
    type:'bar', data: { labels: ['Ignition (<20)', 'Momentum (20–39)', 'Mastery (≥40)'], datasets: [{ data: [appData.tiers.ignition, appData.tiers.momentum, appData.tiers.mastery], backgroundColor: [RD,AM,GR], borderRadius: 4 }] }, 
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: tc }, y: { min: 0, max: tierMax<5?5:tierMax, grid: gs, ticks: Object.assign({ stepSize: 1 }, tc) } } } 
  });

  let timeD = getObjArr(appData.stats.time);
  let timeMax = Math.max(...(timeD.data.length ? timeD.data : [1])) + 1;
  renderChart('c_time', { type:'bar', data: { labels: timeD.labels, datasets: [{ data: timeD.data, backgroundColor: TL, borderRadius: 3 }] }, options: hb(timeMax) });

  let sizeD = getObjArr(appData.stats.size);
  const sizeColors = [T, TL, TP, TX];
  renderChart('c_size', { type:'doughnut', data: { labels: sizeD.labels, datasets: [{ data: sizeD.data, backgroundColor: sizeColors, borderWidth: 0 }] }, options: dn });
  const lSize = document.getElementById('l_size');
  if (lSize) {
    lSize.innerHTML = sizeD.labels.map((lbl, i) => `<span class="li"><span class="ld" style="background:${sizeColors[i % sizeColors.length]}"></span>${lbl} (${sizeD.data[i]})</span>`).join('');
  }

  let roleD = getObjArr(appData.stats.role);
  let roleMax = Math.max(...(roleD.data.length ? roleD.data : [1])) + 1;
  renderChart('c_role', { type:'bar', data: { labels: roleD.labels, datasets: [{ data: roleD.data, backgroundColor: [T,TL,TP,TX], borderRadius: 3 }] }, options: hb(roleMax) });

  // Page 1 deep dive triggers
  window.buildDeep = function() {
    let wowD = getObjArr(appData.stats.wow);
    renderChart('c_wow', { type:'bar', data: { labels: wowD.labels, datasets: [{ data: wowD.data, backgroundColor: TL, borderRadius: 3 }] }, options: hb(Math.max(...(wowD.data.length?wowD.data:[1]))+1) });

    let indD = getObjArr(appData.stats.ind);
    renderChart('c_ind', { type:'bar', data: { labels: indD.labels, datasets: [{ data: indD.data, backgroundColor: T, borderRadius: 3 }] }, options: hb(Math.max(...(indD.data.length?indD.data:[1]))+1) });

    let aiD = getObjArr(appData.stats.ai);
    renderChart('c_ai', { type:'doughnut', data: { labels: aiD.labels, datasets: [{ data: aiD.data, backgroundColor: [GR,AM,RD], borderWidth: 0 }] }, options: dn });

    let diffD = getObjArr(appData.stats.diff);
    renderChart('c_diff', { type:'bar', data: { labels: diffD.labels, datasets: [{ data: diffD.data, backgroundColor: T, borderRadius: 3 }] }, options: hb(Math.max(...(diffD.data.length?diffD.data:[1]))+1) });

    let pressD = getObjArr(appData.stats.press);
    renderChart('c_press', { type:'bar', data: { labels: pressD.labels, datasets: [{ data: pressD.data, backgroundColor: T, borderRadius: 3 }] }, options: hb(Math.max(...(pressD.data.length?pressD.data:[1]))+1) });

    let impD = getObjArr(appData.stats.imp);
    renderChart('c_imp', { type:'doughnut', data: { labels: impD.labels, datasets: [{ data: impD.data, backgroundColor: [GR,AM,RD], borderWidth: 0 }] }, options: dn });
  };

  window.buildScoring = function() {
    let tierMax = Math.max(appData.tiers.ignition, appData.tiers.momentum, appData.tiers.mastery) + 1;
    renderChart('c_tier', { 
      type:'bar', data: { labels: ['Ignition (<20)', 'Momentum (20–39)', 'Mastery (≥40)'], datasets: [{ data: [appData.tiers.ignition, appData.tiers.momentum, appData.tiers.mastery], backgroundColor: [RD,AM,GR], borderRadius: 4 }] }, 
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: tc }, y: { min: 0, max: tierMax<5?5:tierMax, grid: gs, ticks: Object.assign({ stepSize: 1 }, tc) } } } 
    });
  };

  // If already initialized some tabs, trigger their render updates immediately.
  if(window.d1) window.buildDeep();
  if(window.d2) window.buildScoring();
}

window.d1 = false;
window.d2 = false;

// Tab Routing
document.querySelectorAll('.tab').forEach((t, i) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
    t.classList.add('active');
    document.getElementById(`pg${i}`).classList.add('active');
    if(i===1 && !window.d1) { window.buildDeep(); window.d1 = true; }
    if(i===2 && !window.d2) { window.buildScoring(); window.d2 = true; }
  });
});

init();
