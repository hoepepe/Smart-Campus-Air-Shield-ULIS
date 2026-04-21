/* ═══════════════════════════════════════════════════════════
   SMART CAMPUS AIR SHIELD – app.js
   2 cảm biến PMS7003: Sân trường ULIS + Không gian mở
   Mock data sẵn → nối API ESP32/Firebase sau
═══════════════════════════════════════════════════════════ */

/* ── 1. AQI HELPER ── */
const AQI = {
  // PM2.5 → AQI theo US EPA
  fromPM25(pm) {
    const bp = [
      [0,    12,   0,   50],
      [12.1, 35.4, 51,  100],
      [35.5, 55.4, 101, 150],
      [55.5, 150.4,151, 200],
      [150.5,250.4,201, 300],
      [250.5,500,  301, 500],
    ];
    for (const [lo,hi,ilo,ihi] of bp) {
      if (pm <= hi) return Math.round(((ihi-ilo)/(hi-lo))*(pm-lo)+ilo);
    }
    return 500;
  },

  level(pm25) {
    if (pm25 <= 12)    return {key:'good',    label:'Tốt',            color:'#22c55e', bg:'rgba(34,197,94,.12)',  border:'rgba(34,197,94,.25)'};
    if (pm25 <= 35.4)  return {key:'moderate',label:'Trung bình',     color:'#f59e0b', bg:'rgba(245,158,11,.12)', border:'rgba(245,158,11,.25)'};
    if (pm25 <= 55.4)  return {key:'sensitive',label:'Nhóm nhạy cảm', color:'#f97316', bg:'rgba(249,115,22,.12)', border:'rgba(249,115,22,.25)'};
    if (pm25 <= 150.4) return {key:'unhealthy',label:'Kém',           color:'#f43f5e', bg:'rgba(244,63,94,.12)',  border:'rgba(244,63,94,.25)'};
    if (pm25 <= 250.4) return {key:'very',     label:'Rất xấu',       color:'#a78bfa', bg:'rgba(167,139,250,.12)',border:'rgba(167,139,250,.25)'};
    return               {key:'hazardous',label:'Nguy hiểm',      color:'#e11d48', bg:'rgba(225,29,72,.12)',  border:'rgba(225,29,72,.25)'};
  },

  tips(key) {
    return {
      good:     ['Không khí trong lành, thoải mái ra ngoài','Hoạt động thể chất ngoài trời bình thường','Trẻ em vui chơi ngoài trời an toàn'],
      moderate: ['Nhóm nhạy cảm hạn chế hoạt động ngoài lâu','Mở cửa thông gió ngắn, uống đủ nước','Theo dõi nếu cảm thấy kích ứng mắt mũi'],
      sensitive:['Trẻ em, người cao tuổi ở trong nhà','Đeo khẩu trang khi ra ngoài','Bật máy lọc không khí trong phòng','Đóng cửa sổ nếu có thể'],
      unhealthy:['Đeo khẩu trang N95 khi ra ngoài','Hạn chế tối đa hoạt động ngoài trời','Đóng tất cả cửa sổ, bật lọc không khí'],
      very:     ['Ở trong nhà toàn bộ thời gian','Đeo khẩu trang N95 ngay cả trong nhà','Liên hệ y tế nếu có triệu chứng hô hấp'],
      hazardous:['KHÔNG ra ngoài – Tình trạng khẩn cấp','Bịt kín cửa và khe hở','Gọi 115 nếu khó thở'],
    }[key] || [];
  }
};

/* ── 2. MOCK DATA ── */
// Hàm sinh dữ liệu lịch sử thực tế cho 2 node
function genHistory(hours, basePM25, variance, peaks) {
  return Array.from({length: hours}, (_, i) => {
    let v = basePM25 + (Math.random() - 0.45) * variance;
    // Rush hour peaks (7–8h, 17–18h)
    const h = i % 24;
    if (h >= 7 && h <= 9)   v += peaks * 0.7;
    if (h >= 17 && h <= 19) v += peaks * 0.5;
    if (h >= 2  && h <= 5)  v -= peaks * 0.3;
    return Math.max(2, Math.round(v * 10) / 10);
  });
}

const now = new Date();
const H24 = 24;

// Dữ liệu 24h cho 2 node
const historyOutdoor = genHistory(H24, 38, 20, 30);   // Sân trường – ngoài trời, cao hơn
const historyIndoor  = genHistory(H24, 22, 15, 18);   // Không gian mở (hành lang, sảnh)

// Current readings (lấy giờ cuối + jitter nhỏ)
function currentReading(hist) {
  const pm25 = hist[hist.length - 1];
  const pm1  = Math.round(pm25 * 0.65 * 10) / 10;
  const pm10 = Math.round(pm25 * 1.6  * 10) / 10;
  return {
    pm1, pm25, pm10,
    particles_03: Math.round(1500 + pm25 * 40 + Math.random() * 300),
    particles_05: Math.round(400  + pm25 * 12 + Math.random() * 80),
    particles_1:  Math.round(pm25 * 6 + Math.random() * 30),
    particles_25: Math.round(pm25 * 0.8),
    temp: 28 + Math.round(Math.random() * 5),
    humidity: 65 + Math.round(Math.random() * 20),
  };
}

