"""Allège models/ilot.glb après l'export (export_web.py), sans rien changer au rendu.
- Textures : PNG → WebP sans perte. L'alpha et la couleur de tout pixel qui n'est pas entièrement transparent sont
  vérifiés identiques ; seule la couleur sous un alpha nul est libre (WebP la choisit pour mieux compresser) : sur le
  sol, l'alpha porte la distance au bord de l'herbe, et là où il est nul (à plus de 0,5 m hors de l'herbe) le shader
  multiplie la couleur par un masque nul (js/hero.js, blendIntoPage). Extension glTF EXT_texture_webp (three.js la
  lit) ; la texture n'a plus de PNG de secours.
Le tampon binaire est reconstruit (vues alignées sur 4 octets).
Usage : python3 blender/scripts/optimise_glb.py [models/ilot.glb]   (demande cwebp : brew install webp)"""
import io, json, os, struct, subprocess, sys, tempfile
from PIL import Image

PATH = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "..", "models", "ilot.glb")

raw = open(PATH, "rb").read()
magic, version, _ = struct.unpack("<4sII", raw[:12])
assert magic == b"glTF" and version == 2
jlen = struct.unpack("<I", raw[12:16])[0]
j = json.loads(raw[20:20 + jlen])
blen = struct.unpack("<I", raw[20 + jlen:24 + jlen])[0]
binc = raw[28 + jlen:28 + jlen + blen]
views = [binc[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]] for v in j["bufferViews"]]

# ------------------------------------------------------------------ textures en WebP sans perte
webp_images = set()
for i, im in enumerate(j.get("images", [])):
    if im.get("mimeType") != "image/png":
        continue
    png = views[im["bufferView"]]
    with tempfile.TemporaryDirectory() as d:
        src, dst = os.path.join(d, "a.png"), os.path.join(d, "a.webp")
        open(src, "wb").write(png)
        subprocess.run(["cwebp", "-quiet", "-lossless", "-z", "9", "-mt", src, "-o", dst], check=True)
        webp = open(dst, "rb").read()
    a = Image.open(io.BytesIO(png)).convert("RGBA").tobytes()
    b = Image.open(io.BytesIO(webp)).convert("RGBA").tobytes()
    assert all(a[k + 3] == b[k + 3] and (a[k + 3] == 0 or a[k:k + 3] == b[k:k + 3]) for k in range(0, len(a), 4)), \
        "WebP différent du PNG"
    if len(webp) >= len(png):
        continue
    views[im["bufferView"]] = webp
    im["mimeType"] = "image/webp"
    webp_images.add(i)
    print(f"texture {im.get('name')} : PNG {len(png) // 1024} Ko → WebP {len(webp) // 1024} Ko (pixels visibles identiques)")
for t in j.get("textures", []):
    if t.get("source") in webp_images:
        t.setdefault("extensions", {})["EXT_texture_webp"] = {"source": t.pop("source")}
if webp_images:
    for key in ("extensionsUsed", "extensionsRequired"):
        j[key] = sorted(set(j.get(key, [])) | {"EXT_texture_webp"})

# ------------------------------------------------------------------ reconstruction
out_bin = bytearray()
for v, data in zip(j["bufferViews"], views):
    out_bin += b"\0" * (-len(out_bin) % 4)
    v["byteOffset"] = len(out_bin)
    v["byteLength"] = len(data)
    out_bin += data
out_bin += b"\0" * (-len(out_bin) % 4)
j["buffers"][0]["byteLength"] = len(out_bin)
js = json.dumps(j, separators=(",", ":"), ensure_ascii=False).encode()
js += b" " * (-len(js) % 4)
glb = struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + 8 + len(out_bin))
glb += struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(out_bin), b"BIN\0") + bytes(out_bin)
open(PATH, "wb").write(glb)
print(f"{os.path.basename(PATH)} : {len(raw) // 1024} Ko → {len(glb) // 1024} Ko")
