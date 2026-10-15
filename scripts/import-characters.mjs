#!/usr/bin/env node
/**
 * Builds game-ready character models from the free Quaternius packs (all CC0):
 *   - Modular Character Outfits - Fantasy[Standard].zip
 *   - Universal Base Characters[Standard].zip
 *   - Universal Animation Library[Standard].zip
 *
 * Every part in these packs is skinned to the same 65-bone skeleton, so no Blender step is needed:
 * outfit + head (cut from the base body) + hair are merged onto one skeleton, textures are shrunk to
 * WebP and meshes are meshopt-compressed. Animations go into one shared file that three.js plays on
 * any of the characters, because it binds tracks by bone name.
 *
 * Usage: npm run import:characters [-- --from ~/Downloads]
 * Output: public/models/characters/*.glb, public/models/animations.glb
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { compactPrimitive, copyToDocument, dedup, meshopt, prune, resample, textureCompress, unpartition } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'

/** Which outfit, body and hairstyles make up each character. */
const CHARACTERS = [
  { name: 'player', outfit: 'Male_Ranger', body: 'Superhero_Male_FullBody', hair: [] },
  { name: 'thug-1', outfit: 'Male_Peasant', body: 'Superhero_Male_FullBody', hair: ['Hair_Buzzed', 'Hair_Beard'] },
  { name: 'thug-2', outfit: 'Male_Peasant', body: 'Superhero_Male_FullBody', hair: ['Hair_SimpleParted'] },
  { name: 'thug-3', outfit: 'Female_Peasant', body: 'Superhero_Female_FullBody', hair: ['Hair_Buns'] },
]

/** Clips copied from the animation library. Run with --list-clips to see all of them. */
const CLIPS = [
  'Idle_Loop', 'Jog_Fwd_Loop', 'Jump_Loop',
  'Pistol_Aim_Up', 'Pistol_Aim_Neutral', 'Pistol_Aim_Down', 'Pistol_Shoot', 'Pistol_Reload',
  'Hit_Chest', 'Death01',
]

/** Bones the head is cut along. Every triangle whose vertices are mostly driven by these is kept. */
const HEAD_BONES = new Set(['Head', 'neck_01'])
/** Only these bones keep their translation tracks; the rest keep the model's own bone lengths. */
const TRANSLATED_BONES = new Set(['root', 'pelvis'])

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const OUT_DIR = path.join(ROOT, 'public/models')

const args = process.argv.slice(2)
const fromDir = path.resolve(args.includes('--from') ? args[args.indexOf('--from') + 1] : path.join(os.homedir(), 'Downloads'))
const listClipsOnly = args.includes('--list-clips')

const PACKS = {
  outfits: /^Modular Character Outfits - Fantasy.*\.zip$/,
  bases: /^Universal Base Characters.*\.zip$/,
  anims: /^Universal Animation Library.*\.zip$/,
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })

function findZip(pattern) {
  const hit = fs.readdirSync(fromDir).filter((f) => pattern.test(f)).sort().pop()
  if (!hit) throw new Error(`No file matching ${pattern} in ${fromDir}. Download it from quaternius.itch.io and try again.`)
  return path.join(fromDir, hit)
}

/** Every file under dir with this exact name. */
function findFiles(dir, name) {
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name === name)
    .map((e) => path.join(e.parentPath, e.name))
}

const findFile = (dir, name) => findFiles(dir, name)[0] ?? null

/** Packs ship several exports of the same model; prefer the one whose path contains preferDir. */
function findGltf(dir, stem, preferDir) {
  const hits = [...findFiles(dir, `${stem}.gltf`), ...findFiles(dir, `${stem}.glb`)]
  const hit = hits.find((h) => preferDir && h.includes(preferDir)) ?? hits[0]
  if (!hit) throw new Error(`Could not find ${stem}.gltf in the extracted packs`)
  return hit
}

/**
 * Read a .gltf, first repairing texture links that point at files the pack doesn't ship
 * (e.g. Universal Base Characters references T_Hair_1_Normal_png.png but ships T_Hair_1_Normal.png).
 */
