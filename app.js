/* ═══════════════════════════════════════════════════════════
   Smart Campus Air Shield – app.js
   PWA · ULIS ĐHQGHN · 2 PMS7003 sensors
   Mock data → plug in real WebSocket/MQTT when hardware ready
═══════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────
   1. AQI ENGINE  (US EPA standard)
   Input: PM2.5 µg/m³ → Output: level object
───────────────────────────────────────── */
const AQI = {
  fromPM25(pm) {
    const bp=[
      [0,12,0,50],[12.1,35.4,51,100],[35.5,55.4,101,150],
      [55.5,150.4,151,200],[150.5,250.4,201,300],[250.5,500,301,500]
    ];
    for(const[lo,hi,ilo,ihi]of bp) if(pm<=hi) return Math.round(((ihi-ilo)/(hi-lo))*(pm-lo)+ilo);
    return 500;
  },
  level(pm25) {
    if(pm25<=12)    return{k:'good',     em:'😊',lbl:'Tốt',            c:'#16a34a',bg:'#f0fdf4',bd:'#bbf7d0',tc:'#14532d'};
    if(pm25<=35.4)  return{k:'moderate', em:'🙂',lbl:'Trung bình',     c:'#ca8a04',bg:'#fefce8',bd:'#fde68a',tc:'#713f12'};
    if(pm25<=55.4)  return{k:'sensitive',em:'😐',lbl:'Nhóm nhạy cảm', c:'#ea580c',bg:'#fff7ed',bd:'#fed7aa',tc:'#7c2d12'};
    if(pm25<=150.4) return{k:'unhealthy',em:'😷',lbl:'Kém',           c:'#dc2626',bg:'#fef2f2',bd:'#fecaca',tc:'#7f1d1d'};
    if(pm25<=250.4) return{k:'very',     em:'🤢',lbl:'Rất xấu',       c:'#7c3aed',bg:'#f5f3ff',bd:'#ddd6fe',tc:'#3b0764'};
    return              {k:'hazardous',  em:'☠️', lbl:'Nguy hiểm',     c:'#be123c',bg:'#fff1f2',bd:'#fecdd3',tc:'#881337'};
  }
};

/* ─────────────────────────────────────────
   2. AI ANALYSIS ENGINE
   Rule-based + trend detection
   (In production: replace with Python ML model via REST API)
───────────────────────────────────────── */
const AI = {
  // Phân tích xu hướng 3 điểm gần nhất
  trend(hist) {
    const last = hist.slice(-4);
    const slope = (last[last.length-1] - last[0]) / last.length;
    if (slope > 3)  return {dir:'↑ tăng nhanh', color:'#dc2626', warn:true};
    if (slope > 0.5) return {dir:'↑ tăng nhẹ',  color:'#ea580c', warn:false};
    if (slope < -3)  return {dir:'↓ giảm nhanh', color:'#16a34a', warn:false};
    if (slope < -0.5) return {dir:'↓ giảm nhẹ',  color:'#2dd4a0', warn:false};
    return {dir:'→ ổn định', color:'#6b7280', warn:false};
  },

  // Dự báo 6h tới dùng exponential smoothing đơn giản
  forecast(hist, steps=6) {
    const alpha = 0.35; // smoothing factor
    let sm = hist[hist.length-1];
    const last6 = hist.slice(-6);
    const slope  = (last6[5]-last6[0])/6;
    const result = [];
    for(let i=0;i<steps;i++){
      // Exponential smoothing + trend + noise
      const pred = sm + slope * 0.7 + (Math.random()-0.45)*5;
      sm = alpha*pred + (1-alpha)*sm;
      result.push(Math.max(2, +sm.toFixed(1)));
    }
    return result;
  },

  // Sinh insight text từ data
  insight(sensor) {
    const lv  = AQI.level(sensor.reading.pm25);
    const tr  = AI.trend(sensor.history);
    const fc  = AI.forecast(sensor.history);
    const peak= Math.max(...fc).toFixed(1);
    const peakLv = AQI.level(parseFloat(peak));
    const tips = {
      good:'😊 Không khí tốt — thoải mái hoạt động ngoài trời. Tiếp tục theo dõi!',
      moderate:`🙂 Trung bình, xu hướng ${tr.dir}. Nhóm nhạy cảm nên hạn chế ở ngoài lâu.`,
      sensitive:`😐 Nhóm nhạy cảm cần chú ý! Xu hướng ${tr.dir}. Nhớ mang khẩu trang khi ra ngoài.`,
      unhealthy:`😷 Chất lượng kém, xu hướng ${tr.dir}. Hạn chế ra ngoài, đeo N95 nếu cần thiết.`,
      very:`🤢 Không khí rất xấu! Ở trong nhà. Xu hướng ${tr.dir}. Dự báo đỉnh ${peak} µg/m³.`,
      hazardous:'☠️ KHẨN CẤP! Không ra ngoài. Liên hệ y tế nếu có triệu chứng hô hấp.',
    };
    return tips[lv.k] || tips.moderate;
  }
};

/* ─────────────────────────────────────────
   3. MOCK DATA
   Sinh dữ liệu giả lập thực tế 24h
   Pattern: thấp đêm → tăng giờ cao điểm → ổn trưa → tăng nhẹ chiều
───────────────────────────────────────── */
function genHist24(basePM25, variance, rushMultiplier) {
  return Array.from({length:24}, (_,h) => {
    let v = basePM25 + (Math.random()-0.45)*variance;
    if (h>=6 && h<=9)   v += basePM25*rushMultiplier;   // sáng
    if (h>=16 && h<=19) v += basePM25*rushMultiplier*.6; // chiều
    if (h>=1  && h<=5)  v -= basePM25*.3;                // khuya
    return Math.max(2, +v.toFixed(1));
  });
}

const hist_A = genHist24(38, 20, 0.7); // Sân trường – outdoor cao hơn
const hist_B = genHist24(22, 14, 0.45); // Không gian mở – bán trong

function makeReading(hist) {
  const pm25 = hist[hist.length-1];
  return {
    pm25, pm1:+(pm25*.64).toFixed(1), pm10:+(pm25*1.57).toFixed(1),
    p03:Math.round(1300+pm25*36+Math.random()*220),
    p05:Math.round(360+pm25*10+Math.random()*65),
    temp:28+Math.round(Math.random()*6),
    humidity:62+Math.round(Math.random()*24),
  };
}

