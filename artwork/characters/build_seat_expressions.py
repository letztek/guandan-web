"""Append the registered FEZ shape deltas to an existing game seat GLB."""
from pathlib import Path
import hashlib
import json
import struct
import sys
import bpy
import numpy as np

slug, = sys.argv[sys.argv.index('--') + 1:]
assert slug in {'hanakomachi','high-waitress','athena'}, slug
path = Path(__file__).resolve().parents[2] / 'public/character' / (slug + '-seat.glb')
source = Path(bpy.data.filepath)
blob = path.read_bytes()
size = struct.unpack_from('<I', blob, 12)[0]
gltf = json.loads(blob[20:20+size])
extra = gltf['asset']['extras']
assert source.name == extra['source']
assert hashlib.sha256(source.read_bytes()).hexdigest() == extra['sourceSHA256']
data = bytearray(blob[28+size:28+size+gltf['buffers'][0]['byteLength']])
mesh = gltf['meshes'][0]
eyes = ['blink','blink_L','blink_R','blink_smile','blink_smile_L','blink_smile_R']
emotions = ['happy','relaxed','surprised','angry','sad']
names = ['EA_' + key for key in eyes+['aa','ih','ou','ee','oh']
         + [key+'_'+part for part in ['eye','mouth'] for key in emotions]
         + ['brow_'+key for key in emotions]]
assert len(names) == 26
if mesh['extras']['targetNames'] == ['gentleSmile', *names]:
    # Our sparse additions are appended to the original GLB. Recover that
    # prefix when rerunning on an already-built seat file.
    indices = {target['POSITION'] for p in mesh['primitives'] for target in p['targets'][1:]}
    first = min(indices)
    assert indices == set(range(first,len(gltf['accessors'])))
    views = {acc['sparse'][field]['bufferView'] for acc in gltf['accessors'][first:] if 'sparse' in acc for field in ['indices','values']}
    first_view = min(views)
    assert views == set(range(first_view,len(gltf['bufferViews'])))
    del gltf['accessors'][first:]
    del gltf['bufferViews'][first_view:]
    end = max(b.get('byteOffset',0)+b['byteLength'] for b in gltf['bufferViews'])
    del data[end:]
    mesh['extras']['targetNames'] = ['gentleSmile']
    mesh['weights'] = mesh['weights'][:1]
    for prim in mesh['primitives']: del prim['targets'][1:]
assert mesh['extras']['targetNames'] == ['gentleSmile']

def xyz(values):
    return np.column_stack((values[:,0], values[:,2], -values[:,1]))

def values(seq, attr, count, dim, dtype):
    result = np.empty(count*dim, dtype=dtype)
    seq.foreach_get(attr,result)
    return result.reshape(count,dim)

def view(contents):
    data.extend(b'\0' * (-len(data) % 4))
    result = len(gltf['bufferViews'])
    gltf['bufferViews'].append({'buffer':0,'byteOffset':len(data),'byteLength':len(contents)})
    data.extend(contents)
    return result

# Reproduce the original exporter's UV-seam/corner-normal expansion. The exact
# POSITION accessor check below rejects different rest meshes or vertex order.
scene = bpy.context.scene
arm = next(obj for obj in scene.objects if obj.type=='ARMATURE')
arm.data.pose_position='REST'
for obj in scene.objects:
    if obj.type=='MESH' and obj.data.shape_keys:
        for key in obj.data.shape_keys.key_blocks:
            key.value=0
