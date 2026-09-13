"""Preserve originals, restore 4x, then export 3840px masters and app-sized assets.

Requires Pillow and the official Real-ESRGAN ncnn Windows release outside the repo.
Run from any directory. No source assets are overwritten without --apply.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'mobile/assets'
OUT = ROOT / 'output/image-upscale'

def resized(im, edge):
    ratio = edge / max(im.size)
    return im.resize((max(1, round(im.width * ratio)), max(1, round(im.height * ratio))), Image.Resampling.LANCZOS)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--engine', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    records = []
    manifest = OUT / 'manifest.json'
    previous = {row['file']: row for row in json.loads(manifest.read_text())} if manifest.exists() else {}
    sources = sorted(p for p in ASSETS.rglob('*') if p.suffix.lower() in {'.jpg', '.jpeg', '.png'})
    for i, source in enumerate(sources):
        relative = source.relative_to(ASSETS)
        original = OUT / 'originals' / relative
        original.parent.mkdir(parents=True, exist_ok=True)
        if not original.exists():
            shutil.copy2(source, original)
        saved = previous.get(relative.as_posix())
        if saved and saved['original_sha256'] == hashlib.sha256(original.read_bytes()).hexdigest():
            try:
                for path, expected in [(OUT / 'app' / relative, saved['app']),
                                       (OUT / 'masters-4k' / relative.with_suffix('.png'), saved['master'])]:
                    with Image.open(path) as check:
                        assert list(check.size) == expected
                        check.verify()
                records.append(saved)
                print(f'{i+1}/{len(sources)} {relative} cached', flush=True)
                continue
            except (OSError, AssertionError):
                pass
        with Image.open(original) as opened:
            image = ImageOps.exif_transpose(opened).copy()
        size = image.size
        # Preserve alpha and flat app-icon geometry with deterministic resampling.
        method = 'Lanczos (flat app icon; preserves alpha)'
        if source.suffix.lower() in {'.jpg', '.jpeg'}:
            restored = OUT / 'restored' / relative.with_suffix('.png')
            restored.parent.mkdir(parents=True, exist_ok=True)
            if not restored.exists():
                command = [str(args.engine.resolve()), '-i', str(original), '-o', str(restored),
                           '-n', 'realesrgan-x4plus', '-m', 'models', '-t', '128', '-j', '1:1:1']
                result = subprocess.run(command, cwd=args.engine.parent, capture_output=True, timeout=900)
                if result.returncode or not restored.exists():
                    raise RuntimeError(f'Upscale failed for {relative}: {result.stderr.decode(errors="replace")[-600:]}')
            with Image.open(restored) as generated:
                restored_image = generated.convert('RGB')
            # Retain source texture and lettering; do not run face reconstruction.
            image = Image.blend(image.convert('RGB').resize(restored_image.size, Image.Resampling.LANCZOS), restored_image, .65)
            method = 'Real-ESRGAN x4plus 4x (65%) + source Lanczos (35%); Lanczos to 3840px'
        master = OUT / 'masters-4k' / relative.with_suffix('.png')
        master.parent.mkdir(parents=True, exist_ok=True)
        resized(image, 3840).save(master, compress_level=3)
        edge = 1536 if source.name.startswith(('onboard', 'orbit')) else 1024
        if source.name.startswith(('avatar', 'author', 'profile', 'friend', 'joshua')):
            edge = 512
        if source.name == 'favicon.png':
            edge = 192
        app = OUT / 'app' / relative
        app.parent.mkdir(parents=True, exist_ok=True)
        optimized = resized(image, edge)
        if source.suffix.lower() in {'.jpg', '.jpeg'}:
            optimized.convert('RGB').save(app, quality=90, subsampling=0, optimize=True, progressive=True)
        else:
            optimized.save(app, optimize=True)
        records.append({'file': relative.as_posix(), 'original': list(size), 'master': list(resized_dimensions(size, 3840)),
                        'app': list(optimized.size), 'method': method, 'original_sha256': hashlib.sha256(original.read_bytes()).hexdigest(),
                        'app_bytes': app.stat().st_size})
        (OUT / 'manifest.json').write_text(json.dumps(records, indent=2), encoding='utf-8')
        print(f'{i+1}/{len(sources)} {relative} ready', flush=True)
    if args.apply:
        for record in records:
            shutil.copy2(OUT / 'app' / record['file'], ASSETS / record['file'])
        print('Applied all validated image exports.', flush=True)

def resized_dimensions(size, edge):
    return tuple(max(1, round(n * edge / max(size))) for n in size)

if __name__ == '__main__':
    main()