const NODES = [
  {
    id:'A', name:'Sân trường ULIS', nodeLabel:'NODE A · Outdoor',
    addr:'Khuôn viên ngoài trời – Cổng chính ULIS, Cầu Giấy, Hà Nội',
    icon:'🌳', accent:'#2dd4a0', pale:'#e0faf2', paleBd:'rgba(45,212,160,.25)',
    hw:'ESP32-WROOM + PMS7003 · IP54', updated:'vừa xong',
    history:hist_A, reading:makeReading(hist_A),
  },
  {
    id:'B', name:'Không gian mở', nodeLabel:'NODE B · Semi-outdoor',
    addr:'Hành lang tầng 1 – Toà nhà A, khu vực bán ngoài trời',
    icon:'🏛️', accent:'#38bdf8', pale:'#e0f4ff', paleBd:'rgba(56,189,248,.25)',
    hw:'Arduino Nano + ESP-01 + PMS7003', updated:'18 giây trước',
    history:hist_B, reading:makeReading(hist_B),
  },
];

let activeNode = 0;

/* ─────────────────────────────────────────
   4. CONTENT DATA
───────────────────────────────────────── */
function getDecision(pm25) {
  const map = {
    good:[
      {em:'🏃',c:'#f0fdf4',bd:'#86efac',tc:'#14532d',title:'Thoải mái ra ngoài! 🎉',body:'Không khí trong lành. Đi học, dạo sân, tập thể dục ngoài trời đều ổn. Tận hưởng ngày đẹp!'},
      {em:'🚴',c:'#e0faf2',bd:'#6ee7b7',tc:'#065f46',title:'Thời điểm vàng hoạt động ngoài trời',body:'AQI thấp — lý tưởng để đạp xe, chạy bộ hoặc học nhóm ngoài trời. Không cần khẩu trang.'},
    ],
    moderate:[
      {em:'🚶',c:'#fefce8',bd:'#fde68a',tc:'#713f12',title:'Có thể ra ngoài, giữ ý thức',body:'Đi lại ngắn (đến lớp, ăn trưa) không cần lo. Hạn chế tập thể dục mạnh kéo dài ngoài trời.'},
      {em:'😷',c:'#fff8ed',bd:'#fed7aa',tc:'#7c2d12',title:'Nhóm nhạy cảm nên đeo khẩu trang',body:'Hen suyễn, dị ứng bụi, tim mạch → nên đeo khẩu trang y tế và hạn chế thời gian ở ngoài.'},
    ],
    sensitive:[
      {em:'😷',c:'#fff7ed',bd:'#fed7aa',tc:'#7c2d12',title:'Ra ngoài? BẮT BUỘC đeo khẩu trang!',body:'Đeo N95 hoặc KF94 khi ra ngoài. Hạn chế hoạt động thể chất mạnh. Về trong nhà sớm.'},
      {em:'🏠',c:'#f0f9ff',bd:'#bae6fd',tc:'#0c4a6e',title:'Tốt hơn nên ở trong nhà',body:'Ưu tiên ở lại thư viện, phòng học có điều hoà. Không khí trong nhà tốt hơn nhiều lúc này.'},
    ],
    unhealthy:[
      {em:'⚠️',c:'#fef2f2',bd:'#fca5a5',tc:'#7f1d1d',title:'Hạn chế tối đa ra ngoài ⚠️',body:'Chỉ ra ngoài khi thực sự cần. Đeo N95, đi nhanh, không đứng lâu ngoài trời. Về nhà sớm.'},
      {em:'🪟',c:'#fef2f2',bd:'#fecaca',tc:'#7f1d1d',title:'Đóng cửa sổ phòng học',body:'Yêu cầu phòng học bật điều hoà và đóng cửa sổ. Không khí ngoài đang kém hơn trong phòng.'},
    ],
    very:[
      {em:'🚨',c:'#f5f3ff',bd:'#c4b5fd',tc:'#3b0764',title:'KHÔNG nên ra ngoài 🚨',body:'Không khí rất xấu. Ở trong nhà, đóng kín cửa. Đeo N95 ngay cả trong nhà. Liên hệ y tế nếu khó thở.'},
      {em:'📢',c:'#f5f3ff',bd:'#ddd6fe',tc:'#3b0764',title:'Thông báo cho mọi người xung quanh',body:'Chia sẻ cảnh báo này với bạn cùng phòng và gia đình. Trẻ em và người cao tuổi cần bảo vệ ngay.'},
    ],
    hazardous:[
      {em:'☠️',c:'#fff1f2',bd:'#fecdd3',tc:'#881337',title:'TÌNH TRẠNG KHẨN CẤP ☠️',body:'Không ra ngoài dưới bất kỳ lý do gì. Gọi 115 nếu có triệu chứng hô hấp nghiêm trọng.'},
      {em:'🏥',c:'#fff1f2',bd:'#fda4af',tc:'#881337',title:'Tìm nơi trú ẩn ngay',body:'Vào tòa nhà kín, bịt khe hở. Bật lọc không khí HEPA nếu có. Theo dõi thông báo khẩn từ trường.'},
    ],
  };
  return map[AQI.level(pm25).k] || map.good;
}

