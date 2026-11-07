# CONTEXT_DEV: Tóm Tắt Toàn Bộ Bối Cảnh Phát Triển NavalCommand.io

> **Thời điểm cập nhật:** 2026-11-07 17:50:00  
> **Trạng thái hệ thống:** Hoàn thiện **100% tất cả các Milestones (M1 → M5 & Final Audit)**. Toàn bộ **13/13 bộ kiểm thử tự động (132/132 tests: Unit, Boundary, Adversarial, 10,000-tick Stability, Multi-Client Binary Netcode Integration & Clean-Room Bundle Audit)** đều **PASS 100%**, `tsc --noEmit` đạt **0 lỗi**, bản build WebGL sản phẩm (`dist/`) đạt dung lượng siêu nhẹ **~692 KB (< 0.7 MB, giới hạn yêu cầu < 15 MB)**.

---

## 1. Kiến Trúc & Tính Năng Đã Hoàn Thiện (100% Clean-Room)

### A. Milestone M1: Thủy Động Lực Học 2D, 4 Quần Xã Địa Hình & Danh Mục 28 Tàu Chiến (10 Tiers / 8 Classes)
- [`common/math/vector2.ts`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/common/math/vector2.ts) & [`common/math/polygon.ts`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/common/math/polygon.ts): Toán học Vector 2D và kiểm tra va chạm đa giác tách trục SAT (Separating Axis Theorem) có lọc cạnh suy biến.
- [`common/models/ships.ts`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/common/models/ships.ts): Định nghĩa đầy đủ **28 tàu chiến** qua **10 cấp độ (Tier 1–10)** và **8 lớp tàu** (Tàu tuần tra/phóng lôi, Khu trục hạm, Tuần dương hạm, Thiết giáp hạm, Tàu ngầm hạt nhân, Tàu sân bay, Tàu phá băng & Tàu vét bùn, và Tàu hỗ trợ chiến thuật: Tàu bệnh viện *Mercy*, Tàu chở dầu, Tàu công binh xây giàn khoan).
- [`common/simulation/hydrodynamics.ts`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/common/simulation/hydrodynamics.ts), [`terrain_engine.ts`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/common/simulation/terrain_engine.ts), [`resource_engine.ts`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/common/simulation/resource_engine.ts): Mô phỏng lực tiến/dạt ngang (Surge/Sway), góc trượt lái $\beta = \arctan(w/u)$, mắc cạn theo mớn nước (Shallow Water), mài mòn băng Bắc Cực (Arctic Ice), thùng XP trôi dạt và giàn khoan dầu (Oil Rig).

### B. Milestone M2: 10 Hệ Thống Vũ Khí & Khí Tài Chuyên Biệt
- [`common/models/weapons.ts`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/common/models/weapons.ts) & [`common/simulation/weapon_kinematics.ts`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/common/simulation/weapon_kinematics.ts):
  1. Pháo hải quân (`ARTILLERY`) có góc bắn tháp pháo, quỹ đạo parabol và elip tản mát Gauss.
  2. Ngư lôi chạy thẳng & tự dẫn âm học (`TORPEDO`, góc dò $\pm 35^\circ$, khoảng cách kích hoạt 300m) + Mồi nhử âm học (`torpedo_decoy` 120 dB).
  3. Tên lửa hành trình (`CRUISE_MISSILE`, 3 pha Boost/Midcourse/Terminal, tự động cắt dẫn bắn nếu tàu ngầm lặn sâu dưới độ sâu kính tiềm vọng $-5.0\text{m}$).
  4. Pháo phản lực phóng loạt (`ROCKET_BARRAGE` RBU-6000).
  5. Ngư lôi tên lửa (`ROCKET_TORPEDO` ASROC bay trên không $\to$ đáp mặt nước $\to$ dò tìm âm học dưới nước).
  6. Tên lửa phòng không & Pháo phòng thủ điểm (`SAM_CIWS` RIM-162 ESSM & Phalanx 20mm).
  7. Mìn sâu săn ngầm (`DEPTH_CHARGE`, tốc độ chìm $3.5\text{ m/s}$, ngòi nổ thủy tĩnh & từ tính 3D).
  8. Thủy lôi (`NAVAL_MINE`, trễ kích hoạt 5s, nổ khi chạm vỏ hoặc cảm ứng từ ở tốc độ $\ge 15\text{ kt}$).
  9. Phi đội máy bay cường kích & Trực thăng săn ngầm (`AIRCRAFT_SQUADRON`) thả Phao thủy âm (`SonarBuoyEntity`, bán kính $1,200\text{m}$, tồn tại $75\text{s}$).
  10. Cần cẩu nạo vét luồng sâu $15\text{m}$ & bồi đắp bãi cạn $2\text{m}$ (`DREDGER_TOOL`).

