# Image restoration exports

All 75 original local image assets are preserved under `originals/`.

- `masters-4k/`: PNG masters with a 3840-pixel longest edge and the original aspect ratio.
- `app/`: smaller JPEG/PNG exports for use in the app.
- `restored/`: intermediate 4x AI restoration results.
- `manifest.json`: source dimensions, output dimensions, methods, original checksums, and app file sizes.

These are upscaled originals, not newly photographed or natively rendered 4K artwork. Many sources are tiny crops from screenshots. Upscaling cannot recover missing lettering or exact facial detail. The restoration uses Real-ESRGAN x4plus blended with the original image to retain source texture. Flat PNG app icons use Lanczos resizing to preserve geometry and transparency. There is no face replacement or separate face-generation step.

The application uses optimized exports rather than downloading the full masters. This directory is excluded from Vercel uploads.

Engine: https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan
Release: https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0

The reproducible processing script is `mobile/scripts/upscale-assets.py`. Run without `--apply` to stage results; use `--apply` only after visual review.