function getGear(pm25) {
  const lv = AQI.level(pm25);
  const allGear = {
    good:[
      {em:'👟',name:'Giày thể thao',why:'Ngày hoạt động thoải mái',must:false,c:'#e0faf2',bd:'#6ee7b7'},
      {em:'🧴',name:'Kem chống nắng',why:'UV cao giữa trưa',must:true,c:'#fffbeb',bd:'#fde68a'},
      {em:'💧',name:'Bình nước 500ml+',why:'Giữ đủ nước cho cơ thể',must:true,c:'#e0f4ff',bd:'#bae6fd'},
      {em:'🎒',name:'Balo bình thường',why:'Ngày học thoải mái',must:false,c:'#f0fdf4',bd:'#bbf7d0'},
    ],
    moderate:[
      {em:'😷',name:'Khẩu trang y tế',why:'Nhóm nhạy cảm nên mang',must:false,c:'#fffbeb',bd:'#fde68a'},
      {em:'💧',name:'Bình nước 500ml+',why:'Giữ ẩm đường hô hấp',must:true,c:'#e0f4ff',bd:'#bae6fd'},
      {em:'🧴',name:'Kem chống nắng',why:'Bụi + UV gây kích ứng da',must:true,c:'#fffbeb',bd:'#fde68a'},
      {em:'🍬',name:'Kẹo ho / long đờm',why:'Làm dịu cổ họng khi cần',must:false,c:'#f5f3ff',bd:'#ddd6fe'},
    ],
    sensitive:[
      {em:'😷',name:'Khẩu trang N95/KF94',why:'BẮT BUỘC khi ra ngoài',must:true,c:'#fff7ed',bd:'#fed7aa'},
      {em:'💧',name:'Nước ấm + mật ong',why:'Bảo vệ cổ họng và phổi',must:true,c:'#fffbeb',bd:'#fde68a'},
      {em:'💊',name:'Thuốc dị ứng/xịt mũi',why:'Nếu có tiền sử hen suyễn',must:true,c:'#fef2f2',bd:'#fecaca'},
      {em:'🧣',name:'Khăn che mũi miệng',why:'Lớp bảo vệ bổ sung',must:false,c:'#f5f3ff',bd:'#ddd6fe'},
    ],
    unhealthy:[
      {em:'😷',name:'Khẩu trang N95',why:'BẮT BUỘC khi ra ngoài',must:true,c:'#fef2f2',bd:'#fecaca'},
      {em:'🥽',name:'Kính bảo hộ / kính thường',why:'Bảo vệ mắt khỏi bụi mịn',must:true,c:'#fef2f2',bd:'#fca5a5'},
      {em:'💊',name:'Thuốc hô hấp (nếu có)',why:'Mang theo người trong ngày',must:true,c:'#fff7ed',bd:'#fed7aa'},
      {em:'📱',name:'Điện thoại đầy pin',why:'Liên lạc khẩn cấp nếu cần',must:true,c:'#f5f3ff',bd:'#ddd6fe'},
    ],
    very:[
      {em:'😷',name:'N95 x2 (mang dự phòng)',why:'Thay khi ướt hoặc hỏng',must:true,c:'#f5f3ff',bd:'#c4b5fd'},
      {em:'🥽',name:'Kính kín mắt',why:'Mắt rất nhạy cảm lúc này',must:true,c:'#fef2f2',bd:'#fca5a5'},
      {em:'📞',name:'Số 115 trong danh bạ',why:'Cấp cứu quốc gia',must:true,c:'#fef2f2',bd:'#fecaca'},
      {em:'🏠',name:'TỐT NHẤT: Ở NHÀ',why:'Không ra ngoài nếu không cần',must:true,c:'#f5f3ff',bd:'#ddd6fe'},
    ],
    hazardous:[
      {em:'🚨',name:'ĐỪNG RA NGOÀI',why:'Mức nguy hiểm – ở trong nhà',must:true,c:'#fff1f2',bd:'#fda4af'},
      {em:'😷',name:'N95 + bịt kín mặt',why:'Nếu BẮT BUỘC phải ra ngoài',must:true,c:'#fff1f2',bd:'#fecdd3'},
      {em:'📞',name:'Gọi 115 ngay',why:'Nếu khó thở hoặc đau ngực',must:true,c:'#fef2f2',bd:'#fca5a5'},
      {em:'💊',name:'Thuốc dự phòng đầy đủ',why:'Chuẩn bị trước khi cần',must:true,c:'#fffbeb',bd:'#fde68a'},
    ],
  };
  return allGear[lv.k] || allGear.good;
}

const TIPS_HOME = [
  {em:'🌬️',title:'Thời điểm thông gió',body:'Mở cửa sổ lúc 5–7h sáng và sau 20h tối khi PM2.5 thấp nhất. Tránh thông gió lúc 7–9h cao điểm.',c:'#e0faf2',bd:'#6ee7b7'},
  {em:'🤧',title:'Rửa mũi muối sinh lý',body:'Sau khi ở ngoài về, rửa mũi NaCl 0.9%. Loại bỏ bụi mịn bám trong khoang mũi hiệu quả.',c:'#fffbeb',bd:'#fde68a'},
  {em:'🪴',title:'Cây xanh trong phòng',body:'Kim Tiền, Trầu bà, Lưỡi Hổ – lọc VOC và tăng độ ẩm tự nhiên trong phòng ký túc.',c:'#f0fdf4',bd:'#86efac'},
  {em:'🍵',title:'Trà gừng mật ong',body:'Buổi sáng uống trà gừng + mật ong + chanh. Giảm viêm và tăng sức đề kháng đường hô hấp.',c:'#f5f3ff',bd:'#ddd6fe'},
  {em:'👁️',title:'Bảo vệ mắt',body:'Đeo kính thường hoặc kính râm khi ra ngoài. Bụi PM2.5 gây kích ứng và viêm kết mạc mắt.',c:'#e0f4ff',bd:'#bae6fd'},
  {em:'🏃',title:'Tập trong giờ sạch',body:'Tập thể dục ngoài trời vào sáng sớm (trước 7h) hoặc sau 19h khi PM2.5 thấp nhất.',c:'#f0fdf4',bd:'#bbf7d0'},
  {em:'😴',title:'Ngủ đủ giấc',body:'Trong lúc ngủ phổi tự dọn bụi hiệu quả nhất. 7–8 tiếng ngủ = phổi khoẻ hơn.',c:'#fff7ed',bd:'#fed7aa'},
  {em:'💧',title:'Uống 2L nước/ngày',body:'Màng nhầy đường hô hấp cần đủ nước để hoạt động. Thêm nước ấm pha mật ong sáng sớm.',c:'#e0f4ff',bd:'#7dd3fc'},
];

/* ─────────────────────────────────────────
   5. RENDER FUNCTIONS
───────────────────────────────────────── */
function renderHero() {
  const s = NODES[activeNode];
  const lv = AQI.level(s.reading.pm25);
  const aqi = AQI.fromPM25(s.reading.pm25);
  document.getElementById('heroWrap').innerHTML = `
  <div class="hero" style="background:${lv.bg};border-color:${lv.bd}">
    <div class="hero-glow" style="background:${lv.c}"></div>
    <div class="hero-top-row">
      <div class="hero-location-tag">
        <div class="hero-node-label" style="color:${lv.tc}">${s.nodeLabel}</div>
        <div class="hero-node-name" style="color:${lv.tc}">${s.name}</div>
        <div class="hero-node-addr" style="color:${lv.tc}">${s.addr}</div>
      </div>
      <div class="hero-emoji-big">${lv.em}</div>
    </div>
    <div class="hero-pm25-val" style="color:${lv.c}">${s.reading.pm25}</div>
    <div class="hero-pm25-sub" style="color:${lv.tc}">µg/m³ · PM2.5</div>
    <div class="hero-level-chip" style="background:${lv.c}20;border-color:${lv.bd};color:${lv.tc}">
      ${lv.em} ${lv.lbl}
    </div>
    <div class="hero-aqi-row" style="color:${lv.tc}">AQI: ${aqi} · ${AI.trend(s.history).dir}</div>
    <div class="hero-metrics-row">
      ${[['PM1.0',s.reading.pm1],['PM2.5',s.reading.pm25],['PM10',s.reading.pm10],['Nhiệt độ',s.reading.temp+'°C']].map(([l,v])=>`
      <div class="h-metric">
        <div class="h-metric-val" style="color:${lv.c}">${v}</div>
        <div class="h-metric-lbl" style="color:${lv.tc}">${l}</div>
      </div>`).join('')}
    </div>
    <div class="hero-footer" style="color:${lv.tc}">
      <span class="hero-pulse-dot" style="background:${lv.c}"></span>
      <span>📡 ${s.hw} · ⏱️ ${s.updated}</span>
    </div>
  </div>`;
}

