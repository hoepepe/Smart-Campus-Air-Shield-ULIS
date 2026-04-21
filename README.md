# Smart Campus Air Shield – ULIS

## Chạy ngay (không cần cài gì)

```bash
# Cách 1: Python (có sẵn trên mọi máy)
python3 -m http.server 3000
# → Mở http://localhost:3000

# Cách 2: Node.js
npx serve .
# → Mở link hiện ra

# Cách 3: VS Code Live Server
# Click chuột phải index.html → Open with Live Server
```

## Cấu trúc

```
smart-campus-air-shield/
├── index.html      # Skeleton HTML + nav
├── style.css       # Dark sci-fi theme
├── app.js          # Logic, data, charts
├── mock-api.json   # Mock data ESP32
└── README.md
```

## Kiến trúc hệ thống

```
PMS7003 Node A (Sân trường ULIS)
    ↓ UART 9600bps
  ESP32 ──WiFi──→ MQTT Broker / HTTP API
                        ↓
PMS7003 Node B (Không gian mở)      Cloud / Local Server
    ↓ UART 9600bps              ↓
  Arduino+ESP-01 ──→         app.js (fetch/MQTT)
                                   ↓
                            Dashboard Web
```

## Nối ESP32 thật

1. Flash ESP32 với code sau (Arduino IDE):

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <SoftwareSerial.h>

// PMS7003 kết nối: RX=GPIO16, TX=GPIO17
SoftwareSerial pmsSerial(16, 17);

const char* WIFI_SSID = "YOUR_SSID";
const char* WIFI_PASS = "YOUR_PASS";
const char* SERVER    = "http://YOUR_SERVER/api/sensor";
const char* NODE_ID   = "node-a"; // hoặc "node-b"

struct PMS7003Data { uint16_t pm1, pm25, pm10; };

PMS7003Data readPMS() {
  // Parse 32-byte frame từ PMS7003
  uint8_t buf[32];
  PMS7003Data d = {0,0,0};
  if (pmsSerial.available() >= 32) {
    if (pmsSerial.read() == 0x42 && pmsSerial.read() == 0x4D) {
      pmsSerial.readBytes(buf, 30);
      d.pm1  = (buf[2] << 8) | buf[3];
      d.pm25 = (buf[4] << 8) | buf[5];
      d.pm10 = (buf[6] << 8) | buf[7];
    }
  }
  return d;
}

void loop() {
  PMS7003Data d = readPMS();
  if (d.pm25 > 0) {
    HTTPClient http;
    http.begin(SERVER);
    http.addHeader("Content-Type", "application/json");
    String body = "{\"node\":\"" + String(NODE_ID) + "\","
                  "\"pm1\":" + d.pm1 + ","
                  "\"pm25\":" + d.pm25 + ","
                  "\"pm10\":" + d.pm10 + "}";
    http.POST(body);
    http.end();
  }
  delay(10000); // Gửi mỗi 10 giây
}
```

2. Trong app.js, thay `refreshData()` bằng:

```javascript
async function fetchRealData() {
  const res = await fetch('/api/readings');
  const data = await res.json();
  SENSORS[0].reading = { ...SENSORS[0].reading, ...data['node-a'] };
  SENSORS[1].reading = { ...SENSORS[1].reading, ...data['node-b'] };
  renderHeroCards();
  updateMetricsRow();
}
setInterval(fetchRealData, 10000);
```

## Nâng cấp Firebase (tuỳ chọn)

```javascript
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';

const db = getDatabase(initializeApp({ databaseURL: 'YOUR_URL' }));

// Real-time listener
onValue(ref(db, 'sensors'), (snapshot) => {
  const data = snapshot.val();
  SENSORS[0].reading = data['node-a'];
  SENSORS[1].reading = data['node-b'];
  renderHeroCards();
});
```

## Màn hình

| Screen | Mục đích |
|---|---|
| Dashboard | Tổng quan 2 node, biểu đồ live, AI insight |
| Cảm biến | Chi tiết PM1/PM2.5/PM10, số lượng hạt, mini chart |
| Lịch sử | 24h / 7 ngày / 30 ngày, thống kê đỉnh/trung bình |
| AI Dự báo | Forecast 6h tới, Rule Engine, Kiến trúc 3 lớp |
| Cảnh báo | Log sự kiện vượt ngưỡng, khuyến nghị hành động |
| Dự án | Giới thiệu Smart Campus Air Shield cho ban GK |