async function readModel(file, packDir) {
  if (file.endsWith('.gltf')) {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (const image of json.images ?? []) {
      if (!image.uri || image.uri.startsWith('data:')) continue
      const expected = path.join(path.dirname(file), decodeURIComponent(image.uri))
      if (fs.existsSync(expected)) continue
      const base = path.basename(expected)
      const candidates = [base.replace(/_png\.png$/i, '.png'), base]
      const found = candidates.map((c) => findFile(packDir, c)).find(Boolean)
      if (!found) throw new Error(`${path.basename(file)} needs ${base}, which is not in the pack`)
      fs.copyFileSync(found, expected)
      console.log(`  repaired missing texture ${base} (using ${path.basename(found)})`)
    }
  }
  return io.read(file)
}

function armatureByName(doc) {
  const map = new Map()
  for (const skin of doc.getRoot().listSkins()) for (const joint of skin.listJoints()) map.set(joint.getName(), joint)
  return map
}

/** Delete every triangle not driven mostly by HEAD_BONES, leaving just the head and neck. */
function cutHead(node) {
  const joints = node.getSkin().listJoints().map((j) => j.getName())
  for (const prim of node.getMesh().listPrimitives()) {
    const J = prim.getAttribute('JOINTS_0')
    const W = prim.getAttribute('WEIGHTS_0')
    const indices = prim.getIndices()
    const keepVertex = new Uint8Array(J.getCount())
    const j = [0, 0, 0, 0]
    const w = [0, 0, 0, 0]
    for (let v = 0; v < J.getCount(); v++) {
      J.getElement(v, j)
      W.getElement(v, w)
      let best = 0
      for (let k = 1; k < 4; k++) if (w[k] > w[best]) best = k
      keepVertex[v] = HEAD_BONES.has(joints[j[best]]) ? 1 : 0
    }
    const src = indices.getArray()
    const kept = []
    for (let t = 0; t < src.length; t += 3) {
      if (keepVertex[src[t]] && keepVertex[src[t + 1]] && keepVertex[src[t + 2]]) kept.push(src[t], src[t + 1], src[t + 2])
    }
    indices.setArray(new Uint32Array(kept))
    compactPrimitive(prim)
  }
}

/**
 * Copy skinned mesh nodes from another document into `target`, re-binding them to the target's
 * skeleton by bone name. Each part keeps its own inverse bind matrices, so it stays attached to
 * the right bones even if its bind pose differs slightly.
 */
function addParts(target, source, nodes) {
  const bones = armatureByName(target)
  const scene = target.getRoot().getDefaultScene() ?? target.getRoot().listScenes()[0]
  const bindMatrices = nodes.map((n) => n.getSkin().getInverseBindMatrices())
  const map = copyToDocument(target, source, [...nodes, ...bindMatrices])
  for (const srcNode of nodes) {
    const node = map.get(srcNode)
    const srcSkin = srcNode.getSkin()
    node.getSkin()?.dispose()
    const skin = target.createSkin(srcSkin.getName()).setInverseBindMatrices(map.get(srcSkin.getInverseBindMatrices()))
    for (const joint of srcSkin.listJoints()) {
      const bone = bones.get(joint.getName())
      if (!bone) throw new Error(`Bone ${joint.getName()} missing from target skeleton`)
      skin.addJoint(bone)
    }
    node.setSkin(skin)
    scene.addChild(node)
  }
  // The copy brought a duplicate skeleton along; drop every copied node that is not a mesh we placed.
  const placed = new Set(nodes.map((n) => map.get(n)))
  for (const copied of map.values()) {
    if (copied.propertyType === 'Node' && !placed.has(copied)) copied.dispose()
  }
}

async function optimize(doc) {
  await doc.transform(
    unpartition(),
    dedup(),
    prune(),
    // Normal and ORM maps can be smaller than colour without visible loss at game distances.
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], slots: /^(normalTexture|occlusionTexture|metallicRoughnessTexture)$/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  )
}

async function buildCharacter(def, dirs) {
  const outfitPath = findGltf(dirs.outfits, def.outfit, 'Exports/glTF (Godot-Unreal)/Outfits')
  const doc = await readModel(outfitPath, dirs.outfits)

  const body = await readModel(findGltf(dirs.bases, def.body), dirs.bases)
  const bodyNodes = body.getRoot().listNodes().filter((n) => n.getMesh() && n.getSkin())
  for (const n of bodyNodes) if (!/^(Eyes|Eyebrows)/.test(n.getName())) cutHead(n)
  addParts(doc, body, bodyNodes)

  for (const hair of def.hair) {
    const src = await readModel(findGltf(dirs.bases, hair, 'Hairstyles/Rigged to Head Bone'), dirs.bases)
    addParts(doc, src, src.getRoot().listNodes().filter((n) => n.getMesh() && n.getSkin()))
  }

  await optimize(doc)
  const skins = doc.getRoot().listSkins()
  const meshes = doc.getRoot().listNodes().filter((n) => n.getMesh())
  const allOnOneSkeleton = skins.every((s) => s.listJoints().every((j) => j.getParentNode() !== null || j.getName() === 'root'))
  if (!allOnOneSkeleton) throw new Error(`${def.name}: a part is bound to a detached skeleton`)

  const out = path.join(OUT_DIR, 'characters', `${def.name}.glb`)
  await io.write(out, doc)
  return { out, meshes: meshes.length }
}