function renderDecision() {
  const rows = getDecision(NODES[activeNode].reading.pm25);
  document.getElementById('decisionWrap').innerHTML = `
  <div class="card" style="padding:16px">
    <div class="card-title">🤔 Với PM2.5 = <span style="color:${AQI.level(NODES[activeNode].reading.pm25).c};font-weight:900">${NODES[activeNode].reading.pm25}</span> µg/m³ tại ${NODES[activeNode].name}:</div>
    ${rows.map(r=>`
    <div class="decision-row" style="background:${r.c};border-color:${r.bd}">
      <div class="d-emoji">${r.em}</div>
      <div>
        <div class="d-title" style="color:${r.tc}">${r.title}</div>
        <div class="d-body">${r.body}</div>
      </div>
    </div>`).join('')}
  </div>`;
}

function renderGear() {
  const gear = getGear(NODES[activeNode].reading.pm25);
  const lv = AQI.level(NODES[activeNode].reading.pm25);
  document.getElementById('gearWrap').innerHTML = `
  <div class="card">
    <div class="card-title">${lv.em} Danh sách đồ cần mang – mức <span style="color:${lv.c}">${lv.lbl}</span></div>
    <div class="gear-grid">
      ${gear.map(g=>`
      <div class="gear-item" style="background:${g.c};border-color:${g.bd}">
        <div class="g-emoji">${g.em}</div>
        <div>
          <div class="g-name">${g.name}</div>
          <div class="g-why">${g.why}</div>
          ${g.must?`<span class="g-must-tag" style="background:${g.bd};color:#7f1d1d">BẮT BUỘC</span>`:''}
        </div>
      </div>`).join('')}
    </div>
  </div>`;
}

function renderTipsHome() {
  document.getElementById('tipsHomeScroll').innerHTML = TIPS_HOME.map(t=>`
  <div class="tip-card" style="background:${t.c};border-color:${t.bd}">
    <span class="tip-emoji">${t.em}</span>
    <div class="tip-title">${t.title}</div>
    <div class="tip-body">${t.body}</div>
  </div>`).join('');
}

function renderThresh() {
  const rows=[
    {sw:'#16a34a',lbl:'😊 Tốt',range:'0–12 µg/m³',tip:'Thoải mái hoạt động ngoài trời'},
    {sw:'#ca8a04',lbl:'🙂 Trung bình',range:'12–35 µg/m³',tip:'Nhóm nhạy cảm hạn chế ở ngoài lâu'},
    {sw:'#ea580c',lbl:'😐 Nhóm nhạy cảm',range:'35–55 µg/m³',tip:'Đeo khẩu trang, giảm hoạt động mạnh'},
    {sw:'#dc2626',lbl:'😷 Kém',range:'55–150 µg/m³',tip:'Hạn chế ra ngoài, đóng cửa sổ'},
    {sw:'#7c3aed',lbl:'🤢 Rất xấu',range:'150–250 µg/m³',tip:'Ở trong nhà, đeo N95 mọi lúc'},
    {sw:'#be123c',lbl:'☠️ Nguy hiểm',range:'>250 µg/m³',tip:'Khẩn cấp – gọi 115 nếu cần'},
  ];
  document.getElementById('threshWrap').innerHTML = `
    <div style="font-size:11px;font-weight:800;margin-bottom:10px;color:#374151">Tiêu chuẩn US EPA · PM2.5 (µg/m³)</div>
    ${rows.map(r=>`
    <div class="thresh-row">
      <div class="thresh-swatch" style="background:${r.sw}"></div>
      <div class="thresh-level">${r.lbl}</div>
      <div class="thresh-range">${r.range}</div>
      <div class="thresh-tip">${r.tip}</div>
    </div>`).join('')}
    <div style="font-size:9px;color:#9ca3af;margin-top:10px;font-weight:600;padding-top:8px;border-top:1px solid #f3f4f6">
      ℹ️ PM1.0/PM2.5/PM10 là dữ liệu đo trực tiếp từ PMS7003 · AQI suy luận theo US EPA · Không đo CO, NO₂, SO₂
    </div>`;
}

/* ─────────────────────────────────────────
   6. SENSORS SCREEN
───────────────────────────────────────── */
function renderSensorCards() {
  document.getElementById('sensorCardsWrap').innerHTML = NODES.map(s=>{
    const lv=AQI.level(s.reading.pm25);
    const aqi=AQI.fromPM25(s.reading.pm25);
    const ins=AI.insight(s);
    return `
    <div class="sensor-card">
      <div class="sc-head">
        <div class="sc-icon-box" style="background:${s.pale};border:1.5px solid ${s.paleBd}">${s.icon}</div>
        <div>
          <div class="sc-title">${s.name}</div>
          <div class="sc-sub">${s.addr}</div>
        </div>
        <div class="sc-badge" style="background:${lv.bg};border-color:${lv.bd};color:${lv.tc}">${lv.em} ${lv.lbl}</div>
      </div>
      <div class="pm-row3">
        ${[['PM1.0',s.reading.pm1],['PM2.5',s.reading.pm25],['PM10',s.reading.pm10]].map(([n,v])=>`
        <div class="pm-box">
          <div class="pm-box-label">${n}</div>
          <div class="pm-box-val" style="color:${lv.c}">${v}</div>
          <div class="pm-box-unit">µg/m³</div>
        </div>`).join('')}
      </div>
      ${[['PM2.5',s.reading.pm25,150],['PM10',s.reading.pm10,200]].map(([n,v,mx])=>`
      <div class="pm-bar-row">
        <div class="pm-bar-lbl">${n}</div>
        <div class="pm-bar-track"><div class="pm-bar-fill" style="width:${Math.min(100,Math.round(v/mx*100))}%;background:${lv.c}"></div></div>
        <div class="pm-bar-pct">${Math.min(100,Math.round(v/mx*100))}%</div>
      </div>`).join('')}
      <div class="extra-chips">
        <div class="extra-chip">🌡️ ${s.reading.temp}°C</div>
        <div class="extra-chip">💧 ${s.reading.humidity}%</div>
        <div class="extra-chip">📊 AQI ${aqi}</div>
        <div class="extra-chip">⏱️ ${s.updated}</div>
        <div class="extra-chip">📡 ${s.hw}</div>
      </div>
      <div style="margin-top:12px;padding:10px 12px;background:#f0fdf4;border-radius:10px;border:1.5px solid #bbf7d0">
        <div style="font-size:9px;font-weight:800;color:#15803d;letter-spacing:.06em;margin-bottom:4px">🤖 AI INSIGHT</div>
        <div style="font-size:11px;font-weight:600;color:#166534;line-height:1.6">${ins}</div>
      </div>
    </div>`;
  }).join('');
}