const SENSORS = [
  {
    id: 'node-a',
    name: 'Sân trường ULIS',
    location: 'Khuôn viên ngoài trời – Cổng chính Trường ĐH Ngoại ngữ, ĐHQGHN',
    type: 'outdoor',
    icon: '🌳',
    accentColor: '#00e5c8',
    dimColor: 'rgba(0,229,200,.12)',
    nodeClass: 'node-a',
    online: true,
    lastUpdate: 'vừa xong',
    battery: null,
    power: 'Nguồn điện cố định 5V',
    hw: ['PMS7003','ESP32-WROOM','WiFi 2.4GHz','Hộp IP54 ngoài trời'],
    history: historyOutdoor,
    reading: currentReading(historyOutdoor),
  },
  {
    id: 'node-b',
    name: 'Không gian mở',
    location: 'Hành lang tầng 1 – Tòa nhà A · Trường ĐH Ngoại ngữ',
    type: 'semi-outdoor',
    icon: '🏛',
    accentColor: '#a78bfa',
    dimColor: 'rgba(167,139,250,.12)',
    nodeClass: 'node-b',
    online: true,
    lastUpdate: '12 giây trước',
    battery: null,
    power: 'USB 5V từ ổ cắm hành lang',
    hw: ['PMS7003','Arduino Nano + ESP-01','UART Bridge','Vỏ nhựa ABS'],
    history: historyIndoor,
    reading: currentReading(historyIndoor),
  },
];

/* ── 3. NAVIGATION ── */
function navigate(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.getElementById('screen-' + id).classList.add('active');
  document.querySelector(`[data-screen="${id}"]`).classList.add('active');

  // lazy init screens
  if (id === 'history'  && !window._histInited)  { initHistory(); window._histInited = true; }
  if (id === 'ai'       && !window._aiInited)     { initAI();      window._aiInited = true; }
  if (id === 'alerts'   && !window._alertsInited) { initAlerts();  window._alertsInited = true; }
  if (id === 'about'    && !window._aboutInited)  { initAbout();   window._aboutInited = true; }
  if (id === 'sensors'  && !window._sensorsInited){ initSensors(); window._sensorsInited = true; }
}
function bindNavLinks() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const screen = link.dataset.screen;
      if (screen) navigate(screen);
    });
  });
}
/* ── 4. DASHBOARD ── */
function initDashboard() {
  renderHeroCards();
  updateMetricsRow();
  renderMiniChart();
  updateAIInsight();
}

function renderHeroCards() {
  const grid = document.getElementById('hero-grid');
  grid.innerHTML = SENSORS.map(s => {
    const lv = AQI.level(s.reading.pm25);
    const aqi = AQI.fromPM25(s.reading.pm25);
    const barPct = Math.min(100, Math.round(s.reading.pm25 / 150 * 100));
    const sparkData = s.history.slice(-16);
    const sparkMax = Math.max(...sparkData, 1);

    return `
    <div class="sensor-hero ${s.nodeClass}">
      <div class="sh-top">
        <div>
          <div class="sh-node" style="color:${s.accentColor}">${s.icon} ${s.id.toUpperCase()} · ${s.type === 'outdoor' ? 'Ngoài trời' : 'Không gian mở'}</div>
          <div class="sh-name">${s.name}</div>
          <div class="sh-loc">${s.location}</div>
        </div>
        <div class="sh-status">
          <div class="sh-status-dot" style="background:${s.online ? '#22c55e' : '#f43f5e'}"></div>
          <span style="color:${s.online ? '#22c55e' : '#f43f5e'}">${s.online ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      <div class="sh-pm25-big">
        <div class="sh-pm25-val" style="color:${lv.color}">${s.reading.pm25}</div>
        <div class="sh-pm25-unit">µg/m³ · PM2.5</div>
        <span class="sh-pm25-label" style="background:${lv.bg};color:${lv.color};border:1px solid ${lv.border}">
          ${lv.label} · AQI ${aqi}
        </span>
      </div>

      <div class="sh-metrics">
        <div class="sh-metric">
          <div class="sh-metric-val" style="color:${s.accentColor}">${s.reading.pm1}</div>
          <div class="sh-metric-lbl">PM1.0</div>
        </div>
        <div class="sh-metric">
          <div class="sh-metric-val" style="color:${lv.color}">${s.reading.pm25}</div>
          <div class="sh-metric-lbl">PM2.5</div>
        </div>
        <div class="sh-metric">
          <div class="sh-metric-val" style="color:#7a95b0">${s.reading.pm10}</div>
          <div class="sh-metric-lbl">PM10</div>
        </div>
      </div>

      <div class="sh-bar-wrap">
        <div class="sh-bar-label">
          <span>PM2.5 so với ngưỡng kém (150 µg/m³)</span>
          <span style="color:${lv.color}">${barPct}%</span>
        </div>
        <div class="sh-bar-track">
          <div class="sh-bar-fill" style="width:${barPct}%;background:${lv.color}"></div>
        </div>
      </div>

      <div class="sh-sparkline">
        ${sparkData.map(v => {
          const h = Math.max(6, Math.round(v / sparkMax * 24));
          return `<div class="spark-b" style="height:${h}px;flex:1;background:${s.accentColor};opacity:.7"></div>`;
        }).join('')}
      </div>

      <div style="font-size:10px;color:#3d5a75;font-family:'DM Mono',sans-serif;margin-top:8px">
        Cập nhật: ${s.lastUpdate} · ${s.power}
      </div>
    </div>`;
  }).join('');
}

