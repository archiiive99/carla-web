"""Server-side color-fidelity audit utilities for the CARLA → browser bridge.

Owned by Agent C. Read the spec in the Agent-C /loop prompt before editing.
Public entry points:

    color.rgb_to_lab, color.delta_e_76
    metrics.psnr, metrics.ssim
    codec_bench.bench_codecs
    run_audit.main  (CLI: python -m tools.color_fidelity.run_audit ...)
"""