let cmpChartInst;
function renderCmpChart() {
  const hrs=Array.from({length:24},(_,i)=>i%4===0?`${i}h`:'');
  if(cmpChartInst) cmpChartInst.destroy();
  cmpChartInst=new Chart(document.getElementById('cmpChart'),{
    type:'line',
    data:{labels:hrs,datasets:[
      {data:hist_A,borderColor:'#2dd4a0',backgroundColor:'rgba(45,212,160,.07)',fill:true,tension:.4,pointRadius:0,borderWidth:2,label:'Sân trường'},
      {data:hist_B,borderColor:'#38bdf8',backgroundColor:'rgba(56,189,248,.06)',fill:true,tension:.4,pointRadius:0,borderWidth:2,label:'Không gian mở'},
      {data:Array(24).fill(35.4),borderColor:'rgba(234,88,12,.3)',borderDash:[4,3],pointRadius:0,fill:false,borderWidth:1,label:'Ngưỡng'},
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{font:{size:9},color:'#9ca3af'},grid:{color:'rgba(0,0,0,.04)'}},
              y:{min:0,ticks:{font:{size:9},color:'#9ca3af'},grid:{color:'rgba(0,0,0,.04)'}}}}
  });
}

function renderHwGuide() {
  document.getElementById('hwGuideWrap').innerHTML = `
  <div style="font-size:12px;font-weight:900;color:#1f2937;margin-bottom:12px">📡 Kết nối PMS7003 → ESP32 → Web</div>
  <div style="display:flex;flex-direction:column;gap:8px">
    ${[
      {step:'1',em:'🔌',title:'Đấu nối phần cứng',body:'PMS7003: VCC→5V · GND→GND · TXD→ESP32 GPIO16 · RXD→GPIO17 (UART2)\nLogic 3.3V TTL, baud 9600, active mode mặc định'},
      {step:'2',em:'💻',title:'Flash ESP32 (Arduino IDE)',body:'Đọc frame PMS7003 qua Serial2\nParse 32 bytes: pm1=[4][5], pm25=[6][7], pm10=[8][9]\nGửi HTTP POST mỗi 10s hoặc publish MQTT topic'},
      {step:'3',em:'🌐',title:'Server nhận data',body:'Node.js + Express: POST /api/sensor → lưu vào memory/DB\nHoặc Firebase Realtime DB: ESP32 gọi REST API Firebase trực tiếp\nWebSocket broadcast đến tất cả clients đang mở app'},
      {step:'4',em:'📱',title:'App nhận real-time',body:'Replace setInterval mock bằng:\nconst ws = new WebSocket("ws://your-server/ws")\nws.onmessage = e => { updateUI(JSON.parse(e.data)) }'},
    ].map(s=>`
    <div style="display:flex;gap:10px;padding:12px;background:#f9fafb;border-radius:12px;border:1.5px solid #e5e7eb">
      <div style="width:28px;height:28px;border-radius:50%;background:#2dd4a0;color:white;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0">${s.step}</div>
      <div>
        <div style="font-size:12px;font-weight:800;margin-bottom:3px;color:#1f2937">${s.em} ${s.title}</div>
        <div style="font-size:10px;font-weight:600;color:#6b7280;line-height:1.7;white-space:pre-line">${s.body}</div>
      </div>
    </div>`).join('')}
  </div>
  <div style="margin-top:12px;padding:10px 12px;background:#e0faf2;border-radius:10px;border:1.5px solid #6ee7b7;font-size:10px;font-weight:600;color:#065f46">
    💡 <strong>Deploy miễn phí:</strong> Vercel (frontend) + Railway/Render (Node.js backend) + Firebase (real-time DB). 
    Tổng chi phí: ~0 VNĐ/tháng cho scale nhỏ (dưới 50 users).
  </div>`;
}

