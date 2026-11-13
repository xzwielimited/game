# NEXT_SESSION_HANDOFF — Tiến Trình & Kế Hoạch Phiên Làm Việc Tiếp Theo

> **Cập nhật lúc:** 2026-11-13 21:20 (UTC+7)
> **Workspace hiện tại:** `C:\Users\Administrator\.gemini\antigravity\scratch\game`
> **Repository GitHub:** `https://github.com/xzwielimited/game`

---

## 1. Môi Trường Máy Hiện Tại (Quick Start Cho AI Phiên Sau)

- **Node.js portable:** `C:\Users\Administrator\.gemini\tools\node` (v22.11.0)
- **Git portable:** `C:\Users\Administrator\.gemini\tools\git\cmd` (MinGit v2.47.0)
- **Luôn thêm vào đầu mọi lệnh PowerShell (Windows PowerShell 5.1 dùng `;` thay cho `&&`):**
```powershell
$env:PATH = "C:\Users\Administrator\.gemini\tools\node;C:\Users\Administrator\.gemini\tools\git\cmd;$env:PATH"
Set-Location "C:\Users\Administrator\.gemini\antigravity\scratch\game"
```
- **Chạy build + toàn bộ test (bắt buộc build trước để tạo `dist/` cho `clean_room_bundle.test.ts` & `adversarial_challenger_m8_2.test.ts`):**
```powershell
npm run build
if ($LASTEXITCODE -eq 0) { npx vitest run } else { exit $LASTEXITCODE }
```
- **Chạy dev server để test live trên trình duyệt:**
```powershell
npx vite --port 3000 --host
```

---

## 2. Những Gì Đã Hoàn Thành Tới Hiện Tại (Milestones M1 → M12)

### Trạng thái kiểm thử mới nhất:
- **`npm run build` (`tsc && vite build`)**: **0 lỗi**, đóng gói 762 modules, tổng `dist/` < 1 MB.
- **`npx vitest run`**: **26/26 test files PASS, 314/314 tests PASS**.

### Tóm tắt M10 → M12 vừa hoàn thiện:
1. **Milestone M10 (`tests/unit/m10_live_hud_interactions.test.ts`)**:
   - Đồng bộ thanh XP thực tế theo từng cấp (`SANDBOX_TIER_XP_THRESHOLDS` từ Level 1 đến Level 10) & tự động mở khóa tàu mới.
   - Bảng xếp hạng sống (`getLiveLeaderboard`), chọn/rời Hạm Đội kèm Hiệp ước không xâm phạm 15s (`joinOrLeaveFleet`), Chat Box có lọc thẻ HTML (`sendChatMessage`) & khóa hotkey khi đang gõ input, và Slot `[4]` hỗ trợ máy bay/nạo vét.
2. **Milestone M11 (`tests/unit/m11_mk48_authentic_graphics.test.ts`)**:
   - Bổ sung 4 đảo đa giác 8 đỉnh nằm trong vùng chiến sự `[-1500, +1500]` (giữ nguyên 3 đảo legacy `[0..2]`).
   - Server tự rải 24 hòm/thùng XP (`seedAmbientCrates`) và tự bổ sung khi dưới 15.
   - Sửa chồng lấn HUD bằng responsive CSS và tách `.tactical-kill-feed` xuống `top: 235px; right: 16px`.
3. **Milestone M12 (`tests/unit/m12_mk48_shader_hud_overhaul.test.ts`) — Tham chiếu trực tiếp từ `mk48.io`**:
   - **Biển sâu & Đảo 7 lớp Bathymetry (`pixi_renderer.ts`, `app.ts`)**: Màu biển xanh đậm `0x113a75`, rãnh sóng tối + đỉnh sóng lấp lánh, đảo có 3 tầng nước nông chuyển sắc + viền bọt sóng trắng + bóng đổ ngầm + bãi cát + 3 tầng địa hình ô-liu + 8 cụm cây ven biển mỗi đảo + 5 tảng băng Bắc Cực.
   - **Thùng dầu, Hòm gỗ, Ngư lôi 2 màu & Thủy lôi (`pixi_renderer.ts`, `wake_fx.ts`)**: Thùng dầu thép hình trụ có gân nổi & nắp đỏ; hòm gỗ nan chéo; ngư lôi thân bạc mũi đỏ kèm 5 bọt khí ziczac & tam giác xanh `▼`; thủy lôi gai 6 sừng có đèn kích nổ nhấp nháy đỏ; dải bọt sóng chân vịt dày đặc hơn.
   - **Chi tiết tàu 2.5D (`vector_hulls.ts`)**: Bóng đổ 2 lớp penumbra/umbra, nẹp mạn & chắn sóng mũi tàu, vạch ghép khoang boong, cửa gió buồng máy, rãnh chứa ngư lôi có đầu đạn đỏ lộ thiên trên tàu phóng lôi/khu trục, phao cứu sinh đỏ/trắng, bích neo, và cạnh vát 3D có ánh sáng trên thượng tầng.
   - **HUD nâng cấp & Cảnh báo mối đe dọa (`app.ts`, `hud_controller.ts`)**:
     * Thanh chọn tàu nhanh **`.mk48-upgrade-bar`** ngay dưới thanh XP với hình SVG nhìn từ trên xuống (`selectQuickUpgradeHull`, `getShipTopDownSvg`).
     * Ô nhập tên Hạm Đội tùy biến **`.mk48-fleet-name-input`** (`createOrJoinCustomFleet`) có lọc HTML & bảo vệ NAP 15s.
     * Thanh nạp đạn xanh lá (`.mk48-reload-fill`), dòng hướng dẫn tự mờ (`.mk48-tutorial-banner`), nút **`☰`** thu gọn HUD (`.mk48-hamburger-btn` / `toggleCompactMinimalHud`), và tam giác cảnh báo ngư lôi/tàu địch ở vòng bán kính 75m quanh tàu (`computeIncomingThreats`, `renderThreatIndicators`).