### C. Milestone M3: Cảm Biến 3 Tầng, Cân Bằng Săn Ngầm (ASW), Tác Chiến Điện Tử (ECM), Chống Phản Bội Hạm Đội & 3 Chế Độ Chơi
- [`common/sensors/sensor_suite.ts`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/common/sensors/sensor_suite.ts):
  - **Visual, Radar & Sonar**: Raycast kiểm tra đảo che khuất; tiếng ồn xâm thực $Noise_{cav} = (v - V_{cav})^{2.5}$; Sonar chủ động phát hiện tàu ngầm nhưng làm lộ vị trí tàu phát ở khoảng cách $2\times$; Máy trạng thái 5 mức độ tin cậy mục tiêu (`UNDETECTED` $\to$ `LOCKED_TARGET`).
  - **Luật cân bằng Tàu ngầm & Máy bay**: Độ trễ Lặn/Nổi 4–6s chống nhấp nhả; chế độ **Stealth Cruise** giới hạn tốc độ dưới ngưỡng bọt khí; máy bay bay nhanh không thể tự phát hiện tàu ngầm lặn sâu chạy êm nếu không giảm tốc/bay treo thả **Phao thủy âm (Sonar Buoy)**.
  - **ECM Jamming & Tàu bệnh viện Mercy**: ECM kích hoạt 5s / hồi chiêu 25s (giảm 60% tầm phát hiện radar của địch và làm lệch 85% tên lửa tự dẫn); Tàu bệnh viện lớp *Mercy* hồi 50% máu tối đa cho đồng đội trong bán kính 250m (hồi chiêu 30s).
- [`common/models/fleet.ts`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/common/models/fleet.ts): Quản lý tối đa 5 hạm đội hiển thị, bộ đếm **Hiệp ước Không Xâm phạm 15 giây (15s NAP)** chặn 100% sát thương hai chiều khi rời đội/bị kích, và hệ thống **Karma** đổi màu tên cảnh báo/phản bội (`LOYAL` $\to$ `SUSPECT` $\to$ `TRAITOR`).
- [`common/models/game_modes.ts`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/common/models/game_modes.ts):
  1. **Free-For-All / Fleet Sandbox (`FFA_SANDBOX`)**: Đường cong XP chuẩn (T7: 630 XP, T8: 940 XP, T9: 1,430 XP).
  2. **King of the Hill & Convoy Escort (`KOTH_CONVOY`)**: Ván đấu 15 phút (900s) chiếm cứ điểm trung tâm và hộ tống/đánh chặn đoàn tàu chở dầu AI.
  3. **1v1 Private Battle Arena (`DUEL_ARENA`)**: Thách đấu 1v1, dịch chuyển tức thời vào đấu trường biệt lập (vẫn giữ kết nối kênh chat toàn cục), thưởng XP cho người thắng và trả về đúng tọa độ cũ trên bản đồ chính.

### D. Milestone M4: Máy Chủ Xác Thực 20Hz, Giao Thức Nhị Phân 28-Byte, AI Bots & Tùy Biến Trang Bị
- [`common/protocol/serializer.ts`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/common/protocol/serializer.ts) & [`server/netcode/ws_server.ts`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/server/netcode/ws_server.ts): Máy chủ WebSocket nhị phân (`ArrayBuffer` / `DataView`) đóng gói 28 byte/tàu ở tần số 20 Hz.
- [`server/progression/tech_tree_service.ts`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/server/progression/tech_tree_service.ts) & [`server/progression/loadout_validator.ts`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/server/progression/loadout_validator.ts): Mở khóa cây công nghệ 10 cấp có chữ ký chống gian lận SHA-256, tùy biến 4 khe vũ khí/mô-đun chiến thuật (SAM, CIWS, RBU-6000, Sonar kéo theo, ECM Pod) và 4 bộ ngụy trang (`HAZE_GREY`, `DAZZLE`, `ARCTIC_SPLINTER`, `STEALTH_CARBON`).

### E. Milestone M5: WebGL Vector Client (`PixiJS v8`), Tactical HUD & Web Audio Synthesizer
- [`client/index.html`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/client/index.html), [`client/src/main.ts`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/client/src/main.ts), [`client/src/app.ts`](file:///C:/Users/Administrator/Downloads/NavalCommand_SourceCode_20261025/client/src/app.ts): Tích hợp toàn diện đồ họa Vector 2D WebGL, tháp pháo xoay có giật nòng, sóng rẽ nước Kelvin, vòng cảm biến & quạt góc bắn, Minimap tương tác, Kill Feed, bảng điều khiển Vũ khí/Lặn/Stealth/ECM, Menu Cây công nghệ `[T]`, Loadout `[L]`, Ngụy trang `[C]`, chuyển chế độ chơi `[M]` và bộ tổng hợp âm thanh Web Audio API.

---

## 2. Hướng Dẫn Chạy Kiểm Thử & Trải Nghiệm Trò Chơi

### Chạy toàn bộ 132 bài kiểm thử tự động:
```powershell
$env:PATH = "C:\Program Files\nodejs;$env:PATH"
cd C:\Users\Administrator\Downloads\NavalCommand_SourceCode_20261025
npx vitest run
```

### Khởi chạy Web Client (Vite Dev Server) để chơi ngay trên trình duyệt:
```powershell
$env:PATH = "C:\Program Files\nodejs;$env:PATH"
cd C:\Users\Administrator\Downloads\NavalCommand_SourceCode_20261025
npm run dev
```
*(Truy cập `http://localhost:3000` để điều khiển chiến hạm giao tranh cùng 12 AI Bots thông minh).*