/* ─────────────────────────────────────────
   7. REPORT SCREEN
───────────────────────────────────────── */
let fcChartInst;
function renderReport() {
  const s0=NODES[0]; const s1=NODES[1];
  const avg0=+(s0.history.reduce((a,b)=>a+b,0)/s0.history.length).toFixed(1);
  const avg1=+(s1.history.reduce((a,b)=>a+b,0)/s1.history.length).toFixed(1);
  const peak0=Math.max(...s0.history).toFixed(1);
  const overLimit=s0.history.filter(v=>v>55.4).length+s1.history.filter(v=>v>55.4).length;
  const lv0=AQI.level(avg0); const lv1=AQI.level(avg1);

  document.getElementById('statsWrap').innerHTML=`
    <div class="stat-box"><div class="stat-val" style="color:${lv0.c}">${avg0}</div><div class="stat-lbl">TB PM2.5 · Sân trường</div><div class="stat-sub">${lv0.em} ${lv0.lbl}</div></div>
    <div class="stat-box"><div class="stat-val" style="color:${lv1.c}">${avg1}</div><div class="stat-lbl">TB PM2.5 · KG mở</div><div class="stat-sub">${lv1.em} ${lv1.lbl}</div></div>
    <div class="stat-box"><div class="stat-val" style="color:#dc2626">${peak0}</div><div class="stat-lbl">Đỉnh PM2.5 hôm nay</div><div class="stat-sub">µg/m³ cao nhất</div></div>
    <div class="stat-box"><div class="stat-val" style="color:#ea580c">${overLimit}</div><div class="stat-lbl">Lần vượt ngưỡng Kém</div><div class="stat-sub">trong 24h qua</div></div>`;

  document.getElementById('timelineWrap').innerHTML=[
    {t:'02–05h',em:'✨',txt:'Không khí sạch nhất trong ngày – PM2.5 ≈ 8 µg/m³. Lý tưởng cho sáng sớm.',bg:'#f0fdf4',bd:'#bbf7d0',badge:'TỐT',bbg:'#dcfce7',btc:'#14532d'},
    {t:'07–09h',em:'⚠️',txt:`Giờ cao điểm giao thông – PM2.5 tăng lên ~${Math.round(parseFloat(peak0)*.85)} µg/m³. Sinh viên đến trường nên đeo khẩu trang.`,bg:'#fff7ed',bd:'#fed7aa',badge:'CHÚ Ý',bbg:'#ffedd5',btc:'#7c2d12'},
    {t:'10–15h',em:'😊',txt:'Gió giúp phát tán bụi – không khí cải thiện. Có thể ra sân trong giờ nghỉ.',bg:'#f0fdf4',bd:'#86efac',badge:'ỔN ĐỊNH',bbg:'#dcfce7',btc:'#14532d'},
    {t:'17–19h',em:'🚦',txt:`Tan học + giao thông cao điểm – PM2.5 tăng nhẹ ~${Math.round(parseFloat(peak0)*.6)} µg/m³. Về nhà sớm nếu nhạy cảm.`,bg:'#fefce8',bd:'#fde68a',badge:'THEO DÕI',bbg:'#fef9c3',btc:'#713f12'},
    {t:'20h+',em:'🌙',txt:'Không khí cải thiện sau giờ cao điểm. PM2.5 giảm đều. Thích hợp thông gió phòng ngủ.',bg:'#e0f4ff',bd:'#bae6fd',badge:'CẢI THIỆN',bbg:'#dbeafe',btc:'#1e3a8a'},
  ].map(r=>`
    <div class="tl-item" style="background:${r.bg};border-color:${r.bd}">
      <div class="tl-time">${r.t}</div>
      <div class="tl-icon">${r.em}</div>
      <div class="tl-text">${r.txt}</div>
      <div class="tl-badge" style="background:${r.bbg};color:${r.btc}">${r.badge}</div>
    </div>`).join('');

  document.getElementById('noticesWrap').innerHTML=[
    {em:'🏫',title:'Thông báo từ ULIS Air Shield',body:`Hôm nay PM2.5 trung bình khuôn viên: ${avg0} µg/m³ (Sân trường) · ${avg1} µg/m³ (Không gian mở). ${parseFloat(avg0)>35?'Khuyến nghị hạn chế hoạt động thể chất ngoài trời vào giờ cao điểm.':'Chất lượng không khí ở mức chấp nhận được trong hầu hết thời gian hôm nay.'}`,c:'#e0faf2',bd:'#6ee7b7'},
    {em:'🎓',title:'Lời khuyên cho sinh viên',body:`Hãy kiểm tra Air Shield trước khi ra ngoài. Thời điểm an toàn nhất hôm nay: ${parseFloat(avg0)<35?'buổi sáng sớm và chiều muộn sau 19h':'sau 20h tối khi PM2.5 giảm về mức thấp hơn'}. Chia sẻ app với bạn bè trong lớp nhé! 💚`,c:'#e0f4ff',bd:'#bae6fd'},
  ].map(n=>`
    <div class="notice" style="background:${n.c};border-color:${n.bd}">
      <div class="notice-emoji">${n.em}</div>
      <div><div class="notice-title">${n.title}</div><div class="notice-body">${n.body}</div></div>
    </div>`).join('');

  // Forecast chart
  const hist6=NODES[0].history.slice(-6);
  const fc=AI.forecast(NODES[0].history);
  const allL=[...Array.from({length:6},(_,i)=>`-${5-i}h`),...Array.from({length:6},(_,i)=>`+${i+1}h`)];
  if(fcChartInst) fcChartInst.destroy();
  fcChartInst=new Chart(document.getElementById('fcChart'),{
    type:'line',
    data:{labels:allL,datasets:[
      {data:[...hist6,...Array(6).fill(null)],borderColor:'#2dd4a0',backgroundColor:'rgba(45,212,160,.07)',fill:true,tension:.4,pointRadius:0,borderWidth:2,label:'Lịch sử'},
      {data:[...Array(5).fill(null),hist6[5],...fc],borderColor:'#fbbf24',backgroundColor:'transparent',borderDash:[5,3],tension:.4,pointRadius:3,pointBackgroundColor:'#fbbf24',borderWidth:2,label:'Dự báo AI'},
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{font:{size:9},color:'#9ca3af'},grid:{color:'rgba(0,0,0,.04)'}},
              y:{min:0,ticks:{font:{size:9},color:'#9ca3af'},grid:{color:'rgba(0,0,0,.04)'}}}}
  });
}

/* ─────────────────────────────────────────
   8. FULL TIPS SCREEN
───────────────────────────────────────── */
const TIPS_FULL=[
  {header:'🏃 Hoạt động & Ra ngoài',c:'#e0faf2',bd:'#6ee7b7',tc:'#065f46',items:[
    {em:'⏰',t:'Chọn giờ đi học hợp lý',b:'Đến trường trước 7h hoặc sau 9h để tránh giờ cao điểm giao thông. PM2.5 có thể cao gấp đôi trong khung 7–9h sáng.'},
    {em:'🚶',t:'Đi bộ nhanh thay chạy bộ',b:'Khi PM2.5 > 35, thở chậm hơn = hít ít bụi hơn. Đi bộ nhanh thay vì chạy bộ để bảo vệ phổi.'},
    {em:'🏊',t:'Ưu tiên hoạt động trong nhà',b:'Khi PM2.5 > 55, chuyển sang bơi lội (hồ bơi mái che), tập gym trong nhà, yoga, hoặc aerobic trong phòng.'},
    {em:'🌅',t:'Khung giờ vàng cho thể dục',b:'5–7h sáng và 19–21h tối là lúc PM2.5 thấp nhất. Lý tưởng cho chạy bộ, đạp xe, hoặc thư giãn sân trường.'},
  ]},
  {header:'😷 Khẩu trang & Bảo hộ',c:'#fff7ed',bd:'#fed7aa',tc:'#7c2d12',items:[
    {em:'🔬',t:'Chọn đúng loại khẩu trang',b:'PM2.5 > 12: Không cần\nPM2.5 > 35: Khẩu trang y tế 3 lớp\nPM2.5 > 55: N95 hoặc KF94 Hàn Quốc\nPM2.5 > 150: N95 + kính bảo hộ'},
    {em:'✅',t:'Đeo khẩu trang đúng cách',b:'Bóp sống mũi kim loại sát mặt · Kéo cạnh dưới xuống cằm · Không hở hai bên má. Đeo sai = không bảo vệ được!'},
    {em:'🔄',t:'Thay khẩu trang đúng lịch',b:'Y tế: dùng 4–8 giờ. N95: tối đa 5 lần nếu không bị ướt. Thấy khó thở hơn bình thường = đến lúc thay rồi!'},
    {em:'🚫',t:'Khẩu trang vải KHÔNG đủ',b:'Khẩu trang vải chỉ lọc được 30–50% hạt lớn. Với PM2.5, cần lớp lọc meltblown (N95/KF94) mới hiệu quả.'},
  ]},
  {header:'🏠 Bảo vệ không gian sống',c:'#e0f4ff',bd:'#bae6fd',tc:'#0c4a6e',items:[
    {em:'🌿',t:'Top 5 cây lọc không khí trong phòng',b:'1. Kim Tiền (Epipremnum)\n2. Trầu bà (Pothos)\n3. Lưỡi hổ (Snake Plant)\n4. Lan Ý (Peace Lily)\n5. Dương xỉ Boston'},
    {em:'🪟',t:'Chiến lược thông gió thông minh',b:'PM2.5 < 25: mở thoải mái\nPM2.5 25–55: mở 15–30 phút rồi đóng\nPM2.5 > 55: đóng toàn bộ, bật điều hoà\nKiểm tra Air Shield trước khi mở cửa!'},
    {em:'🧹',t:'Dọn phòng giảm bụi nội thất',b:'Dùng khăn ẩm thay chổi quét · Hút bụi thảm/rèm mỗi tuần · Giặt ga gối mỗi 2 tuần. Giảm 40% bụi tích tụ.'},
    {em:'💨',t:'Máy lọc không khí mini phòng KTX',b:'Máy lọc HEPA H13 bắt 99.97% hạt ≥ 0.3µm. Phòng 20–30m²: Xiaomi Mi Air Purifier, Levoit Core. Giá tầm 1–2 triệu.'},
  ]},
  {header:'🍎 Dinh dưỡng & Phục hồi',c:'#f5f3ff',bd:'#ddd6fe',tc:'#3b0764',items:[
    {em:'🥝',t:'Thực phẩm tăng sức đề kháng phổi',b:'Vitamin C: cam, ổi, ớt chuông\nVitamin E: hạt hướng dương, dầu ô liu\nOmega-3: cá hồi, hạt óc chó\nChống oxy hoá: trà xanh, nghệ, việt quất'},
    {em:'💧',t:'Uống đủ nước – không phải tuỳ hứng',b:'2–2.5 lít nước/ngày giúp màng nhầy đường hô hấp bẫy bụi hiệu quả hơn. Thêm mật ong + gừng + chanh vào nước ấm buổi sáng.'},
    {em:'🍵',t:'Thảo mộc bảo vệ đường hô hấp',b:'Trà gừng mật ong: giảm viêm, làm dịu cổ họng\nNước muối pha loãng: súc miệng sát khuẩn\nRửa mũi muối sinh lý: loại bụi mịn trong mũi'},
    {em:'😴',t:'Ngủ đủ giấc để phổi tự phục hồi',b:'Trong lúc ngủ phổi "tự dọn dẹp" bụi mịn hiệu quả nhất. Ngủ 7–8 tiếng · Tắt quạt hướng thẳng mặt · Dùng gối cao nhẹ.'},
  ]},
];