async function buildAnimations(dirs) {
  const src = findFile(dirs.anims, 'UAL1_Standard.glb')
  if (!src) throw new Error('UAL1_Standard.glb not found in the animation pack')
  const doc = await io.read(src)
  const root = doc.getRoot()
  const available = root.listAnimations().map((a) => a.getName())
  if (listClipsOnly) return { available }

  const missing = CLIPS.filter((c) => !available.includes(c))
  if (missing.length) throw new Error(`Clips missing from the animation pack: ${missing.join(', ')}`)

  for (const anim of root.listAnimations()) {
    if (!CLIPS.includes(anim.getName())) {
      // Samplers must go too, or they keep their keyframe data alive through prune().
      for (const sampler of anim.listSamplers()) sampler.dispose()
      anim.dispose()
      continue
    }
    for (const channel of anim.listChannels()) {
      const keep = channel.getTargetPath() === 'rotation' ||
        (channel.getTargetPath() === 'translation' && TRANSLATED_BONES.has(channel.getTargetNode()?.getName()))
      if (!keep) {
        channel.getSampler()?.dispose()
        channel.dispose()
      }
    }
  }
  // The library ships with a preview mannequin; keep only the bones the clips animate.
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) prim.dispose()
    mesh.dispose()
  }
  for (const node of root.listNodes()) if (!node.listChildren().length && !node.getName()) node.dispose()
  for (const skin of root.listSkins()) skin.dispose()

  await doc.transform(resample(), prune({ keepLeaves: true }), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
  const out = path.join(OUT_DIR, 'animations.glb')
  await io.write(out, doc)
  return { out, clips: root.listAnimations().map((a) => a.getName()), available }
}

const kb = (file) => `${Math.round(fs.statSync(file).size / 1024)} KB`

async function main() {
  await MeshoptEncoder.ready
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'quaternius-'))
  try {
    const dirs = {}
    for (const [key, pattern] of Object.entries(PACKS)) {
      if (listClipsOnly && key !== 'anims') continue
      const zip = findZip(pattern)
      dirs[key] = path.join(tmp, key)
      fs.mkdirSync(dirs[key])
      // Only the glTF/GLB exports are needed; skip the FBX copies and the loose texture folders.
      // (stderr is muted: unzip warns about exclude patterns a given pack doesn't contain.)
      execFileSync('unzip', ['-q', zip, '-x', '*.fbx', '*/Textures/*', '*Setup.png', '-d', dirs[key]], { stdio: ['ignore', 'inherit', 'ignore'] })
      console.log(`unzipped ${path.basename(zip)}`)
    }

    if (listClipsOnly) {
      const { available } = await buildAnimations(dirs)
      console.log(`\n${available.length} clips:\n  ${available.join('\n  ')}`)
      return
    }

    fs.mkdirSync(path.join(OUT_DIR, 'characters'), { recursive: true })
    for (const def of CHARACTERS) {
      const { out, meshes } = await buildCharacter(def, dirs)
      console.log(`  ${path.relative(ROOT, out)}  ${kb(out)}  (${meshes} meshes)`)
    }
    const anims = await buildAnimations(dirs)
    console.log(`  ${path.relative(ROOT, anims.out)}  ${kb(anims.out)}  (${anims.clips.length} of ${anims.available.length} clips)`)

    fs.writeFileSync(
      path.join(OUT_DIR, 'CREDITS.txt'),
      'Character models and animations by Quaternius (quaternius.com), CC0 1.0 Universal.\n' +
        'Packs: Modular Character Outfits - Fantasy, Universal Base Characters, Universal Animation Library.\n',
    )
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(`\nimport failed: ${err.message}`)
  if (process.env.DEBUG) console.error(err.stack)
  process.exit(1)
})