---

## 3. Lưu Ý Ràng Buộc Quan Trọng (Tuyệt Đối Không Phá Vỡ)

1. **Clean-Room Check (`tests/unit/clean_room_bundle.test.ts`)**: KHÔNG bao giờ viết chữ tên tác giả/tổ chức AGPL gốc hoặc chuỗi `GNU AFFERO GENERAL PUBLIC LICENSE` vào bất kỳ file `.ts`/`.html` nào trong `common/`, `server/`, `client/`.
2. **Turret Bounds (`tests/unit/adversarial_challenger_m8.test.ts`)**: Không được mở rộng kích thước bao ngoài của `ProceduralTurret.houseGraphics` và `barrelGraphics`.
3. **TopBar & KillFeed Position (`tests/unit/m10_*` & `m11_*`)**: Giữ mặc định `topBar.style.top = '28px'` và `KillFeed` ở `top: 235px; right: 16px` (trên màn hình desktop), giữ nguyên `DEFAULT_ISLAND_PRESETS[0..2]`.

---

## 4. Việc Cần Làm Cho Phiên Tiếp Theo (Milestone M13+ Roadmap)

1. **Custom WebGL Fragment Shaders (PixiJS v8 Filter / GLSL)** *(Ưu tiên #1 về đồ họa)*:
   - Viết GLSL fragment shader sạch (clean-room) cho mặt biển động theo thời gian (`uTime`, `uCamera`, `uZoom`) kết hợp normal-map chiếu sáng theo hướng mặt trời (`uSun`) và dải bọt sóng vỗ bờ tự động (`smoothstep` theo khoảng cách bờ đảo) thay cho chỉ dùng vector line hiện tại.
   - Thêm ánh sáng định hướng 3D mềm hơn (specular glint & soft shadow blur filter) cho tàu chiến khi zoom gần.
2. **Mở Rộng Danh Sách Tàu Chiến Lịch Sử Chuẩn `mk48.io` (`common/models/ships.ts` & `vector_hulls.ts`)**:
   - Bổ sung thêm các mẫu tàu nổi tiếng của `mk48.io`: **`G-5`** (Tier 1 MTB có máng phóng ngư lôi sau đuôi đặc trưng), **`Komar`** (tàu tên lửa nhỏ), **`Fairmile D`**, **`PT-20`**, **`Olympias`** (trireme cổ húc), **`Zubr`** (đệm khí đổ bộ), **`Iowa BB`**, **`Kirov CGN`**, **`Typhoon SSBN`** (tàu ngầm khổng lồ 20 ống tên lửa).
   - Thiết kế hình dáng Vector riêng biệt (custom hull/superstructure branch trong `vector_hulls.ts`) cho tàu đệm khí `Zubr` và `G-5` thay vì dùng chung khung `COASTAL_PATROL`.
3. **Màn Hình Kết Thúc / Thống Kê & Hệ Thống Quân Hàm (`client/src/hud/menus.ts`)**:
   - Nâng cấp bảng Hồi Sinh (Respawn Modal) theo đúng bố cục `mk48.io` (như đã ghi nhận ở `step_55_media_0.png`): Thống kê phiên (`Tàu đã đánh chìm`, `Tổng trọng tải`, `Số đạn đã bắn`, `Số phát trúng`, `Thùng đã thu`), **Quân hàm hiện tại -> Quân hàm kế tiếp (`Ensign` -> `Admiral`)** kèm huy hiệu SVG và tiến độ %.
4. **Multiplayer WebSocket Thật & Tối Ưu Vòng Đời Chiến Đấu (`server/netcode/ws_server.ts` & `client/src/netcode/binary_client.ts`)**:
   - Cho phép mở phòng chơi thật qua Node WebSocket (`npm run start:server` + client kết nối `ws://localhost:...`) với fallback mượt sang `localServer` offline nếu server chưa bật.
   - Bổ sung âm thanh nổ ngư lôi dưới nước trầm ấm hơn, hiệu ứng mảnh vỡ trôi nổi khi tàu chìm, và tối ưu AI Bot biết né đảo & thu thập thùng XP thông minh hơn.
