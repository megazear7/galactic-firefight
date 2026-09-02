import * as THREE from "three";

const MAP_KEYS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "emissiveMap",
  "bumpMap",
  "displacementMap",
  "alphaMap",
] as const;

type Tinted = { mat: THREE.Material; refs: number };

const tinted = new Map<string, Tinted>();
const originalScenes = new Map<string, THREE.Object3D>();

function materialKey(mat: THREE.Material, tint: number) {
  return `${mat.uuid}:${tint.toFixed(3)}`;
}

export function retainTint(material: THREE.Material, tint: number): THREE.Material {
  if (tint === 1) return material;
  const key = materialKey(material, tint);
  let hit = tinted.get(key);
  if (!hit) {
    const copy = material.clone();
    const colored = copy as THREE.MeshStandardMaterial;
    if (colored.color) colored.color.multiplyScalar(tint);
    hit = { mat: copy, refs: 0 };
    tinted.set(key, hit);
  }
  hit.refs += 1;
  return hit.mat;
}

export function retainTints(material: THREE.Material | THREE.Material[], tint: number) {
  return Array.isArray(material) ? material.map((m) => retainTint(m, tint)) : retainTint(material, tint);
}

export function releaseTinted(material: THREE.Material | THREE.Material[]) {
  const list = Array.isArray(material) ? material : [material];
  for (const mat of list) {
    for (const [key, hit] of tinted) {
      if (hit.mat !== mat) continue;
      hit.refs -= 1;
      if (hit.refs <= 0) {
        hit.mat.dispose();
        tinted.delete(key);
      }
      break;
    }
  }
}

export function rememberGltfScene(url: string, scene: THREE.Object3D) {
  if (!originalScenes.has(url)) originalScenes.set(url, scene);
}

function disposeMaterialMaps(mat: THREE.Material) {
  const rec = mat as THREE.MeshStandardMaterial & Record<string, unknown>;
  for (const key of MAP_KEYS) {
    const tex = rec[key];
    if (tex && tex instanceof THREE.Texture) tex.dispose();
  }
  mat.dispose();
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat) continue;
      disposeMaterialMaps(mat);
    }
  });
}

export async function releaseBattleGltfs() {
  const entries = [...originalScenes.entries()];
  originalScenes.clear();
  for (const rec of tinted.values()) rec.mat.dispose();
  tinted.clear();
  for (const [, scene] of entries) disposeObject(scene);
  if (!entries.length) return;
  const { useGLTF } = await import("@react-three/drei");
  for (const [url] of entries) {
    try {
      useGLTF.clear(url);
    } catch {
      /* already gone */
    }
  }
}

export function trackedGltfUrls() {
  return [...originalScenes.keys()];
}

/** Dispose a SkeletonUtils clone without touching shared source geometry/textures. */
export function disposeClone(root: THREE.Object3D) {
  root.traverse((obj) => {
    const skinned = obj as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh && skinned.skeleton && typeof skinned.skeleton.dispose === "function") {
      skinned.skeleton.dispose();
    }
  });
}

export { disposeObject };
