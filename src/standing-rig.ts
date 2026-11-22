import * as THREE from 'three'

/** The lobby and dialogue cameras use metres from the soles of a 1.8 m figure. */
export function standingRig(rig: THREE.Group) {
  const group = new THREE.Group()
  rig.updateMatrixWorld(true)
  const bounds = new THREE.Box3().setFromObject(rig,true)
  const center = bounds.getCenter(new THREE.Vector3())
  const scale = 1.8/Math.max(.01,bounds.max.y-bounds.min.y)
  rig.scale.multiplyScalar(scale)
  rig.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale)
  group.add(rig)
  group.updateMatrixWorld(true)
  return group
}

export function disposeFigure(group: THREE.Group) {
  const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>(), skeletons = new Set<THREE.Skeleton>()
  group.traverse(node=>{
    if (!(node instanceof THREE.Mesh)) return
    geometry.add(node.geometry)
    for(const material of ([] as THREE.Material[]).concat(node.material))materials.add(material)
    if(node instanceof THREE.SkinnedMesh)skeletons.add(node.skeleton)
  })
  for(const material of materials){
    for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value)
    material.dispose()
  }
  for(const tex of textures)tex.dispose()
  for(const g of geometry)g.dispose()
  for(const s of skeletons)s.dispose()
}