function updateMetricsRow() {
  const pm25vals = SENSORS.map(s => s.reading.pm25);
  const avgPM25 = Math.round((pm25vals[0] + pm25vals[1]) / 2 * 10) / 10;
  const avgAQI = AQI.fromPM25(avgPM25);
  const lv = AQI.level(avgPM25);
  const peakPM25 = Math.max(...SENSORS.flatMap(s => s.history));

  const aqiEl = document.getElementById('campus-aqi');
  aqiEl.textContent = avgAQI;
  aqiEl.style.color = lv.color;
  document.getElementById('campus-aqi-label').textContent = lv.label;
  document.getElementById('peak-pm25').textContent = peakPM25.toFixed(1);
  document.getElementById('peak-pm25').style.color = AQI.level(peakPM25).color;
}

let liveChart;
function renderMiniChart() {
  const labels = Array.from({length: 24}, (_, i) => {
    const h = (now.getHours() - 23 + i + 24) % 24;
    return i % 4 === 0 ? `${h}h` : '';
  });

  liveChart = new Chart(document.getElementById('liveChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Sân trường',
          data: historyOutdoor,
          borderColor: '#00e5c8',
          backgroundColor: 'rgba(0,229,200,.06)',
          fill: true, tension: .4, pointRadius: 0, borderWidth: 2,
        },
        {
          label: 'Không gian mở',
          data: historyIndoor,
          borderColor: '#a78bfa',
          backgroundColor: 'rgba(167,139,250,.06)',
          fill: true, tension: .4, pointRadius: 0, borderWidth: 2,
        },
        {
          label: 'Ngưỡng (35.4)',
          data: Array(24).fill(35.4),
          borderColor: 'rgba(245,158,11,.4)',
          borderDash: [4, 4], pointRadius: 0, fill: false, borderWidth: 1,
        },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#3d5a75', font: { size: 10, family: "'DM Mono'" } }, grid: { color: 'rgba(30,50,72,.8)' } },
        y: { min: 0, ticks: { color: '#3d5a75', font: { size: 10 } }, grid: { color: 'rgba(30,50,72,.8)' } }
      }
    }
  });

  // Pie chart
  const countLevels = (hist) => {
    const counts = {good:0,moderate:0,sensitive:0,unhealthy:0,very:0,hazardous:0};
    hist.forEach(v => counts[AQI.level(v).key]++);
    return counts;
  };
  const combined = [...historyOutdoor, ...historyIndoor];
  const counts = countLevels(combined);
  const levelConfig = [
    {key:'good',label:'Tốt',color:'#22c55e'},
    {key:'moderate',label:'Trung bình',color:'#f59e0b'},
    {key:'sensitive',label:'Nhóm nhạy cảm',color:'#f97316'},
    {key:'unhealthy',label:'Kém',color:'#f43f5e'},
    {key:'very',label:'Rất xấu',color:'#a78bfa'},
  ];
  const pieData = levelConfig.filter(l => counts[l.key] > 0);

  new Chart(document.getElementById('pieChart'), {
    type: 'doughnut',
    data: {
      labels: pieData.map(l => l.label),
      datasets: [{
        data: pieData.map(l => counts[l.key]),
        backgroundColor: pieData.map(l => l.color),
        borderWidth: 2, borderColor: '#0d1520',
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      cutout: '65%',
    }
  });

  document.getElementById('pie-legend').innerHTML = pieData.map(l =>
    `<span><i style="background:${l.color}"></i>${l.label} ${counts[l.key]}</span>`
  ).join('');
}

function updateAIInsight() {
  const pm25A = SENSORS[0].reading.pm25;
  const pm25B = SENSORS[1].reading.pm25;
  const higher = pm25A > pm25B ? 'Sân trường ULIS' : 'Không gian mở';
  const trend = historyOutdoor.slice(-3).every((v, i, a) => i === 0 || v > a[i-1]) ? 'đang tăng' : 'đang giảm';
  const insights = [
    `PM2.5 tại ${higher} cao hơn – xu hướng ${trend}. Dự báo đạt đỉnh trong 2–3 giờ tới nếu gió lặng. Khuyến nghị hạn chế hoạt động ngoài trời vào 7–9h sáng.`,
    `Chênh lệch PM2.5 giữa hai node: ${Math.abs(pm25A - pm25B).toFixed(1)} µg/m³. Mức độ khuếch tán bụi thấp, thời tiết ít gió. Dự báo chất lượng cải thiện sau 15h.`,
    `Hệ thống phát hiện pattern: ô nhiễm cao nhất vào 7–8h (giờ cao điểm). AQI trung bình khuôn viên hôm nay: ${AQI.fromPM25((pm25A+pm25B)/2)}.`,
  ];
  document.getElementById('ai-insight-text').textContent = insights[Math.floor(Math.random() * insights.length)];
}

/* ── 5. SENSOR DETAIL SCREEN ── */
function initSensors() {
  const grid = document.getElementById('sensor-detail-grid');
  grid.innerHTML = SENSORS.map((s, idx) => {
    const lv = AQI.level(s.reading.pm25);
    const tips = AQI.tips(lv.key);

    return `
    <div class="sensor-full-card">
      <div class="sfc-header">
        <div class="sfc-icon" style="background:${s.dimColor};font-size:22px">${s.icon}</div>
        <div>
          <div class="sfc-title" style="color:${s.accentColor}">${s.name}</div>
          <div class="sfc-sub">${s.location}</div>
        </div>
        <div class="sfc-badge" style="background:${lv.bg};color:${lv.color};border:1px solid ${lv.border}">
          ${lv.label} · AQI ${AQI.fromPM25(s.reading.pm25)}
        </div>
      </div>

      <div class="pm-grid">
        ${[
          ['PM1.0','Hạt siêu mịn ≤1µm\nXuyên vào máu',s.reading.pm1,50],
          ['PM2.5','Bụi mịn ≤2.5µm\nChỉ số vàng WHO',s.reading.pm25,150],
          ['PM10','Bụi thô ≤10µm\nKích ứng hô hấp trên',s.reading.pm10,200],
        ].map(([name, desc, val, max]) => {
          const l = AQI.level(name === 'PM2.5' ? val : val * (name === 'PM1.0' ? 1.5 : 0.6));
          return `
          <div class="pm-box">
            <div class="pm-box-name">${name}</div>
            <div class="pm-box-val" style="color:${l.color}">${val}</div>
            <div class="pm-box-unit">µg/m³</div>
            <div class="pm-explain" style="font-size:10px;margin-top:6px">${desc}</div>
            <div class="pm-box-bar">
              <div class="pm-box-bar-fill" style="width:${Math.min(100,Math.round(val/max*100))}%;background:${l.color}"></div>
            </div>
          </div>`;
        }).join('')}
      </div>

      <div class="particle-counts">
        <div class="pc-label">Số lượng hạt (particles/0.1L)</div>
        <div class="pc-grid">
          ${[
            ['≥0.3µm', s.reading.particles_03],
            ['≥0.5µm', s.reading.particles_05],
            ['≥1µm',   s.reading.particles_1],
            ['≥2.5µm', s.reading.particles_25],
          ].map(([size, cnt]) =>
            `<div class="pc-chip"><span>${size}:</span>${cnt.toLocaleString()}</div>`
          ).join('')}
        </div>
      </div>

      <div class="sfc-mini-chart">
        <div class="sfc-mini-label">PM2.5 – 24h gần nhất</div>
        <div style="position:relative;height:100px">
          <canvas id="sfc-chart-${idx}" role="img" aria-label="PM2.5 24h của ${s.name}">PM2.5 lịch sử.</canvas>
        </div>
      </div>

      <div class="hw-info">
        <div style="font-size:10px;color:#3d5a75;font-family:'DM Mono',sans-serif;width:100%;margin-bottom:4px">PHẦN CỨNG</div>
        ${s.hw.map(h => `<span class="hw-chip"><strong>${h}</strong></span>`).join('')}
        <span class="hw-chip">Nhiệt độ: <strong>${s.reading.temp}°C</strong></span>
        <span class="hw-chip">Độ ẩm: <strong>${s.reading.humidity}%</strong></span>
        <span class="hw-chip">Nguồn: <strong>${s.power}</strong></span>
      </div>

      <div style="margin-top:12px;padding:12px;background:rgba(0,229,200,.05);border-radius:8px;border:1px solid rgba(0,229,200,.1)">
        <div style="font-size:10px;color:#00e5c8;font-family:'DM Mono';margin-bottom:6px">KHUYẾN NGHỊ SỨC KHỎE</div>
        ${tips.map(t => `<div style="font-size:12px;color:#7a95b0;margin-bottom:3px">· ${t}</div>`).join('')}
      </div>
    </div>`;
  }).join('');

  // Render mini charts after DOM
  setTimeout(() => {
    SENSORS.forEach((s, idx) => {
      const labels = Array.from({length: 24}, (_, i) => i % 6 === 0 ? `${i}h` : '');
      new Chart(document.getElementById(`sfc-chart-${idx}`), {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data: s.history,
            borderColor: s.accentColor,
            backgroundColor: s.dimColor,
            fill: true, tension: .4, pointRadius: 0, borderWidth: 2,
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#3d5a75', font: { size: 9 } }, grid: { color: 'rgba(30,50,72,.6)' } },
            y: { min: 0, ticks: { color: '#3d5a75', font: { size: 9 } }, grid: { color: 'rgba(30,50,72,.6)' } }
          }
        }
      });
    });
  }, 50);
}

