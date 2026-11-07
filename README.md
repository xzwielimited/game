# NavalCommand.io (Naval Warfare IO)

> **Commercial-Grade 2D/Pseudo-3D Top-Down Multiplayer Tactical Naval Combat Web Game**  
> Inspired by `mk48.io` — Clean-Room TypeScript & PixiJS v8 Architecture.

---

## ⚓ Giới Thiệu (Overview)

**NavalCommand.io** là tựa game hải chiến thời gian thực góc nhìn từ trên xuống (top-down), kết hợp đồ họa mô phỏng Pseudo-3D chất lượng cao, hệ thống thủy động lực học chân thực và cơ chế điều khiển trực quan theo chuẩn `mk48.io`.

### Các Tính Năng Nổi Bật:
1. **Hệ thống điều khiển Hybrid mượt mà:**
   - **Lái theo chuột (chuẩn `mk48.io`):** Con trỏ chuột chỉ đến đâu, tàu tự động bẻ lái mượt mà về hướng đó; khoảng cách chuột điều chỉnh mức ga tự động.
   - **Chế độ WASD tức thì:** Phím `[X]` hoặc nút trên HUD để chuyển sang lái bàn phím phản hồi ngay lập tức mà không bị ì ạch.
2. **Đồ họa Pseudo-3D đa tầng & Đại dương sống động:**
   - Thân tàu được vẽ nổi khối 3D với 7 tầng chi tiết (bóng đổ trên mặt biển, viền giáp bắt sáng, đài chỉ huy, tháp pháo 3D xoay theo hướng ngắm).
   - Mặt biển xanh đại dương tươi sáng với các gợn sóng phản quang và vệt bọt nước Kelvin rẽ sóng sau đuôi tàu.
   - Đảo 3D có bãi cát vàng, đồi cỏ và bóng đổ dưới nước.
   - Giàn khoan dầu (Oil Rig) với bãi đáp trực thăng bát giác `[H]`.
3. **Cơ chế chiến đấu & Vũ khí đa dạng:**
   - **Ô `[1]` Hải Pháo Chính:** Bắn pháo chính xác theo tâm ngắm chuột.
   - **Ô `[2]` Ngư Lôi Thẳng:** Phóng ngư lôi tốc độ cao theo hướng ngắm, không truy đuổi.
   - **Ô `[3]` Ngư Lôi Tự Dẫn (Acoustic Homing):** Tự động bẻ lái và khóa bám tàu địch trong bán kính 700m.
   - **Ô `[4]` Tên Lửa / Bom Chìm / Pháo Phòng Không:** Khắc chế máy bay và tàu ngầm.
   - **Nút `🔥 BẮN LIÊN THANH`:** Phím `Space` hoặc Chuột Phải để xả toàn bộ loạt đạn của vũ khí đang chọn.
4. **Cân bằng sinh tồn & Luồng Respawn:**
   - Khiên bất tử 4.0 giây (`SPAWN SHIELD`) khi vừa vào trận, chống bị dồn sát thương khi mới xuất hiện.
   - Bot xuất hiện ở cự ly an toàn 1.350m – 2.200m.
   - Bảng báo cáo thiệt hại và đồng hồ đếm ngược 5 giây khi chìm tàu.
5. **Giao diện Tiếng Việt 100%:**
   - Sảnh chờ chọn chế độ (`Hạm đội hỗn chiến`, `2 Hạm đội`), nhập tên và nút `Chơi`.
   - Bảng cây công nghệ tàu (`TÀU`), trang bị và bảng xếp hạng.
6. **Âm thanh Web Audio chân thực:**
   - Không bị tiếng ồn nền, chỉ phát âm thanh khi bắn pháo, phóng ngư lôi, nổ trúng đích và sonar.

---

## 🛠️ Cài Đặt & Chạy Cục Bộ (Getting Started)

### Yêu Cầu Hệ Thống:
- **Node.js** >= 18.x
- **npm** >= 9.x

### Hướng Dẫn:
```bash
# 1. Cài đặt các gói phụ thuộc
npm install

# 2. Khởi chạy máy chủ phát triển (Dev Server)
npm run dev
# Mở trình duyệt tại: http://localhost:3000

# 3. Chạy toàn bộ bộ kiểm thử tự động (277 tests)
npm test

# 4. Đóng gói bản phát hành sản phẩm (Production Build)
npm run build
```

---

## 🚢 Danh Mục Tàu Chiến (Ship Roster)
Bao gồm 28+ mẫu tàu chiến trải rộng trên 10 Cấp Độ (Tiers) và 8 Lớp Tàu chuyên biệt:
- **Coastal Patrol (Tuần tra duyên hải):** PT-109, Vosper MTB, Skjold Stealth...
- **Destroyer (Tàu khu trục):** Fletcher DD, Arleigh Burke DDG, Kolkata DDG...
- **Cruiser (Tàu tuần dương):** Moskva CG, Ticonderoga CG...
- **Battleship (Thiết giáp hạm):** HMS Dreadnought, Bismarck BB, Yamato BB...
- **Submarine (Tàu ngầm):** Type VII U-Boat, Skipjack SSN, Akula-II SSN...
- **Aircraft Carrier (Tàu sân bay):** Essex CV, Nimitz CVN...
- **Dredger / Icebreaker (Tàu cuốc & Phá băng):** Barents Dredger, Polaris Icebreaker...
- **Tactical Support (Tàu hậu cần & Cứu thương):** USNS Mercy Hospital Ship, Prometheus Tanker...

---

## 📄 Bản Quyền & Giấy Phép (License)
Dự án được xây dựng theo kiến trúc **Clean-Room** 100% nguyên bản, phát hành dưới giấy phép **MIT License**.
