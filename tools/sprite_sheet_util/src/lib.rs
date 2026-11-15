// SPDX-FileCopyrightText: 2026 Iron Fleet Developers
// SPDX-License-Identifier: AGPL-3.0-or-later

pub mod atlas;
pub mod loader;
pub mod packer;
pub mod schema;

pub use atlas::{generate_atlas, generate_css_spritesheet, save_atlas_to_dir, AtlasOutput};
pub use loader::{load_assets, LoadedAssets, LoadedSprite};
pub use packer::{pack_items, GuillotinePacker, PackItem, PackedItem, Rect};
pub use schema::{CssSpriteSheet, SpriteGeo, UvSprite, UvSpriteSheet};

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    #[test]
    fn test_rect_packer_no_overlap() {
        let mut packer = GuillotinePacker::new(512, 512);
        let sizes = [
            (100, 50),
            (60, 80),
            (120, 30),
            (40, 40),
            (200, 100),
            (80, 60),
            (50, 120),
            (70, 70),
            (30, 90),
            (110, 45),
        ];

        let mut placed_rects = Vec::new();
        for (w, h) in sizes {
            if let Some(rect) = packer.insert(w, h) {
                // Ensure placed rect is inside bounds
                assert!(rect.x + rect.w <= 512);
                assert!(rect.y + rect.h <= 512);

                // Ensure it does not intersect any previously placed rect
                for other in &placed_rects {
                    assert!(
                        !rect.intersects(other),
                        "Rect {:?} intersects with {:?}",
                        rect,
                        other
                    );
                }
                placed_rects.push(rect);
            }
        }
        assert_eq!(placed_rects.len(), sizes.len());
    }

    #[test]
    fn test_uv_coordinates_counter_clockwise_orientation() {
        // Sprite at (100, 200) with size 50x40 on a 1000x1000 canvas
        let uv = UvSprite::new(100, 200, 50, 40, 1000, 1000);

        // A (pos.x, pos.y + dim.y) -> [100, 240] / 1000 = [0.1, 0.24]
        assert!((uv.uvs[0][0] - 0.1).abs() < 1e-6);
        assert!((uv.uvs[0][1] - 0.24).abs() < 1e-6);

        // B (pos.x + dim.x, pos.y + dim.y) -> [150, 240] / 1000 = [0.15, 0.24]
        assert!((uv.uvs[1][0] - 0.15).abs() < 1e-6);
        assert!((uv.uvs[1][1] - 0.24).abs() < 1e-6);

        // C (pos.x + dim.x, pos.y) -> [150, 200] / 1000 = [0.15, 0.20]
        assert!((uv.uvs[2][0] - 0.15).abs() < 1e-6);
        assert!((uv.uvs[2][1] - 0.20).abs() < 1e-6);

        // D (pos.x, pos.y) -> [100, 200] / 1000 = [0.1, 0.20]
        assert!((uv.uvs[3][0] - 0.1).abs() < 1e-6);
        assert!((uv.uvs[3][1] - 0.20).abs() < 1e-6);

        // Aspect ratio: width / height = 50 / 40 = 1.25
        assert!((uv.aspect - 1.25).abs() < 1e-6);

        // Verify counter-clockwise orientation:
        // A -> B: +X
        assert!(uv.uvs[1][0] > uv.uvs[0][0]);
        assert_eq!(uv.uvs[1][1], uv.uvs[0][1]);
        // B -> C: -Y (towards top in screen space)
        assert!(uv.uvs[2][1] < uv.uvs[1][1]);
        assert_eq!(uv.uvs[2][0], uv.uvs[1][0]);
        // C -> D: -X
        assert!(uv.uvs[3][0] < uv.uvs[2][0]);
        assert_eq!(uv.uvs[3][1], uv.uvs[2][1]);
        // D -> A: +Y
        assert!(uv.uvs[0][1] > uv.uvs[3][1]);
        assert_eq!(uv.uvs[0][0], uv.uvs[3][0]);
    }

    #[test]
    fn test_schema_serialization_and_deserialization() {
        let mut sheet = UvSpriteSheet::new();
        sheet.sprites.insert(
            "ArleighBurke".to_string(),
            UvSprite::new(0, 0, 769, 99, 4096, 2048),
        );
        sheet.sprites.insert(
            "Yamato".to_string(),
            UvSprite::new(1000, 500, 1005, 153, 4096, 2048),
        );
        sheet.animations.insert(
            "explosion".to_string(),
            vec![
                UvSprite::new(0, 100, 64, 64, 4096, 2048),
                UvSprite::new(70, 100, 64, 64, 4096, 2048),
            ],
        );

        let json = serde_json::to_string(&sheet).expect("Serialization failed");
        assert!(json.contains("\"sprites\":"));
        assert!(json.contains("\"ArleighBurke\":"));
        assert!(json.contains("\"Yamato\":"));
        assert!(json.contains("\"animations\":"));
        assert!(json.contains("\"explosion\":"));

        let deserialized: UvSpriteSheet =
            serde_json::from_str(&json).expect("Deserialization failed");
        assert_eq!(deserialized, sheet);
    }

    #[test]
    fn test_atlas_dimensions_and_normal_default() {
        let mut color = RgbaImage::new(100, 50);
        for p in color.pixels_mut() {
            *p = Rgba([255, 0, 0, 255]);
        }

        let sprite = LoadedSprite {
            name: "TestShip".to_string(),
            color,
            normal: None,
        };

        let assets = LoadedAssets {
            sprites: vec![sprite],
            animations: Vec::new(),
        };

        let output = generate_atlas(&assets, 512, 256, 2, false).expect("Atlas generation failed");

        // Assert dimensions match exactly
        assert_eq!(output.color_atlas.width(), output.normal_atlas.width());
        assert_eq!(output.color_atlas.height(), output.normal_atlas.height());
        assert_eq!(output.width, 512);
        assert_eq!(output.height, 256);

        // Power of two check
        assert_eq!(output.width & (output.width - 1), 0);
        assert_eq!(output.height & (output.height - 1), 0);

        // Normal background pixel should be [127, 127, 255, 0]
        let bg_normal = output.normal_atlas.get_pixel(0, 0);
        assert_eq!(bg_normal.0, atlas::DEFAULT_NORMAL_PIXEL);
    }

    #[test]
    fn test_pack_items_power_of_two_growth() {
        // Create 20 items of size 100x100
        let items: Vec<PackItem<usize>> = (0..20)
            .map(|i| PackItem {
                id: i,
                width: 100,
                height: 100,
            })
            .collect();

        // Start with 256x256 (too small for 20 items of 100x100)
        let (w, h, packed) = pack_items(items, 256, 256, 2, true).expect("Pack with growth failed");

        assert_eq!(packed.len(), 20);
        // Dimensions must be power of two
        assert_eq!(w & (w - 1), 0);
        assert_eq!(h & (h - 1), 0);
        // Must have grown larger than 256x256
        assert!(w * h > 256 * 256);
    }
}