/* ── 6. HISTORY ── */
let hist1Chart, hist2Chart, currentMode = '24h';

function initHistory() {
  renderHistCharts('24h');
  renderHistStats('24h');
}

function renderHistCharts(mode) {
  currentMode = mode;
  let labels, d1, d2;

  if (mode === '24h') {
    labels = Array.from({length: 24}, (_, i) => `${i}h`);
    d1 = historyOutdoor; d2 = historyIndoor;
  } else if (mode === '7d') {
    const days = ['T2','T3','T4','T5','T6','T7','CN'];
    labels = days;
    d1 = days.map(() => Math.round(20 + Math.random() * 60));
    d2 = days.map(() => Math.round(15 + Math.random() * 40));
  } else {
    labels = Array.from({length: 30}, (_, i) => `${i+1}`);
    d1 = labels.map(() => Math.round(18 + Math.random() * 70));
    d2 = labels.map(() => Math.round(12 + Math.random() * 50));
  }

  const chartOpts = (color) => ({
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: '#3d5a75', font: { size: 9, family: "'DM Mono'" } }, grid: { color: 'rgba(30,50,72,.6)' } },
      y: { min: 0, ticks: { color: '#3d5a75', font: { size: 9 } }, grid: { color: 'rgba(30,50,72,.6)' } }
    }
  });

  if (hist1Chart) hist1Chart.destroy();
  if (hist2Chart) hist2Chart.destroy();

  hist1Chart = new Chart(document.getElementById('hist1'), {
    type: 'line',
    data: { labels, datasets: [
      { data: d1, borderColor: '#00e5c8', backgroundColor: 'rgba(0,229,200,.07)', fill: true, tension: .4, pointRadius: 0, borderWidth: 2 },
      { data: Array(labels.length).fill(35.4), borderColor: 'rgba(245,158,11,.35)', borderDash: [4,4], pointRadius: 0, fill: false, borderWidth: 1 },
    ]},
    options: chartOpts('#00e5c8')
  });

  hist2Chart = new Chart(document.getElementById('hist2'), {
    type: 'line',
    data: { labels, datasets: [
      { data: d2, borderColor: '#a78bfa', backgroundColor: 'rgba(167,139,250,.07)', fill: true, tension: .4, pointRadius: 0, borderWidth: 2 },
      { data: Array(labels.length).fill(35.4), borderColor: 'rgba(245,158,11,.35)', borderDash: [4,4], pointRadius: 0, fill: false, borderWidth: 1 },
    ]},
    options: chartOpts('#a78bfa')
  });

  renderHistStats(mode, d1, d2);
}

