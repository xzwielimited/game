// SPDX-FileCopyrightText: 2026 Iron Fleet Developers
// SPDX-License-Identifier: AGPL-3.0-or-later

use sprite_sheet_util::atlas::{
    generate_atlas, generate_css_spritesheet, save_atlas_to_dir, save_png_fast,
};
use sprite_sheet_util::loader::load_assets;
use std::env;
use std::path::{Path, PathBuf};
use std::process;

fn print_help() {
    println!("sprite_sheet_util - Iron Fleet spritesheet packing tool");
    println!();
    println!("USAGE:");
    println!("    sprite_sheet_util [OPTIONS] --input <PATH> --output <PATH>");
    println!();
    println!("OPTIONS:");
    println!("    -i, --input <PATH>               Input directory containing rendered 3D ship models and/or 2D sprites (can be specified multiple times)");
    println!("    -o, --output <PATH>              Output directory for generated WebGL spritesheet and UV manifest");
    println!("    -m, --models <PATH>              Directory of rendered 3D models (e.g. assets/models/rendered)");
    println!("    -s, --sprites <PATH>             Directory of 2D sprites (e.g. assets/sprites)");
    println!("        --output-client-data <PATH>  Output directory for client/data/ (writes sprites_webgl.png, sprites_normal_webgl.png)");
    println!("        --output-client-src <PATH>   Output directory for client/src/ (writes sprites_webgl.json)");
    println!("        --width <U32>                Atlas width in pixels (power of two, default: 4096)");
    println!("        --height <U32>               Atlas height in pixels (power of two, default: 2048)");
    println!("        --padding <U32>              Padding around packed sprites in pixels (default: 2)");
    println!("        --css                        Generate CSS preview spritesheet (sprites_css.png and sprites_css.json)");
    println!("    -h, --help                       Show this help message");
}

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.len() <= 1 || args.iter().any(|a| a == "-h" || a == "--help") {
        print_help();
        return;
    }

    let mut input_paths: Vec<PathBuf> = Vec::new();
    let mut output_dir: Option<PathBuf> = None;
    let mut output_client_data: Option<PathBuf> = None;
    let mut output_client_src: Option<PathBuf> = None;
    let mut width: u32 = 4096;
    let mut height: u32 = 2048;
    let mut padding: u32 = 2;
    let mut generate_css: bool = false;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "-i" | "--input" => {
                i += 1;
                if i < args.len() {
                    input_paths.push(PathBuf::from(&args[i]));
                } else {
                    eprintln!("Error: Missing value for --input");
                    process::exit(1);
                }
            }
            "-o" | "--output" => {
                i += 1;
                if i < args.len() {
                    output_dir = Some(PathBuf::from(&args[i]));
                } else {
                    eprintln!("Error: Missing value for --output");
                    process::exit(1);
                }
            }
            "-m" | "--models" => {
                i += 1;
                if i < args.len() {
                    input_paths.push(PathBuf::from(&args[i]));
                } else {
                    eprintln!("Error: Missing value for --models");
                    process::exit(1);
                }
            }
            "-s" | "--sprites" => {
                i += 1;
                if i < args.len() {
                    input_paths.push(PathBuf::from(&args[i]));
                } else {
                    eprintln!("Error: Missing value for --sprites");
                    process::exit(1);
                }
            }
            "--output-client-data" => {
                i += 1;
                if i < args.len() {
                    output_client_data = Some(PathBuf::from(&args[i]));
                } else {
                    eprintln!("Error: Missing value for --output-client-data");
                    process::exit(1);
                }
            }
            "--output-client-src" => {
                i += 1;
                if i < args.len() {
                    output_client_src = Some(PathBuf::from(&args[i]));
                } else {
                    eprintln!("Error: Missing value for --output-client-src");
                    process::exit(1);
                }
            }
            "--width" => {
                i += 1;
                if i < args.len() {
                    width = args[i]
                        .parse()
                        .unwrap_or_else(|_| {
                            eprintln!("Error: Invalid integer for --width");
                            process::exit(1);
                        });
                }
            }
            "--height" => {
                i += 1;
                if i < args.len() {
                    height = args[i]
                        .parse()
                        .unwrap_or_else(|_| {
                            eprintln!("Error: Invalid integer for --height");
                            process::exit(1);
                        });
                }
            }
            "--padding" => {
                i += 1;
                if i < args.len() {
                    padding = args[i]
                        .parse()
                        .unwrap_or_else(|_| {
                            eprintln!("Error: Invalid integer for --padding");
                            process::exit(1);
                        });
                }
            }
            "--css" => {
                generate_css = true;
            }
            other => {
                eprintln!("Unknown argument: {}", other);
                print_help();
                process::exit(1);
            }
        }
        i += 1;
    }

    if input_paths.is_empty() {
        eprintln!("Error: No input paths specified. Use --input <PATH> to specify input.");
        process::exit(1);
    }

    if output_dir.is_none() && output_client_data.is_none() && output_client_src.is_none() {
        eprintln!("Error: No output path specified. Use --output <PATH>.");
        process::exit(1);
    }

    println!("Loading assets from: {:?}", input_paths);
    let assets = match load_assets(&input_paths) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("Error: {}", e);
            process::exit(1);
        }
    };

    println!(
        "Loaded {} sprites, {} animation sets",
        assets.sprites.len(),
        assets.animations.len()
    );

    println!(
        "Packing into atlas (base dimensions: {}x{}, padding: {}px)...",
        width, height, padding
    );

    let output = match generate_atlas(&assets, width, height, padding, true) {
        Ok(o) => o,
        Err(e) => {
            eprintln!("Error: {}", e);
            process::exit(1);
        }
    };

    println!(
        "Successfully packed atlas: {}x{} with {} sprites, {} animations",
        output.width,
        output.height,
        output.manifest.sprites.len(),
        output.manifest.animations.len()
    );

    // Save to primary output directory if specified
    if let Some(ref out_dir) = output_dir {
        println!("Saving WebGL atlas to {}", out_dir.display());
        if let Err(e) = save_atlas_to_dir(&output, out_dir) {
            eprintln!("Error saving atlas to {}: {}", out_dir.display(), e);
            process::exit(1);
        }
    }

    // Save to client/data if specified
    if let Some(ref data_dir) = output_client_data {
        println!("Saving WebGL textures to {}", data_dir.display());
        if let Err(e) = std::fs::create_dir_all(data_dir) {
            eprintln!("Error creating directory {}: {}", data_dir.display(), e);
            process::exit(1);
        }
        let color_path = data_dir.join("sprites_webgl.png");
        let normal_path = data_dir.join("sprites_normal_webgl.png");
        if let Err(e) = save_png_fast(&output.color_atlas, &color_path) {
            eprintln!("Error writing {}: {}", color_path.display(), e);
            process::exit(1);
        }
        if let Err(e) = save_png_fast(&output.normal_atlas, &normal_path) {
            eprintln!("Error writing {}: {}", normal_path.display(), e);
            process::exit(1);
        }
    }

    // Save to client/src if specified
    if let Some(ref src_dir) = output_client_src {
        println!("Saving WebGL manifest to {}", src_dir.display());
        if let Err(e) = std::fs::create_dir_all(src_dir) {
            eprintln!("Error creating directory {}: {}", src_dir.display(), e);
            process::exit(1);
        }
        let json_path = src_dir.join("sprites_webgl.json");
        let json_bytes = match serde_json::to_vec(&output.manifest) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("Error serializing JSON manifest: {}", e);
                process::exit(1);
            }
        };
        if let Err(e) = std::fs::write(&json_path, json_bytes) {
            eprintln!("Error writing {}: {}", json_path.display(), e);
            process::exit(1);
        }
    }

    // Generate CSS preview spritesheet if requested
    if generate_css {
        println!("Generating CSS preview spritesheet...");
        match generate_css_spritesheet(&assets, 631, 631) {
            Ok((css_atlas, css_manifest)) => {
                if let Some(ref out_dir) = output_dir {
                    let css_png_path = out_dir.join("sprites_css.png");
                    let css_json_path = out_dir.join("sprites_css.json");
                    let _ = save_png_fast(&css_atlas, &css_png_path);
                    if let Ok(b) = serde_json::to_vec(&css_manifest) {
                        let _ = std::fs::write(css_json_path, b);
                    }
                }
                if let Some(ref data_dir) = output_client_data {
                    let css_png_path = data_dir.join("sprites_css.png");
                    let _ = save_png_fast(&css_atlas, &css_png_path);
                }
                if let Some(ref src_dir) = output_client_src {
                    let ui_dir = src_dir.join("ui");
                    let _ = std::fs::create_dir_all(&ui_dir);
                    let css_json_path = ui_dir.join("sprites_css.json");
                    if let Ok(b) = serde_json::to_vec(&css_manifest) {
                        let _ = std::fs::write(css_json_path, b);
                    }
                }
            }
            Err(e) => {
                eprintln!("Warning: Failed to generate CSS preview: {}", e);
            }
        }
    }

    println!("Sprite packing complete!");
}
