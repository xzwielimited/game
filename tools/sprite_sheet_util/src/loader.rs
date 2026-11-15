// SPDX-FileCopyrightText: 2026 Iron Fleet Developers
// SPDX-License-Identifier: AGPL-3.0-or-later

use image::RgbaImage;
use std::fs;
use std::path::{Path, PathBuf};

pub struct LoadedSprite {
    pub name: String,
    pub color: RgbaImage,
    pub normal: Option<RgbaImage>,
}

pub struct LoadedAnimation {
    pub name: String,
    pub frames: Vec<LoadedAnimationFrame>,
}

pub struct LoadedAnimationFrame {
    pub frame_name: String,
    pub color: RgbaImage,
    pub normal: Option<RgbaImage>,
}

pub struct LoadedAssets {
    pub sprites: Vec<LoadedSprite>,
    pub animations: Vec<LoadedAnimation>,
}

/// Discovers and loads sprite pairs, standalone 2D sprites, and animation sequences.
pub fn load_assets<P: AsRef<Path>>(input_paths: &[P]) -> Result<LoadedAssets, String> {
    let mut sprites = Vec::new();
    let mut animations = Vec::new();

    for p in input_paths {
        let path = p.as_ref();
        if !path.exists() {
            return Err(format!("Input path does not exist: {}", path.display()));
        }

        if path.is_file() {
            if is_png(path) {
                let name = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("sprite")
                    .to_string();
                let img = image::open(path)
                    .map_err(|e| format!("Failed to read image {}: {}", path.display(), e))?
                    .to_rgba8();
                sprites.push(LoadedSprite {
                    name,
                    color: img,
                    normal: None,
                });
            }
        } else if path.is_dir() {
            process_directory(path, &mut sprites, &mut animations)?;
        }
    }

    if sprites.is_empty() && animations.is_empty() {
        return Err("No valid sprites or models found in input directory".to_string());
    }

    // Sort sprites deterministically by name
    sprites.sort_by(|a, b| a.name.cmp(&b.name));
    animations.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(LoadedAssets {
        sprites,
        animations,
    })
}

fn is_png(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("png"))
        .unwrap_or(false)
}

fn process_directory(
    dir: &Path,
    sprites: &mut Vec<LoadedSprite>,
    animations: &mut Vec<LoadedAnimation>,
) -> Result<(), String> {
    let dir_name = dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory {}: {}", dir.display(), e))?;

    let mut sub_dirs = Vec::new();
    let mut png_files = Vec::new();

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_dir() {
            sub_dirs.push(entry_path);
        } else if entry_path.is_file() && is_png(&entry_path) {
            png_files.push(entry_path);
        }
    }

    sub_dirs.sort();
    png_files.sort();

    // Check if THIS directory directly contains a model pair (color*.png and normal*.png)
    let color_file = png_files.iter().find(|p| {
        p.file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase().starts_with("color"))
            .unwrap_or(false)
    });

    let normal_file = png_files.iter().find(|p| {
        p.file_stem()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase().starts_with("normal"))
            .unwrap_or(false)
    });

    if let Some(c_path) = color_file {
        let color_img = image::open(c_path)
            .map_err(|e| format!("Failed to open color image {}: {}", c_path.display(), e))?
            .to_rgba8();

        let normal_img = if let Some(n_path) = normal_file {
            let n_img = image::open(n_path)
                .map_err(|e| format!("Failed to open normal image {}: {}", n_path.display(), e))?
                .to_rgba8();

            if color_img.dimensions() != n_img.dimensions() {
                return Err(format!(
                    "Sprite dimension mismatch for '{}': color is {}x{}, but normal is {}x{}",
                    dir_name,
                    color_img.width(),
                    color_img.height(),
                    n_img.width(),
                    n_img.height()
                ));
            }
            Some(n_img)
        } else {
            None
        };

        sprites.push(LoadedSprite {
            name: dir_name,
            color: color_img,
            normal: normal_img,
        });

        return Ok(());
    }

    // If not a direct model pair, check subdirectories
    for sub in &sub_dirs {
        let sub_name = sub
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let sub_entries = fs::read_dir(sub)
            .map_err(|e| format!("Failed to read subdirectory {}: {}", sub.display(), e))?;

        let mut sub_pngs = Vec::new();
        for entry in sub_entries.flatten() {
            let p = entry.path();
            if p.is_file() && is_png(&p) {
                sub_pngs.push(p);
            }
        }
        sub_pngs.sort();

        let sub_color = sub_pngs.iter().find(|p| {
            p.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_ascii_lowercase().starts_with("color"))
                .unwrap_or(false)
        });

        let sub_normal = sub_pngs.iter().find(|p| {
            p.file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_ascii_lowercase().starts_with("normal"))
                .unwrap_or(false)
        });

        if let Some(c_path) = sub_color {
            // Model pair in subdirectory
            let color_img = image::open(c_path)
                .map_err(|e| format!("Failed to open color image {}: {}", c_path.display(), e))?
                .to_rgba8();

            let normal_img = if let Some(n_path) = sub_normal {
                let n_img = image::open(n_path)
                    .map_err(|e| format!("Failed to open normal image {}: {}", n_path.display(), e))?
                    .to_rgba8();

                if color_img.dimensions() != n_img.dimensions() {
                    return Err(format!(
                        "Sprite dimension mismatch for '{}': color is {}x{}, but normal is {}x{}",
                        sub_name,
                        color_img.width(),
                        color_img.height(),
                        n_img.width(),
                        n_img.height()
                    ));
                }
                Some(n_img)
            } else {
                None
            };

            sprites.push(LoadedSprite {
                name: sub_name,
                color: color_img,
                normal: normal_img,
            });
        } else if !sub_pngs.is_empty() {
            // Animation sequence in subdirectory (e.g. explosion/explosion01.png ... or splash/)
            let mut frames = Vec::with_capacity(sub_pngs.len());
            for p in &sub_pngs {
                let frame_name = p
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("frame")
                    .to_string();
                let color_img = image::open(p)
                    .map_err(|e| format!("Failed to open animation frame {}: {}", p.display(), e))?
                    .to_rgba8();
                frames.push(LoadedAnimationFrame {
                    frame_name,
                    color: color_img,
                    normal: None,
                });
            }
            animations.push(LoadedAnimation {
                name: sub_name,
                frames,
            });
        }
    }

    // Any loose PNG files in this directory that aren't color/normal
    for p in &png_files {
        let stem = p
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("sprite")
            .to_string();
        let stem_lower = stem.to_ascii_lowercase();
        if !stem_lower.starts_with("color") && !stem_lower.starts_with("normal") {
            let img = image::open(p)
                .map_err(|e| format!("Failed to open sprite {}: {}", p.display(), e))?
                .to_rgba8();
            sprites.push(LoadedSprite {
                name: stem,
                color: img,
                normal: None,
            });
        }
    }

    Ok(())
}