function renderFullTips() {
  document.getElementById('fullTipsWrap').innerHTML=TIPS_FULL.map(sec=>`
  <div class="tips-section">
    <div class="tips-section-header">${sec.header}</div>
    ${sec.items.map(it=>`
    <div class="tips-full-item" style="background:${sec.c};border-color:${sec.bd}">
      <div class="tfi-emoji">${it.em}</div>
      <div>
        <div class="tfi-title" style="color:${sec.tc}">${it.t}</div>
        <div class="tfi-body">${it.b}</div>
      </div>
    </div>`).join('')}
  </div>`).join('');
}

/* ─────────────────────────────────────────
   9. ABOUT SCREEN
───────────────────────────────────────── */
function renderAbout() {
  document.getElementById('aboutGridWrap').innerHTML=[
    {ic:'📡',t:'Cảm biến PMS7003',b:'Đo PM1.0, PM2.5, PM10 và số lượng hạt bụi theo kích thước. UART 9600bps, nguồn 5V, logic 3.3V TTL.'},
    {ic:'🧠',t:'AI Rule Engine',b:'Phân tích xu hướng, phát hiện vượt ngưỡng, dự báo PM2.5 bằng exponential smoothing.'},
    {ic:'📱',t:'PWA – Cài như app thật',b:'Mở Chrome → Add to Home Screen. Không cần App Store. Offline cache. Push notification.'},
    {ic:'🌱',t:'Mục tiêu cộng đồng',b:'Bảo vệ sức khỏe sinh viên ULIS. Mỗi node < 500k VNĐ, triển khai được mọi tòa nhà.'},
  ].map(c=>`
    <div class="about-card">
      <span class="about-card-icon">${c.ic}</span>
      <div class="about-card-title">${c.t}</div>
      <div class="about-card-body">${c.b}</div>
    </div>`).join('');

  document.getElementById('archWrap').innerHTML=[
    {em:'📡',t:'Lớp 1 – Thu thập IoT',c:'#e0faf2',bd:'#6ee7b7',dc:'#2dd4a0',tc:'#065f46',items:['PMS7003 × 2 node (Sân trường + KG mở)','ESP32 WiFi 2.4GHz · UART 9600bps','Active mode streaming mỗi 10 giây','HTTP POST hoặc MQTT publish','Biến môi trường vô hình thành data']},
    {em:'🧠',t:'Lớp 2 – AI & Phân tích',c:'#e0f4ff',bd:'#bae6fd',dc:'#38bdf8',tc:'#0c4a6e',items:['AQI scoring theo US EPA','Rule Engine 6 mức cảnh báo','Trend detection (tăng/giảm/ổn định)','Exponential smoothing forecast 6h','Auto-alert khi vượt ngưỡng']},
    {em:'⚡',t:'Lớp 3 – Hành động',c:'#fffbeb',bd:'#fde68a',dc:'#fbbf24',tc:'#713f12',items:['PWA Dashboard – cài trên điện thoại','Hướng dẫn cá nhân hoá theo AQI','Checklist đồ cần mang theo mức độ','Toast notification có emoji','Báo cáo + timeline sự kiện ngày']},
  ].map(l=>`
    <div class="arch-layer" style="background:${l.c};border-color:${l.bd}">
      <div class="arch-layer-title" style="color:${l.tc}">${l.em} ${l.t}</div>
      <div class="arch-items">
        ${l.items.map(it=>`<div class="arch-item"><div class="arch-dot" style="background:${l.dc}"></div>${it}</div>`).join('')}
      </div>
    </div>`).join('');

  document.getElementById('dataFlowWrap').innerHTML=`
  <div style="font-size:12px;font-weight:900;color:#1f2937;margin-bottom:14px">🔄 Luồng dữ liệu thật – từ sensor đến điện thoại</div>
  <div style="display:flex;flex-direction:column;gap:0">
    ${[
      {a:'PMS7003',b:'ESP32',desc:'UART Serial · 9600bps · Frame 32 bytes · parse PM1/PM2.5/PM10',arrow:'↓'},
      {a:'ESP32',b:'Internet',desc:'WiFi → HTTP POST "/api/sensor" · JSON payload · hoặc MQTT publish',arrow:'↓'},
      {a:'Server',b:'DB + AI',desc:'Node.js lưu vào Redis/Firebase · Chạy AI analysis · Phát WebSocket event',arrow:'↓'},
      {a:'WebSocket',b:'PWA',desc:'Browser nhận event → update UI tức thì · Không cần refresh trang',arrow:''},
    ].map(r=>`
    <div style="display:flex;gap:0;align-items:center">
      <div style="flex:1;padding:10px 12px;background:#f9fafb;border-radius:10px;border:1.5px solid #e5e7eb;margin:3px 0">
        <div style="font-size:10px;font-weight:800;color:#2dd4a0;margin-bottom:2px">${r.a} → ${r.b}</div>
        <div style="font-size:10px;font-weight:600;color:#6b7280">${r.desc}</div>
      </div>
    </div>
    ${r.arrow?`<div style="text-align:center;font-size:16px;color:#d1d5db;padding:2px 0">↓</div>`:''}`).join('')}
  </div>`;
}

