// Use the actual UV/albedo/normal/vertex-blush material embedded in the GLB.
// The same base appearance is available in Blender and other viewers.
export function plushMaterial(source,{face=false}={}){
  const material=source.clone();
  material.name=face?'PBR_Short_Pile_Face':'PBR_Fine_Boucle';
  material.userData.surfaceTexture=true;
  material.roughness=face ? .96 : .98;
  material.normalScale.multiplyScalar(face ? .60 : .72);
  material.sheen=face ? .20 : .35;
  material.sheenRoughness=.95;
  material.envMapIntensity=.24;
  return material;
}
