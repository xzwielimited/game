// SPDX-FileCopyrightText: 2026 Iron Fleet Developers
// SPDX-License-Identifier: AGPL-3.0-or-later

use crate::loader::LoadedAssets;
use crate::packer::{pack_items, PackItem};
use crate::schema::{CssSpriteSheet, SpriteGeo, UvSprite, UvSpriteSheet};
use image::codecs::png::{CompressionType, FilterType, PngEncoder};
use image::{ImageEncoder, Rgba, RgbaImage};
use std::fs::File;
use std::io::BufWriter;
use std::path::Path;

pub const DEFAULT_NORMAL_PIXEL: [u8; 4] = [127, 127, 255, 0]; // +Z flat normal with 0 altitude bump

pub struct AtlasOutput {
    pub color_atlas: RgbaImage,
    pub normal_atlas: RgbaImage,
    pub manifest: UvSpriteSheet,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum ItemRef {
    Sprite(usize),
    AnimFrame(usize, usize),
}

/// Generates the WebGL dual texture atlas and UV manifest from loaded assets.
pub fn generate_atlas(
    assets: &LoadedAssets,
    initial_width: u32,
    initial_height: u32,
    padding: u32,
    allow_grow: bool,
) -> Result<AtlasOutput, String> {
    let mut pack_items_list = Vec::new();

    for (s_idx, sprite) in assets.sprites.iter().enumerate() {
        pack_items_list.push(PackItem {
            id: ItemRef::Sprite(s_idx),
            width: sprite.color.width(),
            height: sprite.color.height(),
        });
    }

    for (a_idx, anim) in assets.animations.iter().enumerate() {
        for (f_idx, frame) in anim.frames.iter().enumerate() {
            pack_items_list.push(PackItem {
                id: ItemRef::AnimFrame(a_idx, f_idx),
                width: frame.color.width(),
                height: frame.color.height(),
            });
        }
    }

    if pack_items_list.is_empty() {
        return Err("No sprites or animation frames to pack".to_string());
    }

    let (width, height, packed) = pack_items(
        pack_items_list,
        initial_width,
        initial_height,
        padding,
        allow_grow,
    )?;

    let mut color_atlas = RgbaImage::from_pixel(width, height, Rgba([0, 0, 0, 0]));
    let mut normal_atlas = RgbaImage::from_pixel(width, height, Rgba(DEFAULT_NORMAL_PIXEL));
    let mut manifest = UvSpriteSheet::new();

    for packed_item in packed {
        let rect = packed_item.rect;
        match packed_item.id {
            ItemRef::Sprite(s_idx) => {
                let sprite = &assets.sprites[s_idx];
                copy_image_pixels(&sprite.color, &mut color_atlas, rect.x, rect.y);

                if let Some(ref normal) = sprite.normal {
                    copy_image_pixels(normal, &mut normal_atlas, rect.x, rect.y);
                }

                let uv = UvSprite::new(rect.x, rect.y, rect.w, rect.h, width, height);
                manifest.sprites.insert(sprite.name.clone(), uv);
            }
            ItemRef::AnimFrame(a_idx, f_idx) => {
                let anim = &assets.animations[a_idx];
                let frame = &anim.frames[f_idx];
                copy_image_pixels(&frame.color, &mut color_atlas, rect.x, rect.y);

                if let Some(ref normal) = frame.normal {
                    copy_image_pixels(normal, &mut normal_atlas, rect.x, rect.y);
                }

                let uv = UvSprite::new(rect.x, rect.y, rect.w, rect.h, width, height);
                manifest
                    .animations
                    .entry(anim.name.clone())
                    .or_default()
                    .push(uv);
            }
        }
    }

    Ok(AtlasOutput {
        color_atlas,
        normal_atlas,
        manifest,
        width,
        height,
    })
}

fn copy_image_pixels(src: &RgbaImage, dst: &mut RgbaImage, dst_x: u32, dst_y: u32) {
    for y in 0..src.height() {
        for x in 0..src.width() {
            let px = src.get_pixel(x, y);
            dst.put_pixel(dst_x + x, dst_y + y, *px);
        }
    }
}

/// Saves the atlas images and manifest to the specified directory.
pub fn save_atlas_to_dir<P: AsRef<Path>>(
    output: &AtlasOutput,
    dir: P,
) -> Result<(), Box<dyn std::error::Error>> {
    let dir = dir.as_ref();
    std::fs::create_dir_all(dir)?;

    let color_path = dir.join("sprites_webgl.png");
    let normal_path = dir.join("sprites_normal_webgl.png");
    let manifest_path = dir.join("sprites_webgl.json");

    save_png_fast(&output.color_atlas, &color_path)?;
    save_png_fast(&output.normal_atlas, &normal_path)?;

    let json_bytes = serde_json::to_vec(&output.manifest)?;
    std::fs::write(manifest_path, json_bytes)?;

    Ok(())
}

/// Fast PNG encoding with Fast compression level for snappy tool performance.
pub fn save_png_fast<P: AsRef<Path>>(
    img: &RgbaImage,
    path: P,
) -> Result<(), Box<dyn std::error::Error>> {
    let file = File::create(path)?;
    let writer = BufWriter::new(file);
    let encoder = PngEncoder::new_with_quality(writer, CompressionType::Fast, FilterType::NoFilter);
    encoder.write_image(
        img.as_raw(),
        img.width(),
        img.height(),
        image::ColorType::Rgba8,
    )?;
    Ok(())
}

/// Generates optional CSS preview spritesheet (for client/src/ui/sprites_css.json).
pub fn generate_css_spritesheet(
    assets: &LoadedAssets,
    css_width: u32,
    css_height: u32,
) -> Result<(RgbaImage, CssSpriteSheet), String> {
    let mut pack_items_list = Vec::new();

    // Scale thumbnails if necessary for CSS preview
    let mut thumbnails: Vec<(String, RgbaImage)> = Vec::new();
    for sprite in &assets.sprites {
        let max_dim = 160u32;
        let w = sprite.color.width();
        let h = sprite.color.height();
        let thumb = if w > max_dim || h > max_dim {
            let scale = (max_dim as f32 / w as f32).min(max_dim as f32 / h as f32);
            let tw = (w as f32 * scale).round().max(1.0) as u32;
            let th = (h as f32 * scale).round().max(1.0) as u32;
            image::imageops::resize(
                &sprite.color,
                tw,
                th,
                image::imageops::FilterType::Triangle,
            )
        } else {
            sprite.color.clone()
        };
        thumbnails.push((sprite.name.clone(), thumb));
    }

    for (idx, (_, thumb)) in thumbnails.iter().enumerate() {
        pack_items_list.push(PackItem {
            id: idx,
            width: thumb.width(),
            height: thumb.height(),
        });
    }

    let (width, height, packed) = pack_items(pack_items_list, css_width, css_height, 2, true)?;

    let mut css_atlas = RgbaImage::from_pixel(width, height, Rgba([0, 0, 0, 0]));
    let mut css_manifest = CssSpriteSheet::new(width, height);

    for packed_item in packed {
        let (name, thumb) = &thumbnails[packed_item.id];
        let rect = packed_item.rect;
        copy_image_pixels(thumb, &mut css_atlas, rect.x, rect.y);
        css_manifest.sprites.insert(
            name.clone(),
            SpriteGeo {
                x: rect.x,
                y: rect.y,
                width: rect.w,
                height: rect.h,
            },
        );
    }

    Ok((css_atlas, css_manifest))
}