function renderHistStats(mode, d1, d2) {
  d1 = d1 || historyOutdoor; d2 = d2 || historyIndoor;
  const avg1 = (d1.reduce((a,b)=>a+b,0)/d1.length).toFixed(1);
  const avg2 = (d2.reduce((a,b)=>a+b,0)/d2.length).toFixed(1);
  const peak1 = Math.max(...d1).toFixed(1);
  const peak2 = Math.max(...d2).toFixed(1);
  const lv1 = AQI.level(parseFloat(avg1));
  const lv2 = AQI.level(parseFloat(avg2));

  document.getElementById('hist-stats').innerHTML = `
    <div class="stat-box"><div class="stat-box-label">TB Sân trường</div>
      <div class="stat-box-val" style="color:${lv1.color}">${avg1}</div>
      <div class="stat-box-node">µg/m³ PM2.5 · ${lv1.label}</div></div>
    <div class="stat-box"><div class="stat-box-label">Đỉnh Sân trường</div>
      <div class="stat-box-val" style="color:${AQI.level(parseFloat(peak1)).color}">${peak1}</div>
      <div class="stat-box-node">µg/m³ PM2.5 cao nhất</div></div>
    <div class="stat-box"><div class="stat-box-label">TB Không gian mở</div>
      <div class="stat-box-val" style="color:${lv2.color}">${avg2}</div>
      <div class="stat-box-node">µg/m³ PM2.5 · ${lv2.label}</div></div>
    <div class="stat-box"><div class="stat-box-label">Đỉnh Không gian mở</div>
      <div class="stat-box-val" style="color:${AQI.level(parseFloat(peak2)).color}">${peak2}</div>
      <div class="stat-box-node">µg/m³ PM2.5 cao nhất</div></div>
  `;
}

function switchTab(btn, mode) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderHistCharts(mode);
}