bpy.context.view_layer.update()
deps=bpy.context.evaluated_depsgraph_get()
parts={}
for obj in scene.objects:
    if obj.type!='MESH' or obj.hide_render: continue
    evaluated=obj.evaluated_get(deps)
    m=evaluated.to_mesh(preserve_all_data_layers=True,depsgraph=deps)
    if not len(m.polygons):
        evaluated.to_mesh_clear()
        continue
    m.calc_loop_triangles()
    nv,nl,nt=len(m.vertices),len(m.loops),len(m.loop_triangles)
    co=values(m.vertices,'co',nv,3,'f4')
    matrix=np.array(obj.matrix_world)
    pos=xyz(co@matrix[:3,:3].T+matrix[:3,3]).astype('f4')
    keys=obj.data.shape_keys
    deltas={}
    if keys and 'EA_blink' in keys.key_blocks:
        blocks=keys.key_blocks
        assert all(name in blocks for name in names),(obj.name, list(blocks.keys()))
        basis=values(blocks['Basis'].data,'co',nv,3,'f4')
        assert np.max(np.abs(basis-co))<.0001
        for name in names:
            key=blocks[name]
            assert key.relative_key.name=='Basis',(obj.name,name,key.relative_key.name)
            deltas[name]=xyz((values(key.data,'co',nv,3,'f4')-basis)@matrix[:3,:3].T).astype('<f4')
    vi=values(m.loops,'vertex_index',nl,1,'i4').ravel()
    normal=xyz(values(m.corner_normals,'vector',nl,3,'f4')@np.linalg.inv(matrix[:3,:3]))
    normal/=np.linalg.norm(normal,axis=1)[:,None].clip(1e-8)
    uv=np.zeros((nl,2),'f4')
    if m.uv_layers.active: m.uv_layers.active.data.foreach_get('uv',uv.reshape(-1))
    uv[:,1]=1-uv[:,1]
    tri=values(m.loop_triangles,'loops',nt,3,'i4')
    mi=values(m.loop_triangles,'material_index',nt,1,'i4').ravel()
    for slot in np.unique(mi):
        rows=tri[mi==slot].ravel()
        corners=np.column_stack((vi[rows],np.round(normal[rows]*16000),np.round(uv[rows]*262144))).astype('i4')
        _,first=np.unique(corners,axis=0,return_index=True)
        vertices=vi[rows[first]]
        material=m.materials[slot].name if slot<len(m.materials) and m.materials[slot] else 'Skin'
        parts.setdefault(material,[]).append((pos[vertices],{name:d[vertices] for name,d in deltas.items()}))
    evaluated.to_mesh_clear()

per_name={key:0 for key in names}
nonzero_materials=[]
for prim in mesh['primitives']:
    material=gltf['materials'][prim['material']]['name']
    pieces=parts[material]
    pos=np.concatenate([positions for positions,_ in pieces])
    accessor=gltf['accessors'][prim['attributes']['POSITION']]
    byte0=gltf['bufferViews'][accessor['bufferView']]['byteOffset']+accessor.get('byteOffset',0)
    original=np.frombuffer(data[byte0:byte0+accessor['count']*12],'<f4').reshape(-1,3)
    assert np.array_equal(original,pos),(slug,material,pos.shape,original.shape)
    any_expression=any(bool(delta) for _,delta in pieces)
    if any_expression: nonzero_materials.append(material)
    count=len(pos)
    zero=None
    for name in names:
        delta=np.concatenate([d[name] if name in d else np.zeros_like(p) for p,d in pieces]) if any_expression else None
        changed=np.flatnonzero(np.any(delta!=0,axis=1)) if delta is not None else []
        if len(changed):
            d={'componentType':5126,'count':count,'type':'VEC3','min':delta.min(0).tolist(),'max':delta.max(0).tolist()}
            indices=changed.astype('<u2' if count<65536 else '<u4')
            d['sparse']={'count':len(indices),'indices':{'bufferView':view(indices.tobytes()),'componentType':5123 if count<65536 else 5125},
                         'values':{'bufferView':view(delta[changed].astype('<f4').tobytes())}}
            index=len(gltf['accessors']);gltf['accessors'].append(d)
            per_name[name]+=len(changed)
        else:
            if zero is None:
                zero=len(gltf['accessors']);gltf['accessors'].append({'componentType':5126,'count':count,'type':'VEC3','min':[0,0,0],'max':[0,0,0]})
            index=zero
        prim['targets'].append({'POSITION':index})
assert min(per_name.values())>0,(slug,per_name)
mesh['extras']['targetNames'].extend(names)
mesh['weights'].extend([0]*26)
gltf['buffers'][0]['byteLength']=len(data)
j=json.dumps(gltf,separators=(',',':')).encode()
j+=b' '*(-len(j)%4);data.extend(b'\0'*(-len(data)%4))
out=struct.pack('<4sII',b'glTF',2,28+len(j)+len(data))+struct.pack('<I4s',len(j),b'JSON')+j+struct.pack('<I4s',len(data),b'BIN\0')+data
tmp=path.with_suffix('.glb.tmp')
tmp.write_bytes(out);tmp.replace(path)
print('EXPRESSION-EXPORT',json.dumps({'slug':slug,'size':len(out),'materials':nonzero_materials,'changedVertices':per_name}))
