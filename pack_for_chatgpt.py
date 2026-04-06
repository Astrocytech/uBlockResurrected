#!/usr/bin/env python3
"""
pack_for_chatgpt.py - Package uBlock MV3 extension files for ChatGPT diagnostics.

Usage: python3 pack_for_chatgpt.py

Output: Multiple pack_*.txt files in the packaging/ directory (max 10 files, ≤3MB each).
"""

import os
import json
from pathlib import Path
from collections import OrderedDict

BASE_DIR = Path("/home/coka/Desktop/ASTROCYTECH/git_project/Blocker/temporary_folder/mv3-references/uBlock")
BUILD_DIR = BASE_DIR / "dist/build/uBlock0.chromium-mv3"
OUTPUT_DIR = BASE_DIR / "packaging"
MAX_SIZE_BYTES = 3 * 1024 * 1024  # 3MB

FILE_PACKS = OrderedDict([
    ("pack_1_manifest", [
        "dist/build/uBlock0.chromium-mv3/manifest.json",
    ]),
    ("pack_2_popup_html", [
        "dist/build/uBlock0.chromium-mv3/popup-fenix.html",
        "dist/build/uBlock0.chromium-mv3/popup-fenix.css",
    ]),
    ("pack_3_dashboard_html", [
        "dist/build/uBlock0.chromium-mv3/dashboard.html",
        "dist/build/uBlock0.chromium-mv3/settings.html",
        "dist/build/uBlock0.chromium-mv3/3p-filters.html",
        "dist/build/uBlock0.chromium-mv3/1p-filters.html",
    ]),
    ("pack_4_js_popup", [
        "dist/build/uBlock0.chromium-mv3/js/popup-fenix-bundle.js",
    ]),
    ("pack_5_js_messaging", [
        "dist/build/uBlock0.chromium-mv3/js/messaging-bundle.js",
    ]),
    ("pack_6_js_storage", [
        "dist/build/uBlock0.chromium-mv3/js/storage-bundle.js",
    ]),
    ("pack_7_js_vapi", [
        "dist/build/uBlock0.chromium-mv3/js/vapi.js",
        "dist/build/uBlock0.chromium-mv3/js/vapi-common.js",
        "dist/build/uBlock0.chromium-mv3/js/vapi-client.js",
    ]),
    ("pack_8_css", [
        "dist/build/uBlock0.chromium-mv3/css/common.css",
        "dist/build/uBlock0.chromium-mv3/css/popup-fenix.css",
    ]),
])


def ensure_output_dir():
    OUTPUT_DIR.mkdir(exist_ok=True)
    print(f"Output directory: {OUTPUT_DIR}")


def cleanup_old_files():
    if OUTPUT_DIR.exists():
        count = 0
        for f in OUTPUT_DIR.glob("*.txt"):
            f.unlink()
            count += 1
        if count > 0:
            print(f"Cleaned up {count} old .txt files")


def read_file(filepath):
    full_path = BASE_DIR / filepath
    if full_path.exists():
        try:
            with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
                return f.read()
        except Exception as e:
            return f"<!-- ERROR reading file: {e} -->"
    return None


def format_file_content(filepath, content):
    return f"=== FILE: {filepath} ===\n{content}\n"


def create_pack(pack_name, files):
    output_file = OUTPUT_DIR / f"{pack_name}.txt"
    
    all_content = []
    total_size = 0
    files_included = []
    files_missing = []
    
    for filepath in files:
        content = read_file(filepath)
        if content is not None:
            formatted = format_file_content(filepath, content)
            all_content.append(formatted)
            total_size += len(formatted.encode('utf-8'))
            files_included.append(filepath)
        else:
            files_missing.append(filepath)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(f"=== PACK: {pack_name} ===\n")
        f.write(f"=== DESCRIPTION: {get_pack_description(pack_name)} ===\n")
        f.write(f"=== FILE COUNT: {len(files_included)} included, {len(files_missing)} missing ===\n")
        f.write(f"=== TOTAL SIZE: {total_size:,} bytes ({total_size/1024:.1f} KB) ===\n")
        f.write("\n" + "="*60 + "\n\n")
        f.write("".join(all_content))
    
    print(f"  Created: {output_file.name} ({total_size:,} bytes, {len(files_included)} files)")
    return output_file, len(files_included), len(files_missing)


def get_pack_description(pack_name):
    descriptions = {
        "pack_1_manifest": "Extension manifest.json",
        "pack_2_popup_html": "Popup HTML and CSS",
        "pack_3_dashboard_html": "Dashboard and filter HTML pages",
        "pack_4_js_popup": "Popup JS bundle",
        "pack_5_js_messaging": "Messaging JS bundle",
        "pack_6_js_storage": "Storage JS bundle",
        "pack_7_js_vapi": "vAPI core files",
        "pack_8_css": "CSS styling files",
    }
    return descriptions.get(pack_name, "Miscellaneous files")


def create_index(packs_info):
    index_content = []
    index_content.append("=" * 70)
    index_content.append("INDEX - uBlock MV3 Extension Files for ChatGPT Diagnostics")
    index_content.append("=" * 70)
    index_content.append("")
    index_content.append(f"BASE DIRECTORY: {BASE_DIR}")
    index_content.append("")
    
    for pack_name, (filepath, included, missing) in packs_info.items():
        desc = get_pack_description(pack_name)
        index_content.append(f"{pack_name}.txt")
        index_content.append(f"  Description: {desc}")
        index_content.append(f"  Files: {included} included, {missing} missing")
        index_content.append(f"  Location: {filepath}")
        index_content.append("")
    
    index_content.append("=" * 70)
    index_content.append("USAGE INSTRUCTIONS")
    index_content.append("=" * 70)
    index_content.append("""
When asking ChatGPT to diagnose issues:

1. Share the relevant pack file(s) based on the issue:
   - Popup not working -> pack_1 + pack_2 + pack_4
   - Dashboard issues -> pack_1 + pack_3
   - Storage issues -> pack_1 + pack_6
   - CSS/Icons not showing -> pack_2 + pack_8

2. Provide context:
   - What extension feature is broken?
   - What error messages appear (if any)?
   - Which files are most relevant to the issue?

3. Ask specific questions about the shared files.
""")
    
    index_file = OUTPUT_DIR / "pack_INDEX.txt"
    with open(index_file, 'w', encoding='utf-8') as f:
        f.write("\n".join(index_content))
    
    print(f"\n  Created: pack_INDEX.txt (index file)")
    return index_file


def main():
    print("=" * 60)
    print("Packaging uBlock MV3 Extension Files for ChatGPT")
    print("=" * 60)
    
    ensure_output_dir()
    cleanup_old_files()
    
    packs_info = {}
    for pack_name, files in FILE_PACKS.items():
        print(f"\nCreating {pack_name}...")
        filepath, included, missing = create_pack(pack_name, files)
        packs_info[pack_name] = (filepath, included, missing)
    
    print("\n" + "=" * 60)
    print("Creating index file...")
    create_index(packs_info)
    
    print("\n" + "=" * 60)
    print("DONE! Files created in:")
    print(f"  {OUTPUT_DIR}")
    print("=" * 60)
    print("\nShare these .txt files with ChatGPT for diagnostics.")
    print("Start with pack_INDEX.txt to explain the structure.")


if __name__ == "__main__":
    main()