/* ── 7. AI FORECAST ── */
function initAI() {
  SENSORS.forEach((s, idx) => {
    // Tạo dữ liệu dự báo (giả lập model tuyến tính + noise)
    const hist = s.history.slice(-6); // 6h gần nhất
    const trend = (hist[hist.length-1] - hist[0]) / hist.length;
    const forecast = Array.from({length: 6}, (_, i) =>
      Math.max(2, Math.round((hist[hist.length-1] + trend * (i+1) + (Math.random()-0.4)*8) * 10) / 10)
    );

    const allLabels = [
      ...Array.from({length:6}, (_,i) => `-${5-i}h`),
      ...Array.from({length:6}, (_,i) => `+${i+1}h`),
    ];
    const combined = [...hist, ...forecast];

    new Chart(document.getElementById(`forecastChart${idx+1}`), {
      type: 'line',
      data: {
        labels: allLabels,
        datasets: [
          {
            label: 'Lịch sử', data: [...hist, ...Array(6).fill(null)],
            borderColor: s.accentColor, backgroundColor: s.dimColor,
            fill: true, tension: .4, pointRadius: 0, borderWidth: 2,
          },
          {
            label: 'Dự báo AI', data: [...Array(5).fill(null), hist[hist.length-1], ...forecast],
            borderColor: s.accentColor, backgroundColor: 'transparent',
            borderDash: [5,3], tension: .4, pointRadius: 3,
            pointBackgroundColor: s.accentColor, borderWidth: 2,
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#3d5a75', font: { size: 9, family: "'DM Mono'" } }, grid: { color: 'rgba(30,50,72,.6)' } },
          y: { min: 0, ticks: { color: '#3d5a75', font: { size: 9 } }, grid: { color: 'rgba(30,50,72,.6)' } }
        }
      }
    });

    const peakFC = Math.max(...forecast);
    const lvFC = AQI.level(peakFC);
    document.getElementById(`fc-insight-${idx+1}`).innerHTML =
      `<strong style="color:${lvFC.color}">Dự báo đỉnh: ${peakFC} µg/m³ (${lvFC.label})</strong> trong 6h tới. ` +
      `Xu hướng ${trend > 0 ? '↑ tăng' : '↓ giảm'} khoảng ${Math.abs(trend).toFixed(1)} µg/h. ` +
      (peakFC > 35.4 ? 'Cảnh báo: Dự báo vượt ngưỡng trung bình. Nên chuẩn bị khẩu trang.' : 'Chất lượng ổn định, duy trì theo dõi.');
  });

  // Rule Engine
  document.getElementById('rules-grid').innerHTML = [
    {trigger:'PM2.5 > 150', condition:'Kém (AQI>200)', action:'→ Gửi thông báo khẩn · Kích hoạt lọc không khí · Đề xuất ở trong nhà', color:'var(--red)'},
    {trigger:'PM2.5 > 55',  condition:'Nhóm nhạy cảm', action:'→ Cảnh báo push · Hiển thị khuyến nghị · Log sự kiện vào DB', color:'var(--amber)'},
    {trigger:'PM2.5 > 35',  condition:'Trung bình', action:'→ Thông báo nhẹ · Hiển thị icon cảnh báo trên dashboard', color:'var(--purple)'},
    {trigger:'Xu hướng tăng >5µg/h', condition:'Dự báo vượt ngưỡng', action:'→ Cảnh báo sớm 2h trước · Gợi ý lịch học ngoài trời', color:'var(--cyan)'},
    {trigger:'Node offline >5 phút', condition:'Mất kết nối', action:'→ Cảnh báo admin · Fallback sang node còn lại', color:'var(--red)'},
    {trigger:'PM2.5 ≤ 12', condition:'Tốt (AQI≤50)', action:'→ Hiển thị "Môi trường tốt" · Khuyến khích hoạt động ngoài', color:'var(--green)'},
  ].map(r => `
    <div class="rule-card">
      <div class="rule-trigger" style="color:${r.color}">${r.trigger}</div>
      <div class="rule-condition" style="font-size:11px;margin-bottom:6px">${r.condition}</div>
      <div class="rule-action" style="font-size:11px;color:#7a95b0">${r.action}</div>
    </div>
  `).join('');

  // Architecture diagram
  document.getElementById('arch-diagram').innerHTML = `
    <div class="arch-layer" style="border-color:rgba(0,229,200,.2)">
      <div class="arch-layer-title" style="color:#00e5c8">Lớp IoT</div>
      <div class="arch-layer-items">
        <div class="arch-item">PMS7003 Node A</div>
        <div class="arch-item">PMS7003 Node B</div>
        <div class="arch-item">UART 9600bps</div>
        <div class="arch-item">ESP32 WiFi</div>
        <div class="arch-item">MQTT/HTTP</div>
      </div>
    </div>
    <div class="arch-arrow">→</div>
    <div class="arch-layer" style="border-color:rgba(167,139,250,.2)">
      <div class="arch-layer-title" style="color:#a78bfa">Lớp AI</div>
      <div class="arch-layer-items">
        <div class="arch-item">Rule Engine</div>
        <div class="arch-item">Dự báo xu hướng</div>
        <div class="arch-item">Phát hiện bất thường</div>
        <div class="arch-item">AQI Scoring</div>
        <div class="arch-item">Alert Generator</div>
      </div>
    </div>
    <div class="arch-arrow">→</div>
    <div class="arch-layer" style="border-color:rgba(245,158,11,.2)">
      <div class="arch-layer-title" style="color:#f59e0b">Lớp Hành động</div>
      <div class="arch-layer-items">
        <div class="arch-item">Dashboard Web/App</div>
        <div class="arch-item">Push Notification</div>
        <div class="arch-item">Cảnh báo tức thì</div>
        <div class="arch-item">Kích hoạt lọc KK</div>
        <div class="arch-item">Báo cáo định kỳ</div>
      </div>
    </div>
  `;
}

/* ── 8. ALERTS ── */
function initAlerts() {
  const alerts = [
    {
      level: 'high', icon: '⚠',
      title: 'PM2.5 vượt ngưỡng Kém – Sân trường ULIS',
      body: `Node A ghi nhận PM2.5 = ${SENSORS[0].reading.pm25} µg/m³, vượt ngưỡng 55 µg/m³. Ảnh hưởng đến toàn bộ người hoạt động ngoài trời trong khuôn viên. Nguồn có thể từ giao thông giờ cao điểm trên đường Phạm Văn Đồng.`,
      time: '07:32 – Hôm nay', node: 'Node A · Sân trường ULIS',
      tags: ['Đeo khẩu trang N95', 'Hạn chế ra ngoài', 'Đóng cửa sổ phòng học'],
      tagColor: 'rgba(244,63,94,.15)', tagBorder: 'rgba(244,63,94,.3)', tagText: '#f43f5e',
      bg: 'rgba(244,63,94,.04)', iconBg: 'rgba(244,63,94,.15)'
    },
    {
      level: 'medium', icon: '⚡',
      title: 'Nhóm nhạy cảm cần chú ý – Không gian mở',
      body: `Node B ghi nhận PM2.5 = ${SENSORS[1].reading.pm25} µg/m³. Trẻ em, người cao tuổi và người có bệnh hô hấp/tim mạch nên hạn chế hoạt động trong hành lang và khu vực thông thoáng.`,
      time: '06:15 – Hôm nay', node: 'Node B · Không gian mở',
      tags: ['Đeo khẩu trang', 'Bật máy lọc không khí', 'Theo dõi tiếp'],
      tagColor: 'rgba(245,158,11,.15)', tagBorder: 'rgba(245,158,11,.3)', tagText: '#f59e0b',
      bg: 'rgba(245,158,11,.03)', iconBg: 'rgba(245,158,11,.15)'
    },
    {
      level: 'low', icon: 'ℹ',
      title: 'Xu hướng PM2.5 tăng – Dự báo vượt ngưỡng',
      body: 'AI phát hiện xu hướng tăng đều trong 3 giờ qua tại Node A. Dự báo PM2.5 có thể đạt 65–75 µg/m³ vào 8h–9h sáng. Khuyến nghị thông báo sớm cho sinh viên có lịch học ngoài trời.',
      time: '05:50 – Hôm nay', node: 'AI Forecast Engine',
      tags: ['Cảnh báo sớm', 'Xem dự báo AI', 'Lên kế hoạch thay thế'],
      tagColor: 'rgba(0,229,200,.1)', tagBorder: 'rgba(0,229,200,.25)', tagText: '#00e5c8',
      bg: 'rgba(0,229,200,.03)', iconBg: 'rgba(0,229,200,.15)'
    },
    {
      level: 'low', icon: '✓',
      title: 'Môi trường tốt – Cuối buổi chiều hôm qua',
      body: 'PM2.5 cả 2 node đạt mức Tốt (≤12 µg/m³) từ 15h–17h hôm qua. Thời điểm lý tưởng cho hoạt động ngoài trời. Hệ thống đã tự động thông báo "Môi trường trong lành" đến người dùng.',
      time: '15:00 – Hôm qua', node: 'Cả 2 node',
      tags: ['Hoạt động ngoài trời OK', 'Tập thể dục an toàn'],
      tagColor: 'rgba(34,197,94,.1)', tagBorder: 'rgba(34,197,94,.25)', tagText: '#22c55e',
      bg: 'rgba(34,197,94,.02)', iconBg: 'rgba(34,197,94,.15)'
    },
  ];

  const borderColors = {high: '#f43f5e', medium: '#f59e0b', low: '#00e5c8'};

  document.getElementById('alerts-list').innerHTML = alerts.map(a => `
    <div class="alert-item level-${a.level}" style="border-color:${borderColors[a.level]};background:${a.bg}">
      <div class="alert-icon-wrap" style="background:${a.iconBg}">${a.icon}</div>
      <div style="flex:1">
        <div class="alert-title">${a.title}</div>
        <div class="alert-body">${a.body}</div>
        <div class="alert-meta">${a.time} · ${a.node}</div>
        <div class="alert-tags">
          ${a.tags.map(t => `<span class="alert-tag" style="background:${a.tagColor};border-color:${a.tagBorder};color:${a.tagText}">${t}</span>`).join('')}
        </div>
      </div>
    </div>
  `).join('');
}

/* ── 9. ABOUT ── */
function initAbout() {
  document.getElementById('about-content').innerHTML = `
    <div class="about-hero">
      <div class="about-tagline">Smart Campus · ULIS 2025</div>
      <div class="about-title">Smart Campus Air Shield</div>
      <div class="about-desc">Hệ thống tích hợp IoT và AI nhằm giám sát, phân tích và phản ứng với chất lượng không khí theo thời gian thực trong khuôn viên trường đại học – từ đó nâng cao sức khỏe và hiệu quả học tập của cộng đồng ULIS.</div>
    </div>

    <div class="about-cards">
      <div class="about-card">
        <div class="about-card-icon">📡</div>
        <div class="about-card-title" style="color:#00e5c8">Lớp IoT – Thu thập</div>
        <div class="about-card-body">Mạng cảm biến PMS7003 đặt tại sân trường và không gian mở. Đo PM1.0, PM2.5, PM10 theo thời gian thực. Biến môi trường "vô hình" thành dữ liệu cụ thể.</div>
      </div>
      <div class="about-card">
        <div class="about-card-icon">🧠</div>
        <div class="about-card-title" style="color:#a78bfa">Lớp AI – Xử lý</div>
        <div class="about-card-body">Rule Engine phát hiện vượt ngưỡng tức thì. Mô hình dự báo xu hướng theo chuỗi thời gian. Không chỉ đo – mà còn hiểu và dự đoán.</div>
      </div>
      <div class="about-card">
        <div class="about-card-icon">⚡</div>
        <div class="about-card-title" style="color:#f59e0b">Lớp Hành động</div>
        <div class="about-card-body">Dashboard web hiển thị bản đồ AQI, gửi cảnh báo push, tự động kích hoạt hệ thống lọc không khí. Biến dữ liệu thành hành động thực tế.</div>
      </div>
    </div>

    <div class="about-hw">
      <div class="section-label">Phần cứng & Công nghệ</div>
      <div class="hw-row">
        ${['PMS7003 Sensor','ESP32 / Arduino Nano','UART 9600bps','WiFi 2.4GHz','MQTT Protocol','Chart.js','Rule-based AI','HTML/CSS/JS'].map(h =>
          `<span class="hw-chip"><strong style="color:#e2eaf4">${h}</strong></span>`
        ).join('')}
      </div>
    </div>
  `;
}

/* ── 10. REAL-TIME SIMULATION ── */
function refreshData() {
  // Mô phỏng nhận data mới từ sensor (thay bằng fetch('/api/readings') khi có ESP32)
  SENSORS.forEach(s => {
    const last = s.history[s.history.length - 1];
    const newVal = Math.max(2, Math.round((last + (Math.random() - 0.4) * 8) * 10) / 10);
    s.history.push(newVal);
    s.history.shift();
    s.reading = currentReading(s.history);
    s.lastUpdate = 'vừa xong';
  });

  // Re-render hero cards và metrics
  renderHeroCards();
  updateMetricsRow();
  updateAIInsight();

  // Update live chart
  if (liveChart) {
    liveChart.data.datasets[0].data = [...historyOutdoor];
    liveChart.data.datasets[1].data = [...historyIndoor];
    liveChart.update('none');
  }

  // Reset sensor screen để re-init với data mới
  window._sensorsInited = false;
}

/* ── 11. CLOCK & AUTO-REFRESH ── */
function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent =
    now.toLocaleTimeString('vi-VN', {hour:'2-digit',minute:'2-digit',second:'2-digit'});
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  bindNavLinks();
  updateClock();
  setInterval(updateClock, 1000);
  setInterval(() => { refreshData(); }, 15000); // auto-refresh mỗi 15s
  initDashboard();
});

/* ── API INTEGRATION GUIDE (comment) ──
   Khi ESP32 gửi data thật, thay refreshData() bằng:

   async function fetchFromESP32() {
     const res = await fetch('http://ESP32_IP/api/readings'); // hoặc MQTT
     const data = await res.json();
     // data = { nodeA: {pm1:8, pm25:12, pm10:22}, nodeB: {pm1:5, pm25:8, pm10:15} }
     SENSORS[0].reading = data.nodeA;
     SENSORS[1].reading = data.nodeB;
     renderHeroCards();
     updateMetricsRow();
   }

   Hoặc dùng Firebase Realtime DB:
   import { getDatabase, ref, onValue } from 'firebase/database';
   onValue(ref(db, 'sensors'), snapshot => { ... });
*/
