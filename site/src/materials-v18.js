// Native standard PBR maps and color factors are exported by the Blender Master.
// Retain those material objects. Only renderer-specific sampling/environment
// settings are applied here; there is no photograph-projection replacement.
export function prepareExportedMaterials(model,{anisotropy=4,look={}}={}){
  model.traverse(node=>{
    if(!node.isMesh)return;
    for(const material of Array.isArray(node.material)?node.material:[node.material]){
      material.userData.masterMaterial=true;
      for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap']){
        if(material[key])material[key].anisotropy=anisotropy;
      }
      material.envMapIntensity=material.metalness>.5?(look.metalEnvIntensity??1.1):(look.envMapIntensity??.28);
    }
  });
}