/* ─────────────────────────────────────────
   10. NAVIGATION
───────────────────────────────────────── */
const SCREENS = ['home','sensors','report','tips','about'];
const INITED  = {};

function goTo(id, el) {
  SCREENS.forEach(s => {
    document.getElementById('sc-'+s).classList.remove('active');
    document.querySelector(`[data-nav="${s}"]`).classList.remove('active');
  });
  document.getElementById('sc-'+id).classList.add('active');
  el.classList.add('active');
  document.getElementById('mainArea').scrollTop = 0;

  if (!INITED[id]) {
    INITED[id] = true;
    if (id==='sensors') { renderSensorCards(); renderCmpChart(); renderHwGuide(); }
    if (id==='report')  { renderReport(); }
    if (id==='tips')    { renderFullTips(); }
    if (id==='about')   { renderAbout(); }
  }
}

function switchNode(idx, btn) {
  activeNode = idx;
  document.querySelectorAll('.node-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  renderHero(); renderDecision(); renderGear();
  const s = NODES[idx];
  const lv = AQI.level(s.reading.pm25);
  showToast(s.icon, `Đang xem: ${s.name}`, `PM2.5 = ${s.reading.pm25} µg/m³ · ${lv.lbl} ${lv.em}`, 'info');
}

/* ─────────────────────────────────────────
   11. TOAST SYSTEM
───────────────────────────────────────── */
const TOAST_THEME = {
  success:{c:'#f0fdf4',bd:'#bbf7d0'},
  warning:{c:'#fff7ed',bd:'#fed7aa'},
  danger: {c:'#fef2f2',bd:'#fecaca'},
  info:   {c:'#e0f4ff',bd:'#bae6fd'},
};

function showToast(emoji, title, body, type='info') {
  const th = TOAST_THEME[type] || TOAST_THEME.info;
  const id = 'ts'+Date.now();
  const el = document.createElement('div');
  el.className = 'toast';
  el.id = id;
  el.style.background = th.c;
  el.style.borderColor = th.bd;
  el.innerHTML = `<div class="toast-icon">${emoji}</div>
    <div style="flex:1"><div class="toast-title">${title}</div><div class="toast-body">${body}</div></div>
    <button class="toast-x" onclick="dismissToast('${id}')">×</button>`;
  document.getElementById('toast-root').appendChild(el);
  setTimeout(()=>dismissToast(id), 6000);
}

function dismissToast(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('out');
  setTimeout(()=>el.remove(), 250);
}

/* ─────────────────────────────────────────
   12. REAL-TIME SIMULATION
   Replace this with WebSocket in production:
   const ws = new WebSocket('ws://your-server/ws');
   ws.onmessage = e => { const d=JSON.parse(e.data); updateFromSensor(d); };
───────────────────────────────────────── */
function simulateNewReading() {
  NODES.forEach(s => {
    const last = s.history[s.history.length-1];
    const newVal = Math.max(2, +(last + (Math.random()-.4)*7).toFixed(1));
    s.history.push(newVal); s.history.shift();
    s.reading = makeReading(s.history);
    s.updated = 'vừa xong';
  });

  // Re-render home
  renderHero(); renderDecision(); renderGear();

  // Alert if dangerous spike
  const s = NODES[activeNode];
  const lv = AQI.level(s.reading.pm25);
  if (['unhealthy','very','hazardous'].includes(lv.k)) {
    showToast('⚠️', `Cảnh báo: ${s.name}`,
      `PM2.5 = ${s.reading.pm25} µg/m³ (${lv.lbl} ${lv.em}). Xem hướng dẫn bên dưới!`, 'danger');
    document.getElementById('reportBadge').style.display = 'block';
  }
}

/* ─────────────────────────────────────────
   13. PWA INSTALL PROMPT
───────────────────────────────────────── */
let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  document.getElementById('installBannerWrap').style.display = 'block';
});

document.getElementById('installBtn').addEventListener('click', () => {
  if (!deferredPrompt) {
    showToast('📱','Cài đặt thủ công','iOS: nhấn nút Chia sẻ → "Thêm vào màn hình chính"\nAndroid Chrome: menu 3 chấm → "Thêm vào màn hình chính"','info');
    return;
  }
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then(r => {
    if (r.outcome==='accepted') showToast('🎉','Đã cài app thành công!','Smart Campus Air Shield đã xuất hiện trên màn hình điện thoại của bạn 💚','success');
    deferredPrompt = null;
    document.getElementById('installBannerWrap').style.display = 'none';
  });
});

/* ─────────────────────────────────────────
   14. SERVICE WORKER REGISTER
───────────────────────────────────────── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(() => console.log('✅ Service Worker registered – PWA ready'))
    .catch(e => console.warn('SW reg failed:', e));
}

/* ─────────────────────────────────────────
   15. CLOCK
───────────────────────────────────────── */
function updateClock() {
  const now = new Date();
  document.getElementById('clkTime').textContent =
    now.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});
  const days=['CN','T2','T3','T4','T5','T6','T7'];
  document.getElementById('clkDate').textContent =
    `${days[now.getDay()]} ${now.getDate()}/${now.getMonth()+1}`;
}

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
renderHero(); renderDecision(); renderGear(); renderTipsHome(); renderThresh();
updateClock();
setInterval(updateClock, 1000);
setInterval(simulateNewReading, 15000); // mock 15s refresh

// Welcome toasts
setTimeout(() => {
  const s=NODES[0]; const lv=AQI.level(s.reading.pm25);
  showToast('🌿','Chào mừng đến Smart Campus Air Shield!',
    `Sân trường ULIS: PM2.5 = ${s.reading.pm25} µg/m³ · ${lv.lbl} ${lv.em}`,
    lv.k==='good'?'success':lv.k==='moderate'?'info':'warning');
}, 1200);

setTimeout(() => {
  const s=NODES[1]; const lv=AQI.level(s.reading.pm25);
  showToast(s.icon,'Không gian mở – Node B',
    `PM2.5 = ${s.reading.pm25} µg/m³ · ${lv.lbl} ${lv.em}`, 'info');
}, 3500);

// iOS install hint (no beforeinstallprompt on Safari)
const isIOS = /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());
const isInStandalone = window.navigator.standalone === true;
if (isIOS && !isInStandalone) {
  setTimeout(() => {
    showToast('📲','Cài app trên iPhone/iPad',
      'Nhấn nút Chia sẻ 📤 ở thanh dưới → chọn "Thêm vào màn hình chính" ← dùng được như app thật!','info');
  }, 5000);
}
