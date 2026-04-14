"""UE5 editor Python script — export road PBR + detail textures to PNG.

Invoked via:
    UnrealEditor-Cmd CarlaUnreal.uproject \
        -run=PythonScript -script="export_road_textures.py" \
        -nullrhi -graphicsadapter=2 -unattended -nosplash

Output dir:
    carla-web/public/assets/carla/road/  (mirror structure per manifest)

Rationale: `-nullrhi` skips the full graphics pipeline so this can run on
a GPU 2 that's already hosting the live CARLA game. If RHI turns out to
be required by Texture2DExporter, this will error quickly rather than
contending for VRAM.
"""
import os
import unreal

OUT_ROOT = "/data1/song99/carla/carla-web/public/assets/carla/road"

TEXTURES = [
    # (ue5 content path, out subdir, out filename)
    ("/Game/Carla/Static/GenericMaterials/000_Masters/Textures/Roads/T_Asphalt01_d",
     "asphalt", "T_Asphalt01_d.png"),
    ("/Game/Carla/Static/GenericMaterials/000_Masters/Textures/Roads/T_Asphalt01_n",
     "asphalt", "T_Asphalt01_n.png"),
    ("/Game/Carla/Static/GenericMaterials/000_Masters/Textures/Roads/T_Asphalt01_r",
     "asphalt", "T_Asphalt01_r.png"),
    ("/Game/Carla/Static/GenericMaterials/000_Masters/Textures/Roads/T_Asphalt01_AO",
     "asphalt", "T_Asphalt01_AO.png"),
    ("/Game/Carla/Static/GenericMaterials/000_Masters/Textures/Noises/T_MacroVariation01",
     "detail", "T_MacroVariation01.png"),
    ("/Game/Carla/Static/GenericMaterials/000_Masters/Textures/Roads/SurfaceFeature/T_CrackTileLarge_C",
     "detail", "T_CrackTileLarge_C.png"),
    ("/Game/Carla/Static/GenericMaterials/000_Masters/Textures/Roads/SurfaceFeature/T_CrackTileLarge_N",
     "detail", "T_CrackTileLarge_N.png"),
]


def export_one(asset_path, out_dir, out_name):
    asset = unreal.EditorAssetLibrary.load_asset(asset_path)
    if asset is None:
        unreal.log_warning(f"[road-export] missing: {asset_path}")
        return False
    os.makedirs(out_dir, exist_ok=True)
    target = os.path.join(out_dir, out_name)

    task = unreal.AssetExportTask()
    task.set_editor_property("automated", True)
    task.set_editor_property("object", asset)
    task.set_editor_property("filename", target)
    task.set_editor_property("replace_identical", True)
    task.set_editor_property("prompt", False)
    task.set_editor_property("use_file_archive", True)
    task.set_editor_property("write_empty_files", False)

    # Texture2DExporter.PNG is the built-in PNG path; it falls back to the
    # source art if the compressed RHI data isn't accessible (nullrhi).
    exporter = unreal.TextureExporterPNG()
    task.set_editor_property("exporter", exporter)

    result = unreal.Exporter.run_asset_export_task(task)
    if not result:
        unreal.log_warning(f"[road-export] export failed: {asset_path}")
        return False
    unreal.log(f"[road-export] wrote {target}")
    return True


def main():
    ok = 0
    for path, sub, name in TEXTURES:
        out_dir = os.path.join(OUT_ROOT, sub)
        if export_one(path, out_dir, name):
            ok += 1
    unreal.log(f"[road-export] exported {ok}/{len(TEXTURES)} textures")


main()
