from __future__ import annotations

from tools import compare_render


def test_build_parser_exposes_match_frustum_and_regress() -> None:
    parser = compare_render.build_parser()

    match_args = parser.parse_args(["match-frustum", "--frames", "2"])
    regress_args = parser.parse_args([
        "regress",
        "--baseline",
        "baseline.csv",
        "--new",
        "new.csv",
    ])

    assert match_args.command == "match-frustum"
    assert match_args.frames == 2
    assert match_args.func is compare_render.cmd_match_frustum
    assert regress_args.command == "regress"
    assert regress_args.func is compare_render.cmd_regress


def test_luma_hist_intersection_identical_images_is_one() -> None:
    import numpy as np

    img = np.full((4, 4, 3), 127, dtype=np.uint8)
    score = compare_render._luma_hist_intersection(img, img)
    assert score == 1.0


def test_regression_failures_detect_worse_metrics() -> None:
    baseline = [
        {
            "frame": "0",
            "camera_id": "170",
            "deltae76_mean_full_frame": "1.0",
            "deltae76_p95_full_frame": "2.0",
            "ssim_luma": "0.98",
            "psnr_db": "35.0",
            "hist_intersection_luma_64": "0.95",
        }
    ]
    new = [
        {
            "frame": "0",
            "camera_id": "170",
            "deltae76_mean_full_frame": "1.2",
            "deltae76_p95_full_frame": "2.5",
            "ssim_luma": "0.96",
            "psnr_db": "32.0",
            "hist_intersection_luma_64": "0.90",
        }
    ]

    failures = compare_render._regression_failures(baseline, new)

    assert any("deltae76_mean_full_frame" in failure for failure in failures)
    assert any("deltae76_p95_full_frame" in failure for failure in failures)
    assert any("ssim_luma" in failure for failure in failures)
    assert any("psnr_db" in failure for failure in failures)
    assert any("hist_intersection_luma_64" in failure for failure in failures)


def test_regression_failures_allow_improvements() -> None:
    baseline = [
        {
            "frame": "0",
            "camera_id": "170",
            "deltae76_mean_full_frame": "1.0",
            "deltae76_p95_full_frame": "2.0",
            "ssim_luma": "0.98",
            "psnr_db": "35.0",
            "hist_intersection_luma_64": "0.95",
        }
    ]
    new = [
        {
            "frame": "0",
            "camera_id": "170",
            "deltae76_mean_full_frame": "0.8",
            "deltae76_p95_full_frame": "1.8",
            "ssim_luma": "0.99",
            "psnr_db": "36.0",
            "hist_intersection_luma_64": "0.97",
        }
    ]

    assert compare_render._regression_failures(baseline, new) == []


def test_regression_failures_detect_missing_new_row() -> None:
    baseline = [
        {
            "frame": "0",
            "camera_id": "170",
            "deltae76_mean_full_frame": "1.0",
            "deltae76_p95_full_frame": "2.0",
            "ssim_luma": "0.98",
            "psnr_db": "35.0",
            "hist_intersection_luma_64": "0.95",
        },
        {
            "frame": "1",
            "camera_id": "170",
            "deltae76_mean_full_frame": "1.1",
            "deltae76_p95_full_frame": "2.1",
            "ssim_luma": "0.97",
            "psnr_db": "34.0",
            "hist_intersection_luma_64": "0.94",
        },
    ]
    new = [baseline[0]]

    failures = compare_render._regression_failures(baseline, new)

    assert any("missing new row" in failure for failure in failures)


def test_target_failures_reports_subset_threshold_misses() -> None:
    failures = compare_render._target_failures(
        {
            "deltae76_mean_full_frame": 1.2,
            "deltae76_p95_full_frame": 3.5,
            "ssim_luma": 0.9,
            "psnr_db": 30.0,
            "hist_intersection_luma_64": 0.8,
        }
    )

    assert failures == [
        "deltae76_mean_full_frame>1.0",
        "deltae76_p95_full_frame>3.0",
        "ssim_luma<0.97",
        "psnr_db<32.0",
        "hist_intersection_luma_64<0.92",
    ]
